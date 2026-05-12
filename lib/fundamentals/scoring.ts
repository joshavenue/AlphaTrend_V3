import type { FundamentalState } from "@/generated/prisma/client";
import {
  T3_CAPS,
  T3_FUNDAMENTAL_ALGORITHM_VERSION,
  T3_FUNDAMENTAL_THRESHOLD_VERSION,
  T3_REASON_CODES,
} from "@/lib/fundamentals/constants";
import type {
  FundamentalMetricSnapshot,
  FundamentalPeriod,
  FundamentalScoreComponents,
  FundamentalScoreResult,
  FundamentalScoringInput,
} from "@/lib/fundamentals/types";

function percentChange(current: number | undefined, prior: number | undefined) {
  if (current === undefined || prior === undefined || prior === 0) {
    return undefined;
  }

  return (current - prior) / Math.abs(prior);
}

function margin(numerator: number | undefined, revenue: number | undefined) {
  if (numerator === undefined || revenue === undefined || revenue === 0) {
    return undefined;
  }

  return numerator / revenue;
}

function toBps(delta: number | undefined) {
  return delta === undefined ? undefined : delta * 10_000;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function latestComparablePeriods(input: FundamentalScoringInput) {
  const quarterly = input.financials.quarterlyPeriods.filter(
    (period) => period.revenue !== undefined,
  );

  if (quarterly.length >= 5) {
    return {
      hasMinimumHistory: true,
      latest: quarterly[0],
      previous: quarterly[1],
      priorYoy: quarterly[5],
      type: "quarter" as const,
      yoy: quarterly[4],
    };
  }

  const annual = input.financials.annualPeriods.filter(
    (period) => period.revenue !== undefined,
  );

  if (annual.length >= 3) {
    return {
      hasMinimumHistory: true,
      latest: annual[0],
      previous: annual[1],
      priorYoy: annual[2],
      type: "annual" as const,
      yoy: annual[1],
    };
  }

  return {
    hasMinimumHistory: false,
    latest: quarterly[0] ?? annual[0],
    previous: quarterly[1] ?? annual[1],
    priorYoy: undefined,
    type: quarterly.length > 0 ? ("quarter" as const) : ("annual" as const),
    yoy: quarterly[4] ?? annual[1],
  };
}

function metricsFor(input: FundamentalScoringInput): FundamentalMetricSnapshot {
  const periods = latestComparablePeriods(input);
  const latest = periods.latest;
  const yoy = periods.yoy;
  const previous = periods.previous;
  const priorYoy = periods.priorYoy;
  const latestGrossMargin = margin(latest?.grossProfit, latest?.revenue);
  const yoyGrossMargin = margin(yoy?.grossProfit, yoy?.revenue);
  const latestOperatingMargin = margin(
    latest?.operatingIncome,
    latest?.revenue,
  );
  const yoyOperatingMargin = margin(yoy?.operatingIncome, yoy?.revenue);
  const latestFcfMargin = margin(latest?.freeCashFlow, latest?.revenue);
  const yoyFcfMargin = margin(yoy?.freeCashFlow, yoy?.revenue);

  return {
    cashDebtRatio:
      latest?.cashAndEquivalents !== undefined && latest.totalDebt !== undefined
        ? latest.cashAndEquivalents / Math.max(latest.totalDebt, 1)
        : undefined,
    fcfMargin: latestFcfMargin,
    fcfMarginDeltaYoy:
      latestFcfMargin !== undefined && yoyFcfMargin !== undefined
        ? latestFcfMargin - yoyFcfMargin
        : undefined,
    grossMargin: latestGrossMargin,
    grossMarginDeltaYoyBps: toBps(
      latestGrossMargin !== undefined && yoyGrossMargin !== undefined
        ? latestGrossMargin - yoyGrossMargin
        : undefined,
    ),
    latestPeriodEnd: latest?.periodEnd,
    operatingMargin: latestOperatingMargin,
    operatingMarginDeltaYoyBps: toBps(
      latestOperatingMargin !== undefined && yoyOperatingMargin !== undefined
        ? latestOperatingMargin - yoyOperatingMargin
        : undefined,
    ),
    revenueGrowthQoq: percentChange(latest?.revenue, previous?.revenue),
    revenueGrowthYoy: percentChange(latest?.revenue, yoy?.revenue),
    revenueGrowthYoyPrior: percentChange(previous?.revenue, priorYoy?.revenue),
    shareCountGrowthYoy: percentChange(
      latest?.dilutedShares,
      yoy?.dilutedShares,
    ),
  };
}

function revenueAccelerationScore(metrics: FundamentalMetricSnapshot) {
  const yoy = metrics.revenueGrowthYoy;

  if (yoy === undefined) {
    return 0;
  }

  const acceleration =
    metrics.revenueGrowthYoyPrior === undefined
      ? undefined
      : yoy - metrics.revenueGrowthYoyPrior;

  if (yoy > 0 && acceleration !== undefined && acceleration >= 0.05) {
    return 20;
  }

  if (yoy > 0) {
    return acceleration === undefined || acceleration < 0.05 ? 10 : 15;
  }

  if (yoy > -0.02 || (metrics.revenueGrowthQoq ?? -1) > 0) {
    return 5;
  }

  return 0;
}

function segmentValidationScore(input: FundamentalScoringInput) {
  switch (input.segmentEvidence) {
    case "growing_reported":
      return 20;
    case "direct_business_line":
      return 10;
    case "partial":
      return 5;
    default:
      return 0;
  }
}

function marginExpansionScore(metrics: FundamentalMetricSnapshot) {
  const bestDelta = Math.max(
    metrics.grossMarginDeltaYoyBps ?? Number.NEGATIVE_INFINITY,
    metrics.operatingMarginDeltaYoyBps ?? Number.NEGATIVE_INFINITY,
  );
  const revenueGrowing = (metrics.revenueGrowthYoy ?? 0) > 0;

  if (bestDelta >= 200) {
    return 15;
  }

  if (bestDelta >= 100) {
    return 10;
  }

  if (bestDelta >= -100 && revenueGrowing) {
    return 6;
  }

  if (bestDelta > -200) {
    return 2;
  }

  return 0;
}

function cashFlowQualityScore(metrics: FundamentalMetricSnapshot) {
  if (metrics.fcfMargin === undefined) {
    return 0;
  }

  if (metrics.fcfMargin > 0 && (metrics.fcfMarginDeltaYoy ?? 0) > 0) {
    return 15;
  }

  if (metrics.fcfMargin > 0) {
    return 10;
  }

  if ((metrics.fcfMarginDeltaYoy ?? 0) > 0) {
    return 3;
  }

  return 0;
}

function guidanceScore(input: FundamentalScoringInput) {
  switch (input.guidanceSupport) {
    case "measurable":
      return 15;
    case "qualitative":
      return 10;
    case "generic":
      return 5;
    default:
      return 0;
  }
}

function balanceSheetScore(
  latest: FundamentalPeriod | undefined,
  metrics: FundamentalMetricSnapshot,
) {
  if (!latest) {
    return 0;
  }

  if (metrics.cashDebtRatio !== undefined && metrics.cashDebtRatio >= 1) {
    return 10;
  }

  if (
    latest.totalDebt !== undefined &&
    latest.totalAssets !== undefined &&
    latest.totalDebt / Math.max(latest.totalAssets, 1) < 0.4
  ) {
    return 7;
  }

  if (
    latest.cashAndEquivalents !== undefined &&
    latest.cashAndEquivalents > 0
  ) {
    return 4;
  }

  return 0;
}

function accountingQualityScore(input: FundamentalScoringInput) {
  const materialDisagreements =
    input.reconciliation?.materialDisagreementCount ?? 0;

  if (materialDisagreements > 0) {
    return 1;
  }

  if ((input.reconciliation?.comparedCount ?? 0) > 0) {
    return 5;
  }

  const hasSomeData =
    input.financials.quarterlyPeriods.length > 0 ||
    input.financials.annualPeriods.length > 0;

  return hasSomeData ? 3 : 0;
}

function dilutionPenalty(metrics: FundamentalMetricSnapshot) {
  const shareGrowth = metrics.shareCountGrowthYoy;

  if (shareGrowth === undefined) {
    return 0;
  }

  if (shareGrowth >= 0.25) {
    return -20;
  }

  if (shareGrowth >= 0.15) {
    return -12;
  }

  if (shareGrowth >= 0.1) {
    return -6;
  }

  return 0;
}

function hasMaterialMarginCompression(metrics: FundamentalMetricSnapshot) {
  return (
    (metrics.grossMarginDeltaYoyBps ?? 0) <= -200 ||
    (metrics.operatingMarginDeltaYoyBps ?? 0) <= -200
  );
}

function hasFcfWorsening(metrics: FundamentalMetricSnapshot) {
  return (metrics.fcfMarginDeltaYoy ?? 0) < 0 && (metrics.fcfMargin ?? 0) < 0;
}

function reasonCodesFor(input: {
  components: FundamentalScoreComponents;
  metrics: FundamentalMetricSnapshot;
  reconciliationMaterial: boolean;
}) {
  const reasons = new Set<string>();

  if ((input.metrics.revenueGrowthYoy ?? 0) > 0) {
    reasons.add(T3_REASON_CODES.REVENUE_GROWING);
  }

  if (
    input.metrics.revenueGrowthYoy !== undefined &&
    input.metrics.revenueGrowthYoyPrior !== undefined &&
    input.metrics.revenueGrowthYoy - input.metrics.revenueGrowthYoyPrior >= 0.05
  ) {
    reasons.add(T3_REASON_CODES.REVENUE_ACCELERATING);
  }

  if ((input.metrics.revenueGrowthYoy ?? 0) < -0.02) {
    reasons.add(T3_REASON_CODES.REVENUE_DECLINING);
  }

  if (input.components.segment_validation > 0) {
    reasons.add(T3_REASON_CODES.SEGMENT_REVENUE_SUPPORT);
  }

  if ((input.metrics.grossMarginDeltaYoyBps ?? 0) >= 100) {
    reasons.add(T3_REASON_CODES.GROSS_MARGIN_EXPANDING);
  }

  if ((input.metrics.operatingMarginDeltaYoyBps ?? 0) >= 100) {
    reasons.add(T3_REASON_CODES.OPERATING_MARGIN_EXPANDING);
  }

  if (hasMaterialMarginCompression(input.metrics)) {
    reasons.add(T3_REASON_CODES.MARGIN_COMPRESSING);
  }

  if ((input.metrics.fcfMargin ?? 0) > 0) {
    reasons.add(T3_REASON_CODES.FCF_POSITIVE);
  }

  if ((input.metrics.fcfMargin ?? 0) < 0) {
    reasons.add(T3_REASON_CODES.FCF_NEGATIVE);
  }

  if (input.components.guidance_backlog_support > 0) {
    reasons.add(T3_REASON_CODES.GUIDANCE_SUPPORT);
  }

  if (input.components.balance_sheet_quality >= 7) {
    reasons.add(T3_REASON_CODES.BALANCE_SHEET_HEALTHY);
  }

  if ((input.metrics.shareCountGrowthYoy ?? 0) >= 0.1) {
    reasons.add(T3_REASON_CODES.SHARE_COUNT_RISING);
  }

  if ((input.metrics.shareCountGrowthYoy ?? 0) >= 0.25) {
    reasons.add(T3_REASON_CODES.SEVERE_DILUTION);
  }

  if (input.reconciliationMaterial) {
    reasons.add(T3_REASON_CODES.SEC_VENDOR_DISAGREEMENT);
  }

  return [...reasons];
}

function applyCaps(input: {
  components: FundamentalScoreComponents;
  hasMinimumHistory: boolean;
  metrics: FundamentalMetricSnapshot;
  score: number;
  t1ExposureScore?: number;
  t1State?: string;
  reconciliationMaterial: boolean;
}) {
  const capsApplied: string[] = [];
  let score = input.score;

  function cap(name: string, value: number) {
    if (!capsApplied.includes(name)) {
      capsApplied.push(name);
    }

    score = Math.min(score, value);
  }

  if (
    !input.hasMinimumHistory ||
    input.metrics.revenueGrowthYoy === undefined
  ) {
    cap("critical_data_missing", T3_CAPS.criticalDataMissing);
  }

  if (input.t1ExposureScore !== undefined && input.t1ExposureScore < 30) {
    cap("t1_exposure_score_below_30", T3_CAPS.t1ExposureTooLow);
  }

  if (
    input.components.segment_validation === 0 &&
    ["PARTIAL_BENEFICIARY", "INDIRECT_BENEFICIARY"].includes(
      input.t1State ?? "",
    )
  ) {
    cap(
      "no_segment_product_validation_partial_t1",
      T3_CAPS.noPartialSegmentSupport,
    );
  }

  if (input.reconciliationMaterial) {
    cap("material_sec_fmp_disagreement", T3_CAPS.vendorSecDisagreement);
  }

  if ((input.metrics.shareCountGrowthYoy ?? 0) >= 0.25) {
    cap("severe_dilution", T3_CAPS.severeDilution);
  }

  if (
    hasMaterialMarginCompression(input.metrics) &&
    hasFcfWorsening(input.metrics)
  ) {
    cap(
      "margin_compression_and_fcf_worsening",
      T3_CAPS.marginAndFcfDeteriorating,
    );
  }

  return {
    capsApplied,
    score,
  };
}

function stateFor(input: {
  components: FundamentalScoreComponents;
  hasMinimumHistory: boolean;
  metrics: FundamentalMetricSnapshot;
  score: number;
  reconciliationMaterial: boolean;
}): FundamentalState {
  if (
    !input.hasMinimumHistory ||
    input.metrics.revenueGrowthYoy === undefined
  ) {
    return "INSUFFICIENT_DATA";
  }

  if (
    (input.metrics.revenueGrowthYoy ?? 0) < 0 &&
    hasMaterialMarginCompression(input.metrics) &&
    hasFcfWorsening(input.metrics)
  ) {
    return "DETERIORATING";
  }

  if ((input.metrics.revenueGrowthYoy ?? 0) < -0.15) {
    return "CONTRADICTED";
  }

  if (
    input.score >= 80 &&
    (input.metrics.revenueGrowthYoy ?? 0) > 0 &&
    (input.components.margin_expansion > 0 ||
      input.components.cash_flow_quality > 0) &&
    input.components.dilution_penalty > -20 &&
    !input.reconciliationMaterial
  ) {
    return "VALIDATED";
  }

  if (input.score >= 60) {
    return "IMPROVING";
  }

  if (input.score >= 40) {
    return "NOT_YET_VALIDATED";
  }

  if (input.score >= 20) {
    return (input.metrics.revenueGrowthYoy ?? 0) < 0
      ? "DETERIORATING"
      : "NOT_YET_VALIDATED";
  }

  return "INSUFFICIENT_DATA";
}

function scoreEvidenceDetails(
  components: FundamentalScoreComponents,
  metrics: FundamentalMetricSnapshot,
  state: FundamentalState,
) {
  const details: FundamentalScoreResult["evidenceDetails"] = [
    {
      metricName: "t3.fundamental_validation_score",
      metricValueText: state,
      reasonCode: T3_REASON_CODES.CRITICAL_DATA_MISSING,
    },
  ];

  function componentReasonCode(
    component: keyof FundamentalScoreComponents,
    value: number,
  ) {
    if (component === "dilution_penalty") {
      return value <= -20
        ? T3_REASON_CODES.SEVERE_DILUTION
        : T3_REASON_CODES.SHARE_COUNT_RISING;
    }

    if (component === "revenue_acceleration") {
      return value >= 15
        ? T3_REASON_CODES.REVENUE_ACCELERATING
        : T3_REASON_CODES.REVENUE_GROWING;
    }

    if (component === "segment_validation") {
      return T3_REASON_CODES.SEGMENT_REVENUE_SUPPORT;
    }

    if (component === "margin_expansion") {
      return T3_REASON_CODES.GROSS_MARGIN_EXPANDING;
    }

    if (component === "cash_flow_quality") {
      return T3_REASON_CODES.FCF_POSITIVE;
    }

    if (component === "guidance_backlog_support") {
      return T3_REASON_CODES.GUIDANCE_SUPPORT;
    }

    if (component === "balance_sheet_quality") {
      return value >= 7
        ? T3_REASON_CODES.BALANCE_SHEET_HEALTHY
        : T3_REASON_CODES.DEBT_RISK;
    }

    return T3_REASON_CODES.ACCOUNTING_DATA_QUALITY;
  }

  for (const [component, value] of Object.entries(components) as Array<
    [keyof FundamentalScoreComponents, number]
  >) {
    if (value === 0) {
      continue;
    }

    details.push({
      metricName: `t3.component.${component}`,
      metricValueNum: value,
      reasonCode: componentReasonCode(component, value),
      scoreImpact: value,
    });
  }

  const metricRows: Array<{
    name: string;
    unit?: string;
    value?: number;
    reason: string;
  }> = [
    {
      name: "t3.revenue_growth_yoy",
      unit: "percent",
      value: metrics.revenueGrowthYoy,
      reason:
        (metrics.revenueGrowthYoy ?? 0) >= 0
          ? T3_REASON_CODES.REVENUE_GROWING
          : T3_REASON_CODES.REVENUE_DECLINING,
    },
    {
      name: "t3.revenue_growth_qoq",
      unit: "percent",
      value: metrics.revenueGrowthQoq,
      reason: T3_REASON_CODES.REVENUE_GROWING,
    },
    {
      name: "t3.gross_margin_delta_yoy_bps",
      unit: "bps",
      value: metrics.grossMarginDeltaYoyBps,
      reason:
        (metrics.grossMarginDeltaYoyBps ?? 0) >= 0
          ? T3_REASON_CODES.GROSS_MARGIN_EXPANDING
          : T3_REASON_CODES.MARGIN_COMPRESSING,
    },
    {
      name: "t3.operating_margin_delta_yoy_bps",
      unit: "bps",
      value: metrics.operatingMarginDeltaYoyBps,
      reason:
        (metrics.operatingMarginDeltaYoyBps ?? 0) >= 0
          ? T3_REASON_CODES.OPERATING_MARGIN_EXPANDING
          : T3_REASON_CODES.MARGIN_COMPRESSING,
    },
    {
      name: "t3.free_cash_flow_margin",
      unit: "percent",
      value: metrics.fcfMargin,
      reason:
        (metrics.fcfMargin ?? 0) >= 0
          ? T3_REASON_CODES.FCF_POSITIVE
          : T3_REASON_CODES.FCF_NEGATIVE,
    },
    {
      name: "t3.share_count_growth_yoy",
      unit: "percent",
      value: metrics.shareCountGrowthYoy,
      reason:
        (metrics.shareCountGrowthYoy ?? 0) >= 0.25
          ? T3_REASON_CODES.SEVERE_DILUTION
          : T3_REASON_CODES.SHARE_COUNT_RISING,
    },
    {
      name: "t3.cash_debt_ratio",
      value: metrics.cashDebtRatio,
      reason: T3_REASON_CODES.BALANCE_SHEET_HEALTHY,
    },
  ];

  for (const row of metricRows) {
    if (row.value === undefined) {
      continue;
    }

    details.push({
      metricName: row.name,
      metricUnit: row.unit,
      metricValueNum: row.value,
      periodEnd: metrics.latestPeriodEnd,
      reasonCode: row.reason,
    });
  }

  return details;
}

export function scoreFundamentalValidation(
  input: FundamentalScoringInput,
): FundamentalScoreResult {
  const comparable = latestComparablePeriods(input);
  const metrics = metricsFor(input);
  const latest = comparable.latest;
  const reconciliationMaterial =
    (input.reconciliation?.materialDisagreementCount ?? 0) > 0;
  const components: FundamentalScoreComponents = {
    accounting_data_quality: accountingQualityScore(input),
    balance_sheet_quality: balanceSheetScore(latest, metrics),
    cash_flow_quality: cashFlowQualityScore(metrics),
    dilution_penalty: dilutionPenalty(metrics),
    guidance_backlog_support: guidanceScore(input),
    margin_expansion: marginExpansionScore(metrics),
    revenue_acceleration: revenueAccelerationScore(metrics),
    segment_validation: segmentValidationScore(input),
  };
  const rawScore =
    components.accounting_data_quality +
    components.balance_sheet_quality +
    components.cash_flow_quality +
    components.guidance_backlog_support +
    components.margin_expansion +
    components.revenue_acceleration +
    components.segment_validation +
    components.dilution_penalty;
  const capped = applyCaps({
    components,
    hasMinimumHistory: comparable.hasMinimumHistory,
    metrics,
    reconciliationMaterial,
    score: rawScore,
    t1ExposureScore: input.t1ExposureScore,
    t1State: input.t1State,
  });
  const score = clampScore(capped.score);
  const reasonCodes = reasonCodesFor({
    components,
    metrics,
    reconciliationMaterial,
  });

  if (!comparable.hasMinimumHistory || metrics.revenueGrowthYoy === undefined) {
    reasonCodes.push(T3_REASON_CODES.CRITICAL_DATA_MISSING);
  }

  if (input.t1ExposureScore !== undefined && input.t1ExposureScore < 30) {
    reasonCodes.push(T3_REASON_CODES.T1_EXPOSURE_TOO_LOW);
  }

  const state = stateFor({
    components,
    hasMinimumHistory: comparable.hasMinimumHistory,
    metrics,
    reconciliationMaterial,
    score,
  });
  const scoreDetail = {
    algorithm_version: T3_FUNDAMENTAL_ALGORITHM_VERSION,
    caps_applied: capped.capsApplied,
    components,
    final_score: score,
    fundamental_state: state,
    metrics,
    reason_codes: [...new Set(reasonCodes)],
    threshold_version: T3_FUNDAMENTAL_THRESHOLD_VERSION,
  };
  const evidenceDetails = scoreEvidenceDetails(components, metrics, state);

  evidenceDetails[0] = {
    ...evidenceDetails[0],
    metricValueNum: score,
    metricValueText: `${state}:${score}`,
    reasonCode:
      scoreDetail.reason_codes[0] ?? T3_REASON_CODES.CRITICAL_DATA_MISSING,
    scoreImpact: score,
  };

  return {
    evidenceDetails,
    score,
    scoreDetail,
    state,
  };
}

export const fundamentalScoringInternals = {
  latestComparablePeriods,
  metricsFor,
};
