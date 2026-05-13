import { describe, expect, it } from "vitest";

import manifest from "@/tests/fixtures/regression/phase15-regression-manifest.json";
import providerFixture from "@/tests/fixtures/providers/provider-parser-smoke.json";
import {
  calculateThemeDispersionRisk,
  scoreExpressionDecision,
} from "@/lib/expression/scoring";
import type {
  ExpressionCandidateForDispersion,
  ExpressionCandidateInput,
  ThemeDispersionRiskDetail,
} from "@/lib/expression/types";
import { scoreExposurePurity } from "@/lib/exposure/scoring";
import { T1_REASON_CODES } from "@/lib/exposure/constants";
import type { ExposureScoringInput } from "@/lib/exposure/types";
import { scoreFundamentalValidation } from "@/lib/fundamentals/scoring";
import type {
  FundamentalPeriod,
  ReconciliationSummary,
} from "@/lib/fundamentals/types";
import { scoreLiquidityDilutionFragility } from "@/lib/liquidity/scoring";
import type { LiquidityScoreDetail } from "@/lib/liquidity/types";
import { scorePriceParticipation } from "@/lib/price/scoring";
import type { PriceBar, PriceScoreDetail } from "@/lib/price/types";
import {
  parseMassiveAggregateBars,
  parseSecCompanyTickers,
  parseUsaSpendingAwards,
} from "@/lib/providers/parsers";

const requiredFixtureNames = new Set(manifest.map((entry) => entry.name));

const baseTheme = {
  excludedCategories: [
    {
      display_label: "generic AI software",
      normalized_label: "generic ai software",
    },
  ],
  indirectBeneficiaryCategories: [],
  seedEtfs: [{ symbol: "SMH" }],
  sourceThemeCode: "T001",
  themeId: "00000000-0000-0000-0000-000000000001",
  themeName: "AI Semiconductor Compute",
};

function exposureInput(
  overrides: Partial<ExposureScoringInput>,
): ExposureScoringInput {
  return {
    candidate: {
      sourceDetail: {
        sources: [],
      },
      sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
      themeCandidateId: "00000000-0000-0000-0000-000000000006",
    },
    security: {
      canonicalTicker: "P15",
      companyName: "Phase Fifteen Fixture Inc.",
    },
    theme: {
      ...baseTheme,
      directBeneficiaryCategories: [
        {
          display_label: "GPU",
          normalized_label: "gpu",
        },
      ],
    },
    ...overrides,
  };
}

function liquidityDetail(
  overrides: Partial<LiquidityScoreDetail> = {},
): LiquidityScoreDetail {
  return {
    algorithm_version: "test",
    components: {
      corporate_action_risk: 0,
      debt_cash_runway_risk: 0,
      dilution_risk: 0,
      dollar_volume_risk: 0,
      float_spread_proxy_risk: 0,
      going_concern_auditor_risk: 0,
      market_cap_risk: 0,
    },
    dilution_risk_state: "LOW",
    final_score: 0,
    fragility_state: "NORMAL_RISK",
    liquidity_state: "CORE_ELIGIBLE",
    metrics: {
      convertibleFinancingCount: 0,
      goingConcernFilingCount: 0,
      recentOfferingCount: 0,
      reverseSplitCount: 0,
    },
    reason_codes: ["LIQUIDITY_CORE_ELIGIBLE", "DILUTION_LOW_RISK"],
    threshold_version: "test",
    veto_flags: [],
    ...overrides,
  };
}

function priceDetail(
  overrides: Partial<PriceScoreDetail> = {},
): PriceScoreDetail {
  return {
    algorithm_version: "test",
    caps_applied: [],
    components: {
      drawdown_resilience: 10,
      relative_strength_market: 10,
      relative_strength_sector: 10,
      relative_strength_theme: 10,
      trend_structure: 20,
      volume_confirmation: 10,
    },
    extension: {
      extended: false,
      extreme: false,
    },
    final_score: 80,
    metrics: {
      barCount: 260,
      close: 100,
      date: "2026-05-12",
      daysAbove50dBufferLast5: 5,
      isStale: false,
      tradingDaysSinceLastBar: 0,
    },
    price_state: "LEADER",
    reason_codes: ["PRICE_LEADER"],
    relative_strength: {
      vsTheme1m: 0.05,
      vsTheme3m: 0.1,
    },
    theme_basket: {
      member_count: 3,
      method: "equal_weight_candidates",
    },
    threshold_version: "test",
    valuation: {
      metrics: {
        historyCount: 8,
      },
      reasonCodes: [],
      state: "FAIR",
    },
    ...overrides,
  };
}

function expressionInput(
  overrides: Partial<ExpressionCandidateInput> = {},
): ExpressionCandidateInput {
  return {
    beneficiaryType: "DIRECT_BENEFICIARY",
    candidateStatus: "WATCH_ONLY",
    priceDetail: priceDetail(),
    t1: {
      evidenceIds: ["t1"],
      reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
      score: 75,
      state: "DIRECT_BENEFICIARY",
    },
    t3: {
      evidenceIds: ["t3"],
      reasonCodes: ["FUNDAMENTAL_REVENUE_GROWING"],
      score: 82,
      state: "VALIDATED",
    },
    t4: {
      evidenceIds: ["t4"],
      reasonCodes: ["PRICE_LEADER"],
      score: 80,
      state: "LEADER",
    },
    t6: {
      evidenceIds: ["t6"],
      reasonCodes: ["LIQUIDITY_CORE_ELIGIBLE", "DILUTION_LOW_RISK"],
      score: 0,
      state: "CORE_ELIGIBLE",
    },
    t6Detail: liquidityDetail(),
    themeCandidateId: "candidate",
    ticker: "P15",
    ...overrides,
  };
}

function highDispersion(
  overrides: Partial<ThemeDispersionRiskDetail> = {},
): ThemeDispersionRiskDetail {
  return {
    algorithm_version: "test",
    basket_candidate_count: 5,
    components: {
      etf_or_basket_coverage_quality: 6,
      evidence_uncertainty: 0,
      extension_or_valuation_spread: 15,
      quality_candidate_breadth: 18,
      single_name_risk: 6,
      top_candidate_score_closeness: 20,
    },
    eligible_candidate_count: 5,
    etf_coverage_quality: 6,
    reason_codes: [
      "DISPERSION_MULTIPLE_QUALITY_CANDIDATES",
      "DISPERSION_NO_CLEAR_SINGLE_LEADER",
    ],
    state: "HIGH",
    threshold_version: "test",
    total_score: 65,
    ...overrides,
  };
}

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
    revenue: 110,
  }),
  quarter("2025-06-30", {
    dilutedShares: 100,
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
    revenue: 95,
  }),
];

function previousTradingDay(date: Date) {
  const next = new Date(date);

  do {
    next.setUTCDate(next.getUTCDate() - 1);
  } while (next.getUTCDay() === 0 || next.getUTCDay() === 6);

  return next;
}

function tradingDates(count: number, endIso = "2026-05-11") {
  const dates: string[] = [];
  let cursor = new Date(`${endIso}T00:00:00.000Z`);

  while (dates.length < count) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
      dates.unshift(cursor.toISOString().slice(0, 10));
    }

    cursor = previousTradingDay(cursor);
  }

  return dates;
}

function bars(
  count: number,
  options: {
    dailyReturn?: number;
    endIso?: string;
    recentBoost?: number;
    recentDays?: number;
    start?: number;
  } = {},
): PriceBar[] {
  const dates = tradingDates(count, options.endIso);
  let close = options.start ?? 100;

  return dates.map((date, index) => {
    const inRecentWindow =
      index >= count - (options.recentDays ?? 30) && index < count;
    const open = close;
    close *=
      1 +
      (options.dailyReturn ?? 0.001) +
      (inRecentWindow ? (options.recentBoost ?? 0) : 0);

    return {
      close,
      date,
      high: Math.max(open, close) * 1.004,
      low: Math.min(open, close) * 0.996,
      open,
      volume: 1_000_000 + index * 1_000,
      vwap: (open + close) / 2,
    };
  });
}

describe("Phase 15 named regression fixtures", () => {
  it("keeps the fixture manifest aligned with executable cases", () => {
    for (const name of [
      "keyword_only_ai_ticker_rejected",
      "same_sector_wrong_mechanism_rejected",
      "direct_beneficiary_validated",
      "seed_etf_only_cannot_pass_exposure",
      "leader_but_extended",
      "delayed_catchup_candidate",
      "severe_dilution_no_trade",
      "illiquid_microcap_speculative_only",
      "theme_high_reality_no_clean_expression",
      "theme_high_reality_all_extended",
      "stale_price_no_alert",
      "vendor_disagreement_warning",
      "manual_seed_not_investable_until_gates_pass",
      "price_only_false_alert",
      "missing_critical_data",
      "no_clean_public_equity_expression",
    ]) {
      expect(requiredFixtureNames.has(name), name).toBe(true);
    }
  });

  it("uses provider fixture payloads instead of live provider calls", () => {
    expect(parseSecCompanyTickers(providerFixture.secCompanyTickers)).toEqual([
      expect.objectContaining({
        cik: "0000320193",
        ticker: "AAPL",
      }),
    ]);
    expect(
      parseMassiveAggregateBars(providerFixture.massiveAggregateBars),
    ).toEqual([
      expect.objectContaining({
        close: 189.98,
        date: "2026-05-08",
      }),
    ]);
    expect(parseUsaSpendingAwards(providerFixture.usaSpendingAwards)).toEqual([
      expect.objectContaining({
        naics: "336411",
        psc: "1550",
        recipientDuns: "123456789",
        recipientUei: "UEI123456789",
      }),
    ]);
  });

  it("keyword_only_ai_ticker_rejected", () => {
    const result = scoreExposurePurity(
      exposureInput({
        fmpProfile: {
          description: "The company offers AI technology services.",
          industry: "Software",
          sector: "Technology",
          symbol: "P15",
        },
        theme: {
          ...baseTheme,
          directBeneficiaryCategories: [
            {
              display_label: "AI",
              normalized_label: "ai",
            },
          ],
        },
      }),
    );

    expect(result.score).toBeLessThanOrEqual(29);
    expect(result.candidateStatus).toBe("REJECTED");
    expect(result.scoreDetail.reason_codes).toContain(
      T1_REASON_CODES.KEYWORD_ONLY,
    );
  });

  it("same_sector_wrong_mechanism_rejected", () => {
    const result = scoreExposurePurity(
      exposureInput({
        fmpProfile: {
          industry: "Semiconductors",
          sector: "Technology",
          symbol: "P15",
        },
        theme: {
          ...baseTheme,
          directBeneficiaryCategories: [
            {
              display_label: "semiconductor",
              normalized_label: "semiconductor",
            },
          ],
        },
      }),
    );

    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.beneficiaryType).toBe("SAME_SECTOR_ONLY");
    expect(result.candidateStatus).toBe("REJECTED");
  });

  it("direct_beneficiary_validated", () => {
    const result = scoreExpressionDecision(expressionInput());

    expect(result.finalState).toBe("SINGLE_STOCK_RESEARCH_JUSTIFIED");
    expect(result.candidateStatus).toBe("ACTIVE");
  });

  it("seed_etf_only_cannot_pass_exposure", () => {
    const result = scoreExposurePurity(
      exposureInput({
        candidate: {
          sourceDetail: {
            sources: [
              {
                details: {
                  etf_symbol: "SMH",
                },
                source_key: "etf_holding:SMH:P15",
                source_type: "SEED_ETF_HOLDING",
                source_weight: 2.1,
                ticker: "P15",
              },
            ],
          },
          sourceOfInclusion: "SEED_ETF_HOLDING",
          themeCandidateId: "00000000-0000-0000-0000-000000000006",
        },
      }),
    );

    expect(result.score).toBeLessThan(30);
    expect(result.candidateStatus).toBe("REJECTED");
    expect(result.scoreDetail.caps_applied).toContain("seed_etf_only_cap");
  });

  it("leader_but_extended", () => {
    const result = scoreExpressionDecision(
      expressionInput({
        priceDetail: priceDetail({
          extension: {
            extended: true,
            extreme: false,
          },
          price_state: "LEADER_BUT_EXTENDED",
        }),
        t4: {
          evidenceIds: ["t4"],
          reasonCodes: ["PRICE_LEADER_EXTENDED"],
          score: 70,
          state: "LEADER_BUT_EXTENDED",
        },
      }),
    );

    expect(result.finalState).toBe("LEADER_BUT_EXTENDED");
    expect(result.candidateStatus).toBe("WATCH_ONLY");
  });

  it("delayed_catchup_candidate", () => {
    const result = scoreExpressionDecision(
      expressionInput({
        t4: {
          evidenceIds: ["t4"],
          reasonCodes: ["PRICE_DELAYED_CATCHUP_IMPROVING"],
          score: 65,
          state: "DELAYED_CATCH_UP_CANDIDATE",
        },
      }),
    );

    expect(result.finalState).toBe("DELAYED_CATCH_UP_CANDIDATE");
  });

  it("severe_dilution_no_trade", () => {
    const result = scoreExpressionDecision(
      expressionInput({
        t6: {
          evidenceIds: ["t6"],
          reasonCodes: ["DILUTION_SEVERE"],
          score: 70,
          state: "CORE_ELIGIBLE",
        },
        t6Detail: liquidityDetail({
          dilution_risk_state: "SEVERE",
          fragility_state: "SEVERE_FRAGILITY",
          reason_codes: ["DILUTION_SEVERE"],
          veto_flags: ["SEVERE_DILUTION"],
        }),
      }),
    );

    expect(result.finalState).toBe("NO_TRADE");
    expect(result.candidateStatus).toBe("NO_TRADE");
  });

  it("illiquid_microcap_speculative_only", () => {
    const result = scoreLiquidityDilutionFragility({
      asOfDate: new Date("2026-05-12T00:00:00.000Z"),
      averageDollarVolume20d: 500_000,
      financialPeriods: [],
      marketCap: 150_000_000,
      metricDate: "2026-05-11",
      priceDataStale: false,
      submissions: [],
    });

    expect(result.liquidityState).toBe("ILLIQUID");
    expect(result.fragilityState).toBe("SEVERE_FRAGILITY");
    expect(result.scoreDetail.veto_flags).toContain("ILLIQUID");
  });

  it("theme_high_reality_no_clean_expression", () => {
    const result = scoreExpressionDecision(
      expressionInput({
        t1: {
          evidenceIds: ["t1"],
          reasonCodes: ["EXPOSURE_NO_DIRECT_OR_INDIRECT_MATCH"],
          score: 15,
          state: "UNRELATED",
        },
        themeRealityScore: 85,
      }),
      highDispersion(),
    );

    expect(result.finalState).toBe("WRONG_TICKER");
  });

  it("theme_high_reality_all_extended", () => {
    const result = scoreExpressionDecision(
      expressionInput({
        priceDetail: priceDetail({
          extension: {
            extended: true,
            extreme: false,
          },
          price_state: "LEADER_BUT_EXTENDED",
        }),
        t4: {
          evidenceIds: ["t4"],
          reasonCodes: ["PRICE_LEADER_EXTENDED"],
          score: 70,
          state: "LEADER_BUT_EXTENDED",
        },
        themeRealityScore: 85,
      }),
      highDispersion(),
    );

    expect(result.finalState).toBe("LEADER_BUT_EXTENDED");
  });

  it("stale_price_no_alert", () => {
    const result = scorePriceParticipation({
      asOfDate: new Date("2026-05-12T00:00:00.000Z"),
      bars: bars(280, {
        endIso: "2026-05-05",
      }),
      qqqBars: bars(280, {
        endIso: "2026-05-05",
      }),
      spyBars: bars(280, {
        endIso: "2026-05-05",
      }),
      t1Score: 75,
      t1State: "DIRECT_BENEFICIARY",
      t3Score: 82,
      t3State: "VALIDATED",
      themeBenchmarkBars: bars(280, {
        endIso: "2026-05-05",
      }),
    });

    expect(result.state).toBe("INSUFFICIENT_DATA");
    expect(result.scoreDetail.reason_codes).toContain("PRICE_STALE_DATA");
    expect(result.scoreDetail.reason_codes).not.toContain("PRICE_LEADER");
  });

  it("vendor_disagreement_warning", () => {
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
    const result = scoreFundamentalValidation({
      financials: {
        annualPeriods: [],
        provider: "MERGED",
        quarterlyPeriods: healthyPeriods,
      },
      reconciliation,
      segmentEvidence: "growing_reported",
      t1ExposureScore: 75,
      t1State: "DIRECT_BENEFICIARY",
    });

    expect(result.score).toBeLessThanOrEqual(59);
    expect(result.scoreDetail.caps_applied).toContain(
      "material_sec_fmp_disagreement",
    );
    expect(result.scoreDetail.reason_codes).toContain(
      "FUNDAMENTAL_SEC_VENDOR_DISAGREEMENT",
    );
  });

  it("manual_seed_not_investable_until_gates_pass", () => {
    const result = scoreExposurePurity(
      exposureInput({
        manualSeed: {
          beneficiaryType: "GPU / accelerator",
          candidateRole: "Direct beneficiary",
          notes: "Manual seed row only.",
        },
      }),
    );

    expect(result.score).toBeLessThan(50);
    expect(result.candidateStatus).toBe("REVIEW_REQUIRED");
    expect(result.beneficiaryType).not.toBe("DIRECT_BENEFICIARY");
  });

  it("price_only_false_alert", () => {
    const result = scoreExpressionDecision(
      expressionInput({
        t1: {
          evidenceIds: ["t1"],
          reasonCodes: ["EXPOSURE_KEYWORD_ONLY"],
          score: 20,
          state: "NARRATIVE_ADJACENT",
        },
        t3: {
          evidenceIds: ["t3"],
          reasonCodes: ["FUNDAMENTAL_CRITICAL_DATA_MISSING"],
          score: 25,
          state: "NOT_YET_VALIDATED",
        },
        t4: {
          evidenceIds: ["t4"],
          reasonCodes: ["PRICE_LEADER"],
          score: 80,
          state: "LEADER",
        },
      }),
    );

    expect(result.finalState).toBe("WRONG_TICKER");
    expect(result.candidateStatus).toBe("REJECTED");
  });

  it("missing_critical_data", () => {
    const result = scoreExpressionDecision(
      expressionInput({
        t6: {
          evidenceIds: [],
          reasonCodes: [],
        },
      }),
    );

    expect(result.finalState).toBe("INSUFFICIENT_DATA");
    expect(result.primaryReasonCode).toBe("DECISION_INSUFFICIENT_DATA");
  });

  it("no_clean_public_equity_expression", () => {
    const candidates: ExpressionCandidateForDispersion[] = [
      91, 88, 84, 80, 78,
    ].map((score, index) => ({
      ...expressionInput({
        priceDetail: priceDetail({
          price_state: "LEADER_BUT_EXTENDED",
          valuation: {
            metrics: {
              historyCount: 8,
            },
            reasonCodes: ["VALUATION_EXPENSIVE"],
            state: "EXPENSIVE",
          },
        }),
        t4: {
          evidenceIds: ["t4"],
          reasonCodes: ["PRICE_LEADER_EXTENDED"],
          score: 70,
          state: "LEADER_BUT_EXTENDED",
        },
        ticker: `P15${index}`,
      }),
      provisionalPriorityScore: score,
    }));
    const dispersion = calculateThemeDispersionRisk(candidates, {
      seedEtfCount: 2,
    });
    const result = scoreExpressionDecision(
      expressionInput({
        themeRealityScore: 85,
      }),
      dispersion,
    );

    expect(dispersion.state).toBe("HIGH");
    expect(["BASKET_PREFERRED", "ETF_PREFERRED"]).toContain(result.finalState);
  });
});
