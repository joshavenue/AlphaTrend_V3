import type {
  FundamentalPeriod,
  NormalizedFundamentalData,
  ReconciliationDiscrepancy,
  ReconciliationSummary,
} from "@/lib/fundamentals/types";

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

function numericMetric(period: FundamentalPeriod, metricName: string) {
  const value = (period as unknown as Record<string, unknown>)[metricName];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function percentDifference(left: number, right: number) {
  return Math.abs(left - right) / Math.max(Math.abs(left), 1);
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

function byPeriodEnd(periods: FundamentalPeriod[]) {
  return new Map(periods.map((period) => [period.periodEnd, period]));
}

function reconcilePeriodSets(
  secPeriods: FundamentalPeriod[],
  fmpPeriods: FundamentalPeriod[],
) {
  const fmpByPeriodEnd = byPeriodEnd(fmpPeriods);
  const discrepancies: ReconciliationDiscrepancy[] = [];
  let comparedCount = 0;

  for (const secPeriod of secPeriods) {
    const fmpPeriod = fmpByPeriodEnd.get(secPeriod.periodEnd);

    if (!fmpPeriod) {
      continue;
    }

    for (const metric of RECONCILED_METRICS) {
      const secValue = numericMetric(secPeriod, metric.metricName);
      const fmpValue = numericMetric(fmpPeriod, metric.metricName);

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
