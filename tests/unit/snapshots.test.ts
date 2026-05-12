import { describe, expect, it } from "vitest";

import { computeThemeSnapshot } from "@/lib/snapshots/scoring";
import type {
  SnapshotCandidateInput,
  SnapshotEvidenceInput,
  SnapshotThemeInput,
} from "@/lib/snapshots/types";

function theme(
  overrides: Partial<SnapshotThemeInput> = {},
): SnapshotThemeInput {
  return {
    directBeneficiaryCategories: [
      {
        normalized_label: "accelerator",
      },
    ],
    economicMechanism: {
      summary:
        "Demand driver maps to constrained accelerator supply, pricing power, and direct beneficiary revenue capture through products with measurable exposure.",
    },
    excludedCategories: [
      {
        normalized_label: "generic software",
      },
    ],
    invalidationRules: [
      {
        rule: "demand falls",
      },
    ],
    requiredEconomicProof: [
      {
        metric: "capex",
      },
    ],
    seedEtfs: ["TEST"],
    sourceThemeCode: "TST",
    status: "ACTIVE_SCANNED",
    themeId: "theme",
    themeName: "Snapshot Test Theme",
    themeSlug: "snapshot-test-theme",
    ...overrides,
  };
}

function evidence(count = 6): SnapshotEvidenceInput[] {
  return Array.from({ length: count }, (_, index) => ({
    evidenceGrade: "B",
    fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
    freshnessScore: 95,
    metricName: `t3.metric_${index}`,
    reasonCode: "FUNDAMENTAL_REVENUE_GROWING",
  }));
}

function candidate(
  ticker: string,
  overrides: Partial<SnapshotCandidateInput> = {},
): SnapshotCandidateInput {
  return {
    beneficiaryType: "DIRECT_BENEFICIARY",
    candidateStatus: "ACTIVE",
    companyName: `${ticker} Inc.`,
    dashboardVisible: true,
    displayGroup: "Direct beneficiaries",
    finalState: "SINGLE_STOCK_RESEARCH_JUSTIFIED",
    lastScannedAt: new Date("2026-05-12T00:00:00.000Z"),
    rejectionReasonCodes: [],
    reviewPriorityScore: 80,
    securityId: `security-${ticker}`,
    t3: {
      evidenceIds: [`${ticker}-t3`],
      reasonCodes: ["FUNDAMENTAL_REVENUE_GROWING"],
      score: 80,
      state: "VALIDATED",
    },
    t4: {
      evidenceIds: [`${ticker}-t4`],
      reasonCodes: ["PRICE_LEADER", "PRICE_RS_VS_THEME_POSITIVE"],
      score: 80,
      state: "LEADER",
    },
    t6: {
      evidenceIds: [`${ticker}-t6`],
      reasonCodes: ["LIQUIDITY_CORE_ELIGIBLE"],
      score: 0,
      state: "CORE_ELIGIBLE",
    },
    t8: {
      evidenceIds: [`${ticker}-t8`],
      reasonCodes: ["DECISION_SINGLE_STOCK_RESEARCH_JUSTIFIED"],
      score: 80,
      state: "SINGLE_STOCK_RESEARCH_JUSTIFIED",
    },
    t8Detail: {
      algorithm_version: "test",
      blocking_reason_codes: [],
      data_freshness_warning: false,
      display_group: "Direct beneficiaries",
      evidence_count: 4,
      expression: "research",
      final_state: "SINGLE_STOCK_RESEARCH_JUSTIFIED",
      next_state_to_watch: "stability",
      primary_reason: "DECISION_SINGLE_STOCK_RESEARCH_JUSTIFIED",
      reason_codes: ["DECISION_SINGLE_STOCK_RESEARCH_JUSTIFIED"],
      review_priority_score: 80,
      supporting_reason_codes: [],
      threshold_version: "test",
    },
    ticker,
    topPassReason: "DECISION_SINGLE_STOCK_RESEARCH_JUSTIFIED",
    ...overrides,
  };
}

describe("Phase 11 theme snapshot scoring", () => {
  it("classifies a high-reality theme with clean direct beneficiaries as worth checking out", () => {
    const result = computeThemeSnapshot({
      candidates: [candidate("AAA"), candidate("BBB"), candidate("CCC")],
      evidenceRows: evidence(),
      theme: theme(),
    });

    expect(result.dashboardState).toBe("WORTH_CHECKING_OUT");
    expect(result.directBeneficiaryCount).toBe(3);
    expect(result.investableCandidateCount).toBe(3);
    expect(result.themeReality.final_score).toBeGreaterThanOrEqual(60);
    expect(result.highlightReasonCodes).toContain(
      "DEMAND_MULTIPLE_BENEFICIARIES_VALIDATE",
    );
  });

  it("classifies high reality with broad extended leaders as confirmed but extended", () => {
    const result = computeThemeSnapshot({
      candidates: [
        candidate("AAA", {
          finalState: "LEADER_BUT_EXTENDED",
          t4: {
            evidenceIds: ["AAA-t4"],
            reasonCodes: ["PRICE_LEADER_EXTENDED"],
            score: 82,
            state: "LEADER_BUT_EXTENDED",
          },
        }),
        candidate("BBB", {
          finalState: "LEADER_BUT_EXTENDED",
          t4: {
            evidenceIds: ["BBB-t4"],
            reasonCodes: ["PRICE_LEADER_EXTENDED"],
            score: 82,
            state: "LEADER_BUT_EXTENDED",
          },
        }),
      ],
      evidenceRows: evidence(),
      theme: theme(),
    });

    expect(result.dashboardState).toBe("CONFIRMED_BUT_EXTENDED");
    expect(result.leaderButExtendedCount).toBe(2);
  });

  it("does not call a high-reality theme clean when every ticker fails expression", () => {
    const result = computeThemeSnapshot({
      candidates: [
        candidate("AAA", {
          finalState: "NO_TRADE",
          rejectionReasonCodes: ["DECISION_NO_TRADE"],
          topFailReason: "DECISION_NO_TRADE",
        }),
        candidate("BBB", {
          finalState: "WRONG_TICKER",
          rejectionReasonCodes: ["DECISION_WRONG_TICKER"],
          topFailReason: "DECISION_WRONG_TICKER",
        }),
      ],
      evidenceRows: evidence(),
      theme: theme(),
    });

    expect(result.dashboardState).toBe("NO_CLEAN_EXPRESSION");
    expect(result.topRejectedTickers.map((row) => row.ticker)).toEqual([
      "AAA",
      "BBB",
    ]);
  });

  it("keeps weak or unmeasured themes in insufficient evidence", () => {
    const result = computeThemeSnapshot({
      candidates: [],
      evidenceRows: [],
      theme: theme({
        directBeneficiaryCategories: [],
        economicMechanism: "",
        requiredEconomicProof: [],
      }),
    });

    expect(result.dashboardState).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.themeReality.final_score).toBe(0);
    expect(result.cautionReasonCodes).toContain("DEMAND_PROOF_MISSING");
  });
});
