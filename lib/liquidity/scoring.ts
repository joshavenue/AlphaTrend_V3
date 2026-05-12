import type {
  DilutionRiskState,
  LiquidityState,
} from "@/generated/prisma/client";
import {
  T6_LIQUIDITY_ALGORITHM_VERSION,
  T6_LIQUIDITY_THRESHOLD_VERSION,
  T6_REASON_CODES,
  T6_THRESHOLDS,
} from "@/lib/liquidity/constants";
import type {
  FragilityState,
  LiquidityMetricsSnapshot,
  LiquidityScoreComponents,
  LiquidityScoreResult,
  LiquidityScoringInput,
  RiskVetoFlag,
} from "@/lib/liquidity/types";
import type { SecCompanySubmission } from "@/lib/providers/parsers";

function round(value: number | undefined, digits = 6) {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Number(value.toFixed(digits));
}

function clampRisk(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asDate(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function daysBetween(start: string | undefined, end: Date) {
  const parsed = asDate(start);

  if (!parsed) {
    return undefined;
  }

  return Math.floor((end.getTime() - parsed.getTime()) / 86_400_000);
}

function yearsBetween(start: string | undefined, end: Date) {
  const days = daysBetween(start, end);

  return days === undefined ? undefined : days / 365.25;
}

function latestFinancialPeriod(input: LiquidityScoringInput) {
  return [...input.financialPeriods]
    .filter((period) => period.periodEnd)
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd))[0];
}

function priorYearComparablePeriod(input: LiquidityScoringInput) {
  const latest = latestFinancialPeriod(input);

  if (!latest) {
    return undefined;
  }

  const latestDate = asDate(latest.periodEnd);

  if (!latestDate) {
    return undefined;
  }

  const sameType = input.financialPeriods.filter(
    (period) => period.periodType === latest.periodType,
  );

  if (latest.periodType === "quarter") {
    const sameFiscalPeriod = sameType.find(
      (period) =>
        period.periodEnd < latest.periodEnd &&
        period.fiscalPeriod &&
        period.fiscalPeriod === latest.fiscalPeriod,
    );

    if (sameFiscalPeriod) {
      return sameFiscalPeriod;
    }
  }

  return sameType
    .filter((period) => {
      const years = yearsBetween(period.periodEnd, latestDate);

      return years !== undefined && years >= 0.75 && years <= 1.35;
    })
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd))[0];
}

function shareCountGrowthYoy(input: LiquidityScoringInput) {
  const latest = latestFinancialPeriod(input);
  const prior = priorYearComparablePeriod(input);

  if (
    latest?.dilutedShares === undefined ||
    prior?.dilutedShares === undefined ||
    prior.dilutedShares <= 0
  ) {
    return undefined;
  }

  return latest.dilutedShares / prior.dilutedShares - 1;
}

function isRecentOffering(submission: SecCompanySubmission, asOfDate: Date) {
  const form = submission.form?.toUpperCase().trim();
  const days = daysBetween(submission.filingDate, asOfDate);

  if (
    days === undefined ||
    days < 0 ||
    days > T6_THRESHOLDS.recentOfferingLookbackDays
  ) {
    return false;
  }

  return (
    form === "S-1" ||
    form === "S-3" ||
    form === "S-1/A" ||
    form === "S-3/A" ||
    form === "424B1" ||
    form === "424B2" ||
    form === "424B3" ||
    form === "424B4" ||
    form === "424B5" ||
    form === "424B7" ||
    form === "424B8"
  );
}

function isRecentReverseSplit(
  submission: SecCompanySubmission,
  asOfDate: Date,
) {
  const days = daysBetween(submission.filingDate, asOfDate);

  if (
    days === undefined ||
    days < 0 ||
    days > T6_THRESHOLDS.reverseSplitLookbackYears * 365.25
  ) {
    return false;
  }

  const text = [
    submission.form,
    submission.primaryDocument,
    submission.accessionNumber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("reverse") && text.includes("split");
}

function liquidityState(input: LiquidityScoringInput): LiquidityState {
  const averageDollarVolume = input.averageDollarVolume20d;
  const marketCap = input.marketCap;

  if (
    averageDollarVolume !== undefined &&
    averageDollarVolume < T6_THRESHOLDS.illiquidAverageDollarVolumeMax
  ) {
    return "ILLIQUID";
  }

  if (
    input.priceDataStale ||
    averageDollarVolume === undefined ||
    marketCap === undefined
  ) {
    return "INSUFFICIENT_DATA";
  }

  if (
    marketCap >= T6_THRESHOLDS.coreMarketCapMin &&
    averageDollarVolume >= T6_THRESHOLDS.coreAverageDollarVolumeMin
  ) {
    return "CORE_ELIGIBLE";
  }

  if (
    marketCap >= T6_THRESHOLDS.expandedMarketCapMin &&
    averageDollarVolume >= T6_THRESHOLDS.expandedAverageDollarVolumeMin
  ) {
    return "EXPANDED_ELIGIBLE";
  }

  return "SPECULATIVE_ONLY";
}

function dilutionRiskState(
  shareGrowthYoy: number | undefined,
  recentOfferingCount: number,
): DilutionRiskState {
  if (shareGrowthYoy === undefined && recentOfferingCount === 0) {
    return "INSUFFICIENT_DATA";
  }

  if (
    shareGrowthYoy !== undefined &&
    shareGrowthYoy >= T6_THRESHOLDS.shareCountGrowthSevere
  ) {
    return "SEVERE";
  }

  if (
    shareGrowthYoy !== undefined &&
    shareGrowthYoy >= T6_THRESHOLDS.shareCountGrowthHigh
  ) {
    return "HIGH";
  }

  if (
    recentOfferingCount > 0 &&
    shareGrowthYoy !== undefined &&
    shareGrowthYoy >= T6_THRESHOLDS.shareCountGrowthWarning
  ) {
    return "HIGH";
  }

  if (
    shareGrowthYoy !== undefined &&
    shareGrowthYoy >= T6_THRESHOLDS.shareCountGrowthWarning
  ) {
    return "MODERATE";
  }

  if (recentOfferingCount > 0) {
    return "MODERATE";
  }

  return "LOW";
}

function hasMaterialRecentOffering(
  recentOfferingCount: number,
  shareGrowthYoy: number | undefined,
) {
  return (
    recentOfferingCount > 0 &&
    shareGrowthYoy !== undefined &&
    shareGrowthYoy >= T6_THRESHOLDS.shareCountGrowthWarning
  );
}

function cashRunwayMonths(input: {
  freeCashFlow: number | undefined;
  latestCash: number | undefined;
  periodType: "annual" | "quarter" | undefined;
}) {
  if (
    input.latestCash === undefined ||
    input.freeCashFlow === undefined ||
    input.freeCashFlow >= 0
  ) {
    return undefined;
  }

  return (
    (input.latestCash / Math.abs(input.freeCashFlow)) *
    (input.periodType === "annual" ? 12 : 3)
  );
}

function filingText(submission: SecCompanySubmission) {
  return [
    submission.form,
    submission.primaryDocument,
    submission.accessionNumber,
    submission.reportDate,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isWithinLookback(
  submission: SecCompanySubmission,
  asOfDate: Date,
  days: number,
) {
  const age = daysBetween(submission.filingDate, asOfDate);

  return age !== undefined && age >= 0 && age <= days;
}

function isGoingConcernSignal(
  submission: SecCompanySubmission,
  asOfDate: Date,
) {
  if (!isWithinLookback(submission, asOfDate, 365)) {
    return false;
  }

  const form = submission.form?.toUpperCase().trim();

  if (
    form !== "10-K" &&
    form !== "10-Q" &&
    form !== "10-K/A" &&
    form !== "10-Q/A" &&
    form !== "8-K"
  ) {
    return false;
  }

  const text = filingText(submission);

  return (
    text.includes("going concern") ||
    text.includes("going-concern") ||
    text.includes("substantial doubt")
  );
}

function isConvertibleFinancingSignal(
  submission: SecCompanySubmission,
  asOfDate: Date,
) {
  if (!isWithinLookback(submission, asOfDate, 365)) {
    return false;
  }

  const text = filingText(submission);

  return (
    text.includes("convertible") ||
    text.includes("warrant") ||
    text.includes("private placement") ||
    text.includes("registered direct") ||
    text.includes("at-the-market") ||
    text.includes("equity distribution")
  );
}

function debtToCash(totalDebt: number | undefined, cash: number | undefined) {
  if (totalDebt === undefined || cash === undefined || cash <= 0) {
    return undefined;
  }

  return totalDebt / cash;
}

function marketCapRisk(marketCap: number | undefined) {
  if (marketCap === undefined) {
    return 15;
  }

  if (marketCap >= T6_THRESHOLDS.coreMarketCapMin) {
    return 0;
  }

  if (marketCap >= T6_THRESHOLDS.expandedMarketCapMin) {
    return 5;
  }

  return 15;
}

function dollarVolumeRisk(
  averageDollarVolume: number | undefined,
  stale: boolean | undefined,
) {
  if (stale || averageDollarVolume === undefined) {
    return 15;
  }

  if (averageDollarVolume >= T6_THRESHOLDS.coreAverageDollarVolumeMin) {
    return 0;
  }

  if (averageDollarVolume >= T6_THRESHOLDS.expandedAverageDollarVolumeMin) {
    return 5;
  }

  if (averageDollarVolume >= T6_THRESHOLDS.illiquidAverageDollarVolumeMax) {
    return 10;
  }

  return 15;
}

function floatSpreadProxyRisk(averageDollarVolume: number | undefined) {
  if (averageDollarVolume === undefined) {
    return 10;
  }

  if (averageDollarVolume >= T6_THRESHOLDS.coreAverageDollarVolumeMin) {
    return 0;
  }

  if (averageDollarVolume >= T6_THRESHOLDS.expandedAverageDollarVolumeMin) {
    return 4;
  }

  if (averageDollarVolume >= T6_THRESHOLDS.illiquidAverageDollarVolumeMax) {
    return 7;
  }

  return 10;
}

function dilutionRiskScore(state: DilutionRiskState) {
  switch (state) {
    case "LOW":
      return 0;
    case "MODERATE":
      return 10;
    case "HIGH":
      return 18;
    case "SEVERE":
      return 25;
    case "INSUFFICIENT_DATA":
      return 8;
  }
}

function debtCashRunwayRisk(input: {
  cashRunwayMonths?: number;
  debtToCash?: number;
  freeCashFlow?: number;
}) {
  if (
    input.cashRunwayMonths !== undefined &&
    input.cashRunwayMonths <= T6_THRESHOLDS.cashRunwaySevereMonths
  ) {
    return 15;
  }

  if (
    input.cashRunwayMonths !== undefined &&
    input.cashRunwayMonths <= T6_THRESHOLDS.cashRunwayWarningMonths
  ) {
    return 10;
  }

  if (
    input.freeCashFlow !== undefined &&
    input.freeCashFlow < 0 &&
    input.cashRunwayMonths === undefined
  ) {
    return input.debtToCash !== undefined && input.debtToCash > 1 ? 8 : 5;
  }

  return 0;
}

function fragilityState(
  score: number,
  input: {
    liquidityState: LiquidityState;
    dilutionRiskState: DilutionRiskState;
    goingConcern: boolean;
    recentOfferingCount: number;
  },
): FragilityState {
  if (
    input.liquidityState === "INSUFFICIENT_DATA" &&
    input.dilutionRiskState === "INSUFFICIENT_DATA"
  ) {
    return "INSUFFICIENT_DATA";
  }

  if (
    input.goingConcern ||
    input.dilutionRiskState === "SEVERE" ||
    input.liquidityState === "ILLIQUID" ||
    score >= 70
  ) {
    return "SEVERE_FRAGILITY";
  }

  if (score >= 45) {
    return "FRAGILE";
  }

  if (score >= 25 || input.recentOfferingCount > 0) {
    return "WATCH_RISK";
  }

  return "NORMAL_RISK";
}

function reasonCodes(input: {
  dilutionRiskState: DilutionRiskState;
  fragilityState: FragilityState;
  goingConcern: boolean;
  liquidityState: LiquidityState;
  recentOfferingCount: number;
  reverseSplitCount: number;
  cashRunwayMonths?: number;
  convertibleFinancingCount: number;
  secFilingCoverageAvailable?: boolean;
  shareCountGrowthYoy?: number;
}) {
  const codes = new Set<string>();

  if (input.liquidityState === "CORE_ELIGIBLE") {
    codes.add(T6_REASON_CODES.LIQUIDITY_CORE_ELIGIBLE);
    codes.add(T6_REASON_CODES.LIQUIDITY_DOLLAR_VOLUME_HEALTHY);
  } else if (input.liquidityState === "EXPANDED_ELIGIBLE") {
    codes.add(T6_REASON_CODES.LIQUIDITY_EXPANDED_ELIGIBLE);
  } else if (input.liquidityState === "SPECULATIVE_ONLY") {
    codes.add(T6_REASON_CODES.LIQUIDITY_SPECULATIVE_ONLY);
    codes.add(T6_REASON_CODES.LIQUIDITY_DOLLAR_VOLUME_LOW);
  } else if (input.liquidityState === "ILLIQUID") {
    codes.add(T6_REASON_CODES.LIQUIDITY_ILLIQUID);
    codes.add(T6_REASON_CODES.LIQUIDITY_DOLLAR_VOLUME_LOW);
  } else {
    codes.add(T6_REASON_CODES.REQUIRED_DATA_MISSING);
  }

  if (input.dilutionRiskState === "LOW") {
    codes.add(T6_REASON_CODES.DILUTION_LOW_RISK);
  } else if (input.dilutionRiskState === "SEVERE") {
    codes.add(T6_REASON_CODES.DILUTION_SEVERE);
    codes.add(T6_REASON_CODES.DILUTION_SHARE_COUNT_WARNING);
  } else if (
    input.dilutionRiskState === "MODERATE" ||
    input.dilutionRiskState === "HIGH"
  ) {
    codes.add(T6_REASON_CODES.DILUTION_SHARE_COUNT_WARNING);
  } else {
    codes.add(T6_REASON_CODES.REQUIRED_DATA_MISSING);
  }

  if (input.recentOfferingCount > 0) {
    codes.add(T6_REASON_CODES.DILUTION_RECENT_OFFERING);
  }

  if (input.goingConcern) {
    codes.add(T6_REASON_CODES.FRAGILITY_GOING_CONCERN);
  }

  if (
    input.cashRunwayMonths !== undefined &&
    input.cashRunwayMonths <= T6_THRESHOLDS.cashRunwayWarningMonths
  ) {
    codes.add(T6_REASON_CODES.FRAGILITY_CASH_RUNWAY_LOW);
  }

  if (input.reverseSplitCount > 0) {
    codes.add(T6_REASON_CODES.FRAGILITY_REVERSE_SPLIT_HISTORY);
  }

  if (input.convertibleFinancingCount > 0) {
    codes.add(T6_REASON_CODES.FRAGILITY_CONVERTIBLE_DEBT);
  }

  if (input.secFilingCoverageAvailable === false) {
    codes.add(T6_REASON_CODES.REQUIRED_DATA_MISSING);
  }

  if (
    input.fragilityState === "NORMAL_RISK" &&
    input.dilutionRiskState !== "INSUFFICIENT_DATA" &&
    input.liquidityState !== "INSUFFICIENT_DATA" &&
    input.secFilingCoverageAvailable !== false &&
    !input.goingConcern &&
    input.recentOfferingCount === 0 &&
    input.reverseSplitCount === 0 &&
    input.convertibleFinancingCount === 0
  ) {
    codes.add(T6_REASON_CODES.FRAGILITY_NO_MAJOR_FLAGS);
  }

  return [...codes];
}

function vetoFlags(input: {
  dilutionRiskState: DilutionRiskState;
  goingConcernAndWeakFundamentals: boolean;
  liquidityState: LiquidityState;
  materialRecentOffering: boolean;
}): RiskVetoFlag[] {
  const flags: RiskVetoFlag[] = [];

  if (input.dilutionRiskState === "SEVERE") {
    flags.push("SEVERE_DILUTION");
  }

  if (input.liquidityState === "ILLIQUID") {
    flags.push("ILLIQUID");
  }

  if (input.goingConcernAndWeakFundamentals) {
    flags.push("GOING_CONCERN_AND_WEAK_FUNDAMENTALS");
  }

  if (input.materialRecentOffering) {
    flags.push("RECENT_MATERIAL_OFFERING");
  }

  return flags;
}

function evidenceDetails(input: {
  components: LiquidityScoreComponents;
  metrics: LiquidityMetricsSnapshot;
  reasonCodes: string[];
}) {
  const rows: LiquidityScoreResult["evidenceDetails"] = [];

  function push(row: LiquidityScoreResult["evidenceDetails"][number]) {
    rows.push(row);
  }

  if (input.metrics.averageDollarVolume20d !== undefined) {
    push({
      metricName: "t6.average_dollar_volume_20d",
      metricUnit: "USD",
      metricValueNum: input.metrics.averageDollarVolume20d,
      periodEnd: input.metrics.metricDate,
      reasonCode:
        input.components.dollar_volume_risk >= 15
          ? T6_REASON_CODES.LIQUIDITY_DOLLAR_VOLUME_LOW
          : T6_REASON_CODES.LIQUIDITY_DOLLAR_VOLUME_HEALTHY,
      scoreImpact:
        input.components.dollar_volume_risk > 0
          ? input.components.dollar_volume_risk
          : undefined,
    });
  }

  if (input.metrics.marketCap !== undefined) {
    push({
      metricName: "t6.market_cap",
      metricUnit: "USD",
      metricValueNum: input.metrics.marketCap,
      reasonCode:
        input.components.market_cap_risk >= 15
          ? T6_REASON_CODES.LIQUIDITY_SPECULATIVE_ONLY
          : T6_REASON_CODES.LIQUIDITY_CORE_ELIGIBLE,
      scoreImpact:
        input.components.market_cap_risk > 0
          ? input.components.market_cap_risk
          : undefined,
    });
  }

  if (input.metrics.shareCountGrowthYoy !== undefined) {
    push({
      metricName: "t6.share_count_growth_yoy",
      metricUnit: "ratio",
      metricValueNum: input.metrics.shareCountGrowthYoy,
      periodEnd: input.metrics.latestFinancialPeriodEnd,
      reasonCode:
        input.metrics.shareCountGrowthYoy >=
        T6_THRESHOLDS.shareCountGrowthSevere
          ? T6_REASON_CODES.DILUTION_SEVERE
          : input.metrics.shareCountGrowthYoy >=
              T6_THRESHOLDS.shareCountGrowthWarning
            ? T6_REASON_CODES.DILUTION_SHARE_COUNT_WARNING
            : T6_REASON_CODES.DILUTION_LOW_RISK,
      scoreImpact:
        input.components.dilution_risk > 0
          ? input.components.dilution_risk
          : undefined,
    });
  }

  if (input.metrics.cashRunwayMonths !== undefined) {
    push({
      metricName: "t6.cash_runway_months",
      metricUnit: "months",
      metricValueNum: input.metrics.cashRunwayMonths,
      periodEnd: input.metrics.latestFinancialPeriodEnd,
      reasonCode:
        input.metrics.cashRunwayMonths <= T6_THRESHOLDS.cashRunwayWarningMonths
          ? T6_REASON_CODES.FRAGILITY_CASH_RUNWAY_LOW
          : T6_REASON_CODES.FRAGILITY_NO_MAJOR_FLAGS,
      scoreImpact:
        input.components.debt_cash_runway_risk > 0
          ? input.components.debt_cash_runway_risk
          : undefined,
    });
  }

  if (input.metrics.recentOfferingCount > 0) {
    push({
      metricName: "t6.recent_offering_count",
      metricValueNum: input.metrics.recentOfferingCount,
      reasonCode: T6_REASON_CODES.DILUTION_RECENT_OFFERING,
      scoreImpact: input.components.corporate_action_risk,
    });
  }

  if (input.metrics.reverseSplitCount > 0) {
    push({
      metricName: "t6.reverse_split_count",
      metricValueNum: input.metrics.reverseSplitCount,
      reasonCode: T6_REASON_CODES.FRAGILITY_REVERSE_SPLIT_HISTORY,
      scoreImpact: input.components.corporate_action_risk,
    });
  }

  if (input.metrics.goingConcernFilingCount > 0) {
    push({
      metricName: "t6.going_concern_filing_count",
      metricValueNum: input.metrics.goingConcernFilingCount,
      reasonCode: T6_REASON_CODES.FRAGILITY_GOING_CONCERN,
      scoreImpact:
        input.components.going_concern_auditor_risk > 0
          ? input.components.going_concern_auditor_risk
          : undefined,
    });
  }

  if (input.metrics.convertibleFinancingCount > 0) {
    push({
      metricName: "t6.convertible_financing_count",
      metricValueNum: input.metrics.convertibleFinancingCount,
      reasonCode: T6_REASON_CODES.FRAGILITY_CONVERTIBLE_DEBT,
      scoreImpact:
        input.components.corporate_action_risk > 0
          ? input.components.corporate_action_risk
          : undefined,
    });
  }

  if (input.reasonCodes.includes(T6_REASON_CODES.REQUIRED_DATA_MISSING)) {
    push({
      metricName: "t6.required_data_coverage",
      metricValueText: JSON.stringify({
        average_dollar_volume_20d:
          input.metrics.averageDollarVolume20d !== undefined,
        financial_period: input.metrics.latestFinancialPeriodEnd !== undefined,
        market_cap: input.metrics.marketCap !== undefined,
        sec_filing_coverage: input.metrics.secFilingCoverageAvailable !== false,
        share_count_growth_yoy: input.metrics.shareCountGrowthYoy !== undefined,
      }),
      reasonCode: T6_REASON_CODES.REQUIRED_DATA_MISSING,
    });
  }

  return rows;
}

export function detectRecentOfferingForms(
  submissions: SecCompanySubmission[] | undefined,
  asOfDate = new Date(),
) {
  return (submissions ?? []).filter((submission) =>
    isRecentOffering(submission, asOfDate),
  );
}

export function detectReverseSplitFilings(
  submissions: SecCompanySubmission[] | undefined,
  asOfDate = new Date(),
) {
  return (submissions ?? []).filter((submission) =>
    isRecentReverseSplit(submission, asOfDate),
  );
}

export function detectGoingConcernFilings(
  submissions: SecCompanySubmission[] | undefined,
  asOfDate = new Date(),
) {
  return (submissions ?? []).filter((submission) =>
    isGoingConcernSignal(submission, asOfDate),
  );
}

export function detectConvertibleFinancingFilings(
  submissions: SecCompanySubmission[] | undefined,
  asOfDate = new Date(),
) {
  return (submissions ?? []).filter((submission) =>
    isConvertibleFinancingSignal(submission, asOfDate),
  );
}

export function scoreLiquidityDilutionFragility(
  input: LiquidityScoringInput,
): LiquidityScoreResult {
  const asOfDate = input.asOfDate ?? new Date();
  const latestPeriod = latestFinancialPeriod(input);
  const shareGrowth = shareCountGrowthYoy(input);
  const offeringCount = detectRecentOfferingForms(
    input.submissions,
    asOfDate,
  ).length;
  const reverseSplitCount = detectReverseSplitFilings(
    input.submissions,
    asOfDate,
  ).length;
  const goingConcernFilingCount = detectGoingConcernFilings(
    input.submissions,
    asOfDate,
  ).length;
  const convertibleFinancingCount = detectConvertibleFinancingFilings(
    input.submissions,
    asOfDate,
  ).length;
  const latestCash = latestPeriod?.cashAndEquivalents;
  const latestDebt = latestPeriod?.totalDebt;
  const latestFcf = latestPeriod?.freeCashFlow;
  const runwayMonths = cashRunwayMonths({
    freeCashFlow: latestFcf,
    latestCash,
    periodType: latestPeriod?.periodType,
  });
  const leverage = debtToCash(latestDebt, latestCash);
  const liquidity = liquidityState(input);
  const dilution = dilutionRiskState(shareGrowth, offeringCount);
  const materialRecentOffering = hasMaterialRecentOffering(
    offeringCount,
    shareGrowth,
  );
  const goingConcern =
    input.goingConcern === true || goingConcernFilingCount > 0;
  const components: LiquidityScoreComponents = {
    corporate_action_risk: Math.min(
      10,
      (offeringCount > 0 ? 4 : 0) +
        (reverseSplitCount > 0 ? 6 : 0) +
        (convertibleFinancingCount > 0 ? 4 : 0),
    ),
    debt_cash_runway_risk: debtCashRunwayRisk({
      cashRunwayMonths: runwayMonths,
      debtToCash: leverage,
      freeCashFlow: latestFcf,
    }),
    dilution_risk: dilutionRiskScore(dilution),
    dollar_volume_risk: dollarVolumeRisk(
      input.averageDollarVolume20d,
      input.priceDataStale,
    ),
    float_spread_proxy_risk: floatSpreadProxyRisk(input.averageDollarVolume20d),
    going_concern_auditor_risk: goingConcern ? 10 : 0,
    market_cap_risk: marketCapRisk(input.marketCap),
  };
  const score = clampRisk(
    Object.values(components).reduce((sum, value) => sum + value, 0),
  );
  const fragility = fragilityState(score, {
    dilutionRiskState: dilution,
    goingConcern,
    liquidityState: liquidity,
    recentOfferingCount: offeringCount,
  });
  const metrics: LiquidityMetricsSnapshot = {
    averageDollarVolume20d: round(input.averageDollarVolume20d, 2),
    averageVolume20d: round(input.averageVolume20d, 2),
    cashAndEquivalents: round(latestCash, 2),
    cashRunwayMonths: round(runwayMonths, 2),
    convertibleFinancingCount,
    debtToCash: round(leverage, 6),
    freeCashFlow: round(latestFcf, 2),
    goingConcernFilingCount,
    latestFinancialPeriodEnd: latestPeriod?.periodEnd,
    marketCap: round(input.marketCap, 2),
    metricDate: input.metricDate,
    operatingCashFlow: round(latestPeriod?.operatingCashFlow, 2),
    priceDataStale: input.priceDataStale,
    recentOfferingCount: offeringCount,
    reverseSplitCount,
    secFilingCoverageAvailable: input.secFilingCoverageAvailable,
    shareCountGrowthYoy: round(shareGrowth, 6),
    totalDebt: round(latestDebt, 2),
  };
  const codes = reasonCodes({
    cashRunwayMonths: runwayMonths,
    convertibleFinancingCount,
    dilutionRiskState: dilution,
    fragilityState: fragility,
    goingConcern,
    liquidityState: liquidity,
    recentOfferingCount: offeringCount,
    reverseSplitCount,
    secFilingCoverageAvailable: input.secFilingCoverageAvailable,
    shareCountGrowthYoy: shareGrowth,
  });
  const flags = vetoFlags({
    dilutionRiskState: dilution,
    goingConcernAndWeakFundamentals: input.goingConcern === true,
    liquidityState: liquidity,
    materialRecentOffering,
  });
  const scoreDetail = {
    algorithm_version: T6_LIQUIDITY_ALGORITHM_VERSION,
    components,
    dilution_risk_state: dilution,
    final_score: score,
    fragility_state: fragility,
    liquidity_state: liquidity,
    metrics,
    reason_codes: codes,
    threshold_version: T6_LIQUIDITY_THRESHOLD_VERSION,
    veto_flags: flags,
  };

  return {
    dilutionRiskState: dilution,
    evidenceDetails: evidenceDetails({
      components,
      metrics,
      reasonCodes: codes,
    }),
    fragilityState: fragility,
    liquidityState: liquidity,
    score,
    scoreDetail,
  };
}
