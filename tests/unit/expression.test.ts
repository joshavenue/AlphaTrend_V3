import { describe, expect, it } from "vitest";

import {
  assertNoAdviceLanguage,
  calculateThemeDispersionRisk,
  scoreExpressionDecision,
} from "@/lib/expression/scoring";
import type {
  ExpressionCandidateForDispersion,
  ExpressionCandidateInput,
  ThemeDispersionRiskDetail,
} from "@/lib/expression/types";
import type { LiquidityScoreDetail } from "@/lib/liquidity/types";
import type { PriceScoreDetail } from "@/lib/price/types";

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

function input(
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
      score: 75,
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
    ticker: "TEST",
    ...overrides,
  };
}

function highDispersion(): ThemeDispersionRiskDetail {
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
  };
}

describe("Phase 10 T8 expression decision scoring", () => {
  it("exposure below 30 returns wrong ticker", () => {
    const result = scoreExpressionDecision(
      input({
        t1: {
          evidenceIds: ["t1"],
          reasonCodes: ["EXPOSURE_NO_DIRECT_OR_INDIRECT_MATCH"],
          score: 12,
          state: "UNRELATED",
        },
      }),
    );

    expect(result.finalState).toBe("WRONG_TICKER");
    expect(result.candidateStatus).toBe("REJECTED");
    expect(result.rejectionReasonCodes).toContain("DECISION_WRONG_TICKER");
  });

  it("severe dilution returns no trade", () => {
    const result = scoreExpressionDecision(
      input({
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

  it("recent offering warning without material share growth is not a veto", () => {
    const result = scoreExpressionDecision(
      input({
        t6: {
          evidenceIds: ["t6"],
          reasonCodes: ["DILUTION_RECENT_OFFERING"],
          score: 14,
          state: "CORE_ELIGIBLE",
        },
        t6Detail: liquidityDetail({
          dilution_risk_state: "MODERATE",
          metrics: {
            convertibleFinancingCount: 0,
            goingConcernFilingCount: 0,
            recentOfferingCount: 5,
            reverseSplitCount: 0,
            shareCountGrowthYoy: undefined,
          },
          reason_codes: ["DILUTION_RECENT_OFFERING"],
          veto_flags: [],
        }),
      }),
    );

    expect(result.finalState).toBe("SINGLE_STOCK_RESEARCH_JUSTIFIED");
  });

  it("recent material offering veto returns no trade", () => {
    const result = scoreExpressionDecision(
      input({
        t6: {
          evidenceIds: ["t6"],
          reasonCodes: ["DILUTION_RECENT_OFFERING"],
          score: 22,
          state: "CORE_ELIGIBLE",
        },
        t6Detail: liquidityDetail({
          dilution_risk_state: "HIGH",
          metrics: {
            convertibleFinancingCount: 0,
            goingConcernFilingCount: 0,
            recentOfferingCount: 3,
            reverseSplitCount: 0,
            shareCountGrowthYoy: 0.17,
          },
          reason_codes: ["DILUTION_RECENT_OFFERING"],
          veto_flags: ["RECENT_MATERIAL_OFFERING"],
        }),
      }),
    );

    expect(result.finalState).toBe("NO_TRADE");
    expect(result.rejectionReasonCodes).not.toContain(
      "LIQUIDITY_CORE_ELIGIBLE",
    );
    expect(result.rejectionReasonCodes).toContain("DILUTION_RECENT_OFFERING");
  });

  it("going concern plus weak fundamentals is a no-trade decision", () => {
    const result = scoreExpressionDecision(
      input({
        t3: {
          evidenceIds: ["t3"],
          reasonCodes: ["FUNDAMENTAL_CRITICAL_DATA_MISSING"],
          score: 30,
          state: "NOT_YET_VALIDATED",
        },
        t6: {
          evidenceIds: ["t6"],
          reasonCodes: ["FRAGILITY_GOING_CONCERN"],
          score: 20,
          state: "CORE_ELIGIBLE",
        },
        t6Detail: liquidityDetail({
          metrics: {
            convertibleFinancingCount: 0,
            goingConcernFilingCount: 1,
            recentOfferingCount: 0,
            reverseSplitCount: 0,
          },
          reason_codes: ["FRAGILITY_GOING_CONCERN"],
        }),
      }),
    );

    expect(result.finalState).toBe("NO_TRADE");
    expect(result.topFailReason).toBe("Going concern plus weak fundamentals");
  });

  it("not validated fundamentals returns watchlist only", () => {
    const result = scoreExpressionDecision(
      input({
        t3: {
          evidenceIds: ["t3"],
          reasonCodes: ["FUNDAMENTAL_CRITICAL_DATA_MISSING"],
          score: 35,
          state: "NOT_YET_VALIDATED",
        },
      }),
    );

    expect(result.finalState).toBe("WATCHLIST_ONLY");
  });

  it("leader but extended returns leader but extended", () => {
    const result = scoreExpressionDecision(
      input({
        priceDetail: priceDetail({
          extension: {
            extended: true,
            extreme: false,
          },
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
          score: 65,
          state: "LEADER_BUT_EXTENDED",
        },
      }),
    );

    expect(result.finalState).toBe("LEADER_BUT_EXTENDED");
  });

  it("high dispersion returns basket preferred for quality candidates", () => {
    const result = scoreExpressionDecision(input(), highDispersion());

    expect(result.finalState).toBe("BASKET_PREFERRED");
    expect(result.detail.theme_dispersion_risk?.state).toBe("HIGH");
  });

  it("eligible high-quality candidate returns single-stock research justified", () => {
    const result = scoreExpressionDecision(input());

    expect(result.finalState).toBe("SINGLE_STOCK_RESEARCH_JUSTIFIED");
    expect(result.topPassReason).toBe("All required ticker gates pass");
    expect(() => assertNoAdviceLanguage(result)).not.toThrow();
  });

  it("calculates high dispersion when many quality candidates are close", () => {
    const candidates: ExpressionCandidateForDispersion[] = [
      90, 86, 83, 81, 79,
    ].map((score, index) => ({
      ...input({
        priceDetail: priceDetail({
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
        ticker: `T${index}`,
      }),
      provisionalPriorityScore: score,
    }));
    const result = calculateThemeDispersionRisk(candidates, {
      seedEtfCount: 2,
    });

    expect(result.state).toBe("HIGH");
    expect(result.reason_codes).toContain(
      "DISPERSION_MULTIPLE_QUALITY_CANDIDATES",
    );
  });
});
