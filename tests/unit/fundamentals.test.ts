import { describe, expect, it } from "vitest";

import { scoreFundamentalValidation } from "@/lib/fundamentals/scoring";
import type {
  FundamentalPeriod,
  FundamentalScoringInput,
  ReconciliationSummary,
} from "@/lib/fundamentals/types";

function quarter(
  periodEnd: string,
  input: Partial<FundamentalPeriod>,
): FundamentalPeriod {
  return {
    periodEnd,
    periodType: "quarter",
    source: "MERGED",
    ...input,
  };
}

function input(
  periods: FundamentalPeriod[],
  overrides: Partial<FundamentalScoringInput> = {},
): FundamentalScoringInput {
  return {
    financials: {
      annualPeriods: [],
      provider: "MERGED",
      quarterlyPeriods: periods,
    },
    reconciliation: {
      comparedCount: 5,
      discrepancies: [],
      materialDisagreementCount: 0,
    },
    segmentEvidence: "direct_business_line",
    t1ExposureScore: 75,
    t1State: "DIRECT_BENEFICIARY",
    ...overrides,
  };
}

const healthyPeriods = [
  quarter("2026-03-31", {
    cashAndEquivalents: 500,
    dilutedShares: 100,
    freeCashFlow: 28,
    grossProfit: 65,
    operatingIncome: 39,
    revenue: 130,
    totalAssets: 1_000,
    totalDebt: 100,
  }),
  quarter("2025-12-31", {
    dilutedShares: 100,
    freeCashFlow: 20,
    grossProfit: 55,
    operatingIncome: 31,
    revenue: 115,
  }),
  quarter("2025-09-30", {
    dilutedShares: 100,
    freeCashFlow: 18,
    grossProfit: 50,
    operatingIncome: 28,
    revenue: 110,
  }),
  quarter("2025-06-30", {
    dilutedShares: 100,
    freeCashFlow: 17,
    grossProfit: 48,
    operatingIncome: 27,
    revenue: 105,
  }),
  quarter("2025-03-31", {
    dilutedShares: 100,
    freeCashFlow: 10,
    grossProfit: 40,
    operatingIncome: 22,
    revenue: 100,
  }),
  quarter("2024-12-31", {
    dilutedShares: 100,
    freeCashFlow: 9,
    grossProfit: 38,
    operatingIncome: 20,
    revenue: 95,
  }),
];

describe("Phase 7 T3 fundamental validation scoring", () => {
  it("revenue_accelerating_margin_expanding_validated", () => {
    const result = scoreFundamentalValidation(
      input(healthyPeriods, {
        guidanceSupport: "qualitative",
        segmentEvidence: "growing_reported",
      }),
    );

    expect(result.state).toBe("VALIDATED");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_REVENUE_ACCELERATING",
    );
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_GROSS_MARGIN_EXPANDING",
    );
  });

  it("revenue_up_margin_down_share_dilution_not_validated", () => {
    const result = scoreFundamentalValidation(
      input([
        quarter("2026-03-31", {
          cashAndEquivalents: 400,
          dilutedShares: 130,
          freeCashFlow: 5,
          grossProfit: 36,
          operatingIncome: 12,
          revenue: 120,
          totalDebt: 100,
        }),
        quarter("2025-12-31", {
          dilutedShares: 120,
          revenue: 112,
        }),
        quarter("2025-09-30", {
          dilutedShares: 115,
          revenue: 108,
        }),
        quarter("2025-06-30", {
          dilutedShares: 110,
          revenue: 104,
        }),
        quarter("2025-03-31", {
          dilutedShares: 100,
          freeCashFlow: 10,
          grossProfit: 50,
          operatingIncome: 25,
          revenue: 100,
        }),
        quarter("2024-12-31", {
          dilutedShares: 100,
          revenue: 96,
        }),
      ]),
    );

    expect(result.state).not.toBe("VALIDATED");
    expect(result.score).toBeLessThanOrEqual(49);
    expect(result.scoreDetail.caps_applied).toContain("severe_dilution");
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_SEVERE_DILUTION",
    );
  });

  it("missing_revenue_blocks_validated", () => {
    const result = scoreFundamentalValidation(
      input(
        [
          quarter("2026-03-31", {
            cashAndEquivalents: 100,
            grossProfit: 50,
          }),
        ],
        {
          reconciliation: {
            comparedCount: 0,
            discrepancies: [],
            materialDisagreementCount: 0,
          },
        },
      ),
    );

    expect(result.state).toBe("INSUFFICIENT_DATA");
    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_CRITICAL_DATA_MISSING",
    );
  });

  it("only_management_language_not_yet_validated", () => {
    const result = scoreFundamentalValidation(
      input(
        [
          quarter("2026-03-31", {
            cashAndEquivalents: 100,
            freeCashFlow: 5,
            grossProfit: 40,
            operatingIncome: 12,
            revenue: 100,
            totalDebt: 10,
          }),
          quarter("2025-12-31", {
            revenue: 100,
          }),
          quarter("2025-09-30", {
            revenue: 100,
          }),
          quarter("2025-06-30", {
            revenue: 100,
          }),
          quarter("2025-03-31", {
            freeCashFlow: 4,
            grossProfit: 40,
            operatingIncome: 12,
            revenue: 100,
          }),
        ],
        {
          guidanceSupport: "generic",
          reconciliation: {
            comparedCount: 0,
            discrepancies: [],
            materialDisagreementCount: 0,
          },
          segmentEvidence: "none",
          t1State: "INDIRECT_BENEFICIARY",
        },
      ),
    );

    expect(result.state).toBe("NOT_YET_VALIDATED");
    expect(result.score).toBeLessThan(60);
  });

  it("material_sec_fmp_disagreement_caps_score", () => {
    const reconciliation: ReconciliationSummary = {
      comparedCount: 5,
      discrepancies: [
        {
          absoluteDifference: 25_000_000,
          fmpValue: 155_000_000,
          material: true,
          metricName: "revenue",
          percentDifference: 0.16,
          periodEnd: "2026-03-31",
          preferredSource: "SEC",
          secValue: 130_000_000,
        },
      ],
      materialDisagreementCount: 1,
    };
    const result = scoreFundamentalValidation(
      input(healthyPeriods, {
        reconciliation,
        segmentEvidence: "growing_reported",
      }),
    );

    expect(result.score).toBeLessThanOrEqual(59);
    expect(result.state).not.toBe("VALIDATED");
    expect(result.scoreDetail.caps_applied).toContain(
      "material_sec_fmp_disagreement",
    );
  });

  it("severe_dilution_caps_score_and_blocks_validated", () => {
    const result = scoreFundamentalValidation(
      input(
        healthyPeriods.map((period, index) =>
          index === 0
            ? {
                ...period,
                dilutedShares: 130,
              }
            : period,
        ),
        {
          segmentEvidence: "growing_reported",
        },
      ),
    );

    expect(result.score).toBeLessThanOrEqual(49);
    expect(result.state).not.toBe("VALIDATED");
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_SEVERE_DILUTION",
    );
  });

  it("declining_revenue_margin_fcf_deteriorating", () => {
    const result = scoreFundamentalValidation(
      input([
        quarter("2026-03-31", {
          freeCashFlow: -20,
          grossProfit: 14,
          operatingIncome: -10,
          revenue: 70,
        }),
        quarter("2025-12-31", {
          freeCashFlow: -10,
          revenue: 80,
        }),
        quarter("2025-09-30", {
          revenue: 85,
        }),
        quarter("2025-06-30", {
          revenue: 90,
        }),
        quarter("2025-03-31", {
          freeCashFlow: -5,
          grossProfit: 50,
          operatingIncome: 20,
          revenue: 100,
        }),
      ]),
    );

    expect(result.state).toBe("DETERIORATING");
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_REVENUE_DECLINING",
    );
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_MARGIN_COMPRESSING",
    );
  });
});
