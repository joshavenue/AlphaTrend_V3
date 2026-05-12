import { describe, expect, it } from "vitest";

import {
  mergeFundamentalData,
  normalizeSecCompanyFacts,
} from "@/lib/fundamentals/normalization";
import { reconcileFundamentals } from "@/lib/fundamentals/reconciliation";
import { scoreFundamentalValidation } from "@/lib/fundamentals/scoring";
import type {
  FundamentalPeriod,
  FundamentalScoringInput,
  NormalizedFundamentalData,
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

function data(
  quarterlyPeriods: FundamentalPeriod[],
  annualPeriods: FundamentalPeriod[] = [],
  provider: NormalizedFundamentalData["provider"] = "MERGED",
): NormalizedFundamentalData {
  return {
    annualPeriods,
    provider,
    quarterlyPeriods,
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
    expect(result.evidenceDetails).toContainEqual(
      expect.objectContaining({
        metricName: "t3.component.segment_validation",
        reasonCode: "FUNDAMENTAL_SEGMENT_REVENUE_SUPPORT",
      }),
    );
    expect(result.evidenceDetails).toContainEqual(
      expect.objectContaining({
        metricName: "t3.component.balance_sheet_quality",
        reasonCode: "FUNDAMENTAL_BALANCE_SHEET_HEALTHY",
      }),
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

  it("t1_score_below_30_caps_score_and_blocks_upgrade", () => {
    const result = scoreFundamentalValidation(
      input(healthyPeriods, {
        segmentEvidence: "growing_reported",
        t1ExposureScore: 25,
        t1State: "UNRELATED",
      }),
    );

    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.state).not.toBe("VALIDATED");
    expect(result.state).not.toBe("IMPROVING");
    expect(result.scoreDetail.caps_applied).toContain(
      "t1_exposure_score_below_30",
    );
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_T1_EXPOSURE_TOO_LOW",
    );
  });
});

describe("Phase 7 SEC/FMP normalization and reconciliation", () => {
  it("sec_revenue_wins_over_fmp_when_material_difference", () => {
    const sec = data(
      [
        quarter("2026-03-31", {
          fiscalPeriod: "Q1",
          fiscalYear: 2026,
          revenue: 100_000_000,
          source: "SEC",
        }),
      ],
      [],
      "SEC",
    );
    const fmp = data(
      [
        quarter("2026-03-31", {
          fiscalPeriod: "Q1",
          fiscalYear: 2026,
          revenue: 110_000_000,
          source: "FMP",
        }),
      ],
      [],
      "FMP",
    );

    const reconciliation = reconcileFundamentals(sec, fmp);
    const merged = mergeFundamentalData(sec, fmp);

    expect(reconciliation.materialDisagreementCount).toBe(1);
    expect(reconciliation.discrepancies[0]).toMatchObject({
      metricName: "revenue",
      preferredSource: "SEC",
      reasonCode: "DATA_VENDOR_DISAGREEMENT",
    });
    expect(merged.quarterlyPeriods[0]?.revenue).toBe(100_000_000);
  });

  it("small_non_material_difference_no_blocker", () => {
    const sec = data([
      quarter("2026-03-31", {
        fiscalPeriod: "Q1",
        fiscalYear: 2026,
        revenue: 100_000_000,
        source: "SEC",
      }),
    ]);
    const fmp = data([
      quarter("2026-03-31", {
        fiscalPeriod: "Q1",
        fiscalYear: 2026,
        revenue: 101_000_000,
        source: "FMP",
      }),
    ]);

    const reconciliation = reconcileFundamentals(sec, fmp);

    expect(reconciliation.materialDisagreementCount).toBe(0);
    expect(reconciliation.discrepancies).toHaveLength(0);
  });

  it("share_count_difference_above_one_percent_warns", () => {
    const reconciliation = reconcileFundamentals(
      data([
        quarter("2026-03-31", {
          dilutedShares: 100,
          fiscalPeriod: "Q1",
          fiscalYear: 2026,
          source: "SEC",
        }),
      ]),
      data([
        quarter("2026-03-31", {
          dilutedShares: 102,
          fiscalPeriod: "Q1",
          fiscalYear: 2026,
          source: "FMP",
        }),
      ]),
    );

    expect(reconciliation.materialDisagreementCount).toBe(1);
    expect(reconciliation.discrepancies[0]).toMatchObject({
      metricName: "dilutedShares",
      reasonCode: "DATA_VENDOR_DISAGREEMENT",
    });
  });

  it("period_mismatch_does_not_compare", () => {
    const reconciliation = reconcileFundamentals(
      data([
        quarter("2026-03-31", {
          fiscalPeriod: "Q1",
          fiscalYear: 2026,
          revenue: 100,
          source: "SEC",
        }),
      ]),
      data([
        quarter("2026-04-10", {
          fiscalPeriod: "Q1",
          fiscalYear: 2026,
          revenue: 100,
          source: "FMP",
        }),
      ]),
    );

    expect(reconciliation.comparedCount).toBe(0);
    expect(reconciliation.discrepancies[0]).toMatchObject({
      metricName: "period_mismatch",
      preferredSource: "NONE",
      reasonCode: "DATA_PERIOD_MISMATCH",
    });
  });

  it("debt_sum_formula_records_evidence", () => {
    const normalized = normalizeSecCompanyFacts({
      facts: [
        {
          end: "2026-03-31",
          fiscalPeriod: "Q1",
          form: "10-Q",
          tag: "ShortTermDebt",
          unit: "USD",
          value: 25,
        },
        {
          end: "2026-03-31",
          fiscalPeriod: "Q1",
          form: "10-Q",
          tag: "LongTermDebtNoncurrent",
          unit: "USD",
          value: 125,
        },
      ],
      revenueFactTags: [],
    });

    expect(normalized.quarterlyPeriods[0]?.totalDebt).toBe(150);
    expect(normalized.quarterlyPeriods[0]?.sourceTags).toMatchObject({
      debtCurrent: "ShortTermDebt",
      debtNonCurrent: "LongTermDebtNoncurrent",
    });
  });

  it("missing_sec_fact_allows_vendor_with_warning", () => {
    const sec = data([
      quarter("2026-03-31", {
        fiscalPeriod: "Q1",
        fiscalYear: 2026,
        revenue: 100,
        source: "SEC",
      }),
    ]);
    const fmp = data([
      quarter("2026-03-31", {
        fiscalPeriod: "Q1",
        fiscalYear: 2026,
        grossProfit: 50,
        revenue: 100,
        source: "FMP",
      }),
    ]);

    const reconciliation = reconcileFundamentals(sec, fmp);
    const merged = mergeFundamentalData(sec, fmp);

    expect(reconciliation.materialDisagreementCount).toBe(0);
    expect(reconciliation.discrepancies).toContainEqual(
      expect.objectContaining({
        metricName: "grossProfit",
        preferredSource: "FMP",
        reasonCode: "DATA_MISSING",
      }),
    );
    expect(merged.quarterlyPeriods[0]?.grossProfit).toBe(50);
  });

  it("unframed_sec_quarterly_duration_fact_is_not_used_as_discrete_quarter", () => {
    const normalized = normalizeSecCompanyFacts({
      facts: [
        {
          end: "2026-06-30",
          fiscalPeriod: "Q2",
          form: "10-Q",
          start: "2026-01-01",
          tag: "RevenueFromContractWithCustomerExcludingAssessedTax",
          unit: "USD",
          value: 200,
        },
        {
          end: "2026-06-30",
          fiscalPeriod: "Q2",
          form: "10-Q",
          tag: "CashAndCashEquivalentsAtCarryingValue",
          unit: "USD",
          value: 75,
        },
      ],
      revenueFactTags: ["RevenueFromContractWithCustomerExcludingAssessedTax"],
    });

    expect(normalized.quarterlyPeriods[0]?.revenue).toBeUndefined();
    expect(normalized.quarterlyPeriods[0]?.cashAndEquivalents).toBe(75);
  });
});
