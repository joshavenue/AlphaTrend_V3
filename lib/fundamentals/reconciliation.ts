import type {
  FundamentalPeriod,
  NormalizedFundamentalData,
  ReconciliationDiscrepancy,
  ReconciliationSummary,
} from "@/lib/fundamentals/types";
import { T3_DATA_REASON_CODES } from "@/lib/fundamentals/constants";

type ReconciledMetric = {
  metricName: string;
  tolerance: "statement" | "share";
};

const RECONCILED_METRICS: ReconciledMetric[] = [
  {
    metricName: "revenue",
    tolerance: "statement",
  },
  {
    metricName: "grossProfit",
    tolerance: "statement",
  },
  {
    metricName: "operatingIncome",
    tolerance: "statement",
  },
  {
    metricName: "netIncome",
    tolerance: "statement",
  },
  {
    metricName: "operatingCashFlow",
    tolerance: "statement",
  },
  {
    metricName: "capitalExpenditure",
    tolerance: "statement",
  },
  {
    metricName: "dilutedShares",
    tolerance: "share",
  },
];
const MAX_PERIOD_END_TOLERANCE_DAYS = 3;

function numericMetric(period: FundamentalPeriod, metricName: string) {
  const value = (period as unknown as Record<string, unknown>)[metricName];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function percentDifference(left: number, right: number) {
  return Math.abs(left - right) / Math.max(Math.abs(left), 1);
}

function daysBetween(left: string, right: string) {
  const leftTime = Date.parse(`${left}T00:00:00.000Z`);
  const rightTime = Date.parse(`${right}T00:00:00.000Z`);

  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(leftTime - rightTime) / 86_400_000;
}

function isMaterialDifference(input: {
  absoluteDifference: number;
  percentDifference: number;
  secValue: number;
  tolerance: ReconciledMetric["tolerance"];
}) {
  if (input.tolerance === "share") {
    return input.percentDifference > 0.01;
  }

  return (
    (input.percentDifference > 0.02 && input.absoluteDifference > 5_000_000) ||
    input.percentDifference > 0.05
  );
}

function sameFiscalPeriod(left: FundamentalPeriod, right: FundamentalPeriod) {
  return Boolean(
    left.fiscalYear !== undefined &&
    right.fiscalYear !== undefined &&
    left.fiscalYear === right.fiscalYear &&
    left.fiscalPeriod &&
    right.fiscalPeriod &&
    left.fiscalPeriod === right.fiscalPeriod,
  );
}

function findMatchingFmpPeriod(
  secPeriod: FundamentalPeriod,
  fmpPeriods: FundamentalPeriod[],
) {
  const fiscalMatches = fmpPeriods.filter((period) =>
    sameFiscalPeriod(secPeriod, period),
  );
  const candidates = fiscalMatches.length > 0 ? fiscalMatches : fmpPeriods;
  const sorted = [...candidates].sort(
    (left, right) =>
      daysBetween(secPeriod.periodEnd, left.periodEnd) -
      daysBetween(secPeriod.periodEnd, right.periodEnd),
  );
  const closest = sorted[0];

  if (!closest) {
    return {
      period: undefined,
      fiscalPeriodMismatch: false,
    };
  }

  const dayGap = daysBetween(secPeriod.periodEnd, closest.periodEnd);

  return {
    period: dayGap <= MAX_PERIOD_END_TOLERANCE_DAYS ? closest : undefined,
    fiscalPeriodMismatch: fiscalMatches.length > 0,
  };
}

function reconcilePeriodSets(
  secPeriods: FundamentalPeriod[],
  fmpPeriods: FundamentalPeriod[],
) {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  let comparedCount = 0;

  for (const secPeriod of secPeriods) {
    const match = findMatchingFmpPeriod(secPeriod, fmpPeriods);
    const fmpPeriod = match.period;

    if (!fmpPeriod) {
      if (match.fiscalPeriodMismatch) {
        discrepancies.push({
          material: false,
          metricName: "period_mismatch",
          periodEnd: secPeriod.periodEnd,
          preferredSource: "NONE",
          reasonCode: T3_DATA_REASON_CODES.DATA_PERIOD_MISMATCH,
        });
      }

      continue;
    }

    for (const metric of RECONCILED_METRICS) {
      const secValue = numericMetric(secPeriod, metric.metricName);
      const fmpValue = numericMetric(fmpPeriod, metric.metricName);

      if (secValue === undefined && fmpValue !== undefined) {
        discrepancies.push({
          fmpValue,
          material: false,
          metricName: metric.metricName,
          periodEnd: secPeriod.periodEnd,
          preferredSource: "FMP",
          reasonCode: T3_DATA_REASON_CODES.DATA_MISSING,
        });
        continue;
      }

      if (secValue === undefined || fmpValue === undefined) {
        continue;
      }

      comparedCount += 1;
      const absoluteDifference = Math.abs(secValue - fmpValue);
      const pctDifference = percentDifference(secValue, fmpValue);
      const material = isMaterialDifference({
        absoluteDifference,
        percentDifference: pctDifference,
        secValue,
        tolerance: metric.tolerance,
      });

      if (material) {
        discrepancies.push({
          absoluteDifference,
          fmpValue,
          material,
          metricName: metric.metricName,
          percentDifference: pctDifference,
          periodEnd: secPeriod.periodEnd,
          preferredSource: "SEC",
          reasonCode: T3_DATA_REASON_CODES.DATA_VENDOR_DISAGREEMENT,
          secValue,
        });
      }
    }
  }

  return {
    comparedCount,
    discrepancies,
  };
}

export function reconcileFundamentals(
  secData: NormalizedFundamentalData,
  fmpData: NormalizedFundamentalData,
): ReconciliationSummary {
  const quarterly = reconcilePeriodSets(
    secData.quarterlyPeriods,
    fmpData.quarterlyPeriods,
  );
  const annual = reconcilePeriodSets(
    secData.annualPeriods,
    fmpData.annualPeriods,
  );
  const discrepancies = [...quarterly.discrepancies, ...annual.discrepancies];

  return {
    comparedCount: quarterly.comparedCount + annual.comparedCount,
    discrepancies,
    materialDisagreementCount: discrepancies.filter(
      (discrepancy) => discrepancy.material,
    ).length,
  };
}
