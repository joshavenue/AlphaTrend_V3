import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildExpressionReport } from "@/lib/expression/report";
import { scoreThemeExpressions } from "@/lib/expression/runner";
import type { LiquidityScoreDetail } from "@/lib/liquidity/types";
import type { PriceScoreDetail } from "@/lib/price/types";

function priceDetail(): PriceScoreDetail {
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
      member_count: 1,
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
  };
}

function liquidityDetail(): LiquidityScoreDetail {
  return {
    algorithm_version: "test",
    components: {
      corporate_action_risk: 12,
      debt_cash_runway_risk: 0,
      dilution_risk: 10,
      dollar_volume_risk: 0,
      float_spread_proxy_risk: 0,
      going_concern_auditor_risk: 0,
      market_cap_risk: 0,
    },
    dilution_risk_state: "HIGH",
    final_score: 22,
    fragility_state: "WATCH_RISK",
    liquidity_state: "CORE_ELIGIBLE",
    metrics: {
      convertibleFinancingCount: 0,
      goingConcernFilingCount: 0,
      recentOfferingCount: 3,
      reverseSplitCount: 0,
      shareCountGrowthYoy: 0.17,
    },
    reason_codes: ["DILUTION_RECENT_OFFERING"],
    threshold_version: "test",
    veto_flags: ["RECENT_MATERIAL_OFFERING"],
  };
}

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 10 expression decision persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("writes T8 final state rows and updates candidate display fields", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P10${suffix}`.slice(0, 12);
      const ticker = `PX${suffix}`.slice(0, 10);
      let themeId: string | undefined;
      let securityId: string | undefined;
      let candidateId: string | undefined;
      let jobRunId: string | undefined;

      try {
        const theme = await prisma.themeDefinition.create({
          data: {
            candidateIndustries: [],
            candidateScreenerRules: [
              {
                rule_type: "fixture",
              },
            ],
            defaultDashboardState: "INSUFFICIENT_EVIDENCE",
            directBeneficiaryCategories: [
              {
                display_label: "phase ten fixture",
                normalized_label: "phase ten fixture",
              },
            ],
            economicMechanism: {
              summary: "Phase 10 fixture mechanism",
            },
            excludedCategories: [
              {
                display_label: "excluded fixture",
                normalized_label: "excluded fixture",
              },
            ],
            indirectBeneficiaryCategories: [],
            invalidationRules: [
              {
                rule: "fixture_invalidated",
              },
            ],
            primaryDemandDrivers: [
              {
                label: "fixture",
              },
            ],
            requiredEconomicProof: [
              {
                proof_type: "fixture",
              },
            ],
            requiredFundamentalProof: [
              {
                metric: "share_count_growth",
              },
            ],
            seedEtfs: ["P10ETF"],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 10 Test Theme ${suffix}`,
            themeSlug: `phase-10-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        const security = await prisma.security.create({
          data: {
            canonicalTicker: ticker,
            cik: "0000320193",
            companyName: "Phase Ten Expression Inc.",
            exchange: "NASDAQ",
            isActive: true,
            isEtf: false,
            securityType: "COMMON_STOCK",
            universeBucket: "US_COMMON_ALL",
          },
        });
        securityId = security.securityId;

        const candidate = await prisma.themeCandidate.create({
          data: {
            beneficiaryType: "DIRECT_BENEFICIARY",
            candidateStatus: "WATCH_ONLY",
            dashboardVisible: false,
            displayGroup: "Direct beneficiaries",
            securityId,
            sourceDetail: {
              generator_version: "test",
              source_count: 1,
              source_types: ["MANUAL_SEED_FOR_API_VALIDATION"],
            },
            sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
            themeId,
          },
        });
        candidateId = candidate.themeCandidateId;

        const t4Evidence = await prisma.evidenceLedger.create({
          data: {
            entityId: candidateId,
            entityType: "theme_candidate",
            evidenceGrade: "B",
            metricName: "t4.price_score_detail",
            metricValueText: JSON.stringify(priceDetail()),
            provider: "ALPHATREND_INTERNAL",
            reasonCode: "PRICE_LEADER",
            securityId,
            sourcePayloadHash: `p10-t4-${suffix}`,
            themeId,
          },
        });
        const t6Evidence = await prisma.evidenceLedger.create({
          data: {
            entityId: candidateId,
            entityType: "theme_candidate",
            evidenceGrade: "B",
            metricName: "t6.liquidity_fragility_score_detail",
            metricValueText: JSON.stringify(liquidityDetail()),
            provider: "ALPHATREND_INTERNAL",
            reasonCode: "DILUTION_RECENT_OFFERING",
            securityId,
            sourcePayloadHash: `p10-t6-${suffix}`,
            themeId,
          },
        });

        await prisma.candidateSignalScore.createMany({
          data: [
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: ["t1"],
              maxScore: 100,
              reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
              score: 75,
              scoreVersion: "test",
              signalLayer: "T1_EXPOSURE_PURITY",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: ["t3"],
              maxScore: 100,
              reasonCodes: ["FUNDAMENTAL_REVENUE_GROWING"],
              score: 80,
              scoreVersion: "test",
              signalLayer: "T3_FUNDAMENTALS",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [t4Evidence.evidenceId],
              maxScore: 100,
              reasonCodes: ["PRICE_LEADER"],
              score: 80,
              scoreVersion: "test",
              signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [t6Evidence.evidenceId],
              maxScore: 100,
              reasonCodes: ["DILUTION_RECENT_OFFERING"],
              score: 22,
              scoreVersion: "test",
              signalLayer: "T6_LIQUIDITY_DILUTION_FRAGILITY",
              themeCandidateId: candidateId,
            },
          ],
        });
        await prisma.candidateSignalState.createMany({
          data: [
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: ["t1"],
              reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
              signalLayer: "T1_EXPOSURE_PURITY",
              state: "DIRECT_BENEFICIARY",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: ["t3"],
              reasonCodes: ["FUNDAMENTAL_REVENUE_GROWING"],
              signalLayer: "T3_FUNDAMENTALS",
              state: "VALIDATED",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [t4Evidence.evidenceId],
              reasonCodes: ["PRICE_LEADER"],
              signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
              state: "LEADER",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [t6Evidence.evidenceId],
              reasonCodes: ["DILUTION_RECENT_OFFERING"],
              signalLayer: "T6_LIQUIDITY_DILUTION_FRAGILITY",
              state: "CORE_ELIGIBLE",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
          ],
        });
        await prisma.candidateSignalScore.createMany({
          data: Array.from({ length: 25 }, (_, index) => ({
            computedAt: new Date(Date.UTC(2026, 4, 13, 0, 0, index)),
            evidenceIds: [t4Evidence.evidenceId],
            maxScore: 100,
            reasonCodes: ["PRICE_LEADER"],
            score: 80,
            scoreVersion: "test",
            signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
            themeCandidateId: candidate.themeCandidateId,
          })),
        });
        await prisma.candidateSignalState.createMany({
          data: Array.from({ length: 25 }, (_, index) => ({
            computedAt: new Date(Date.UTC(2026, 4, 13, 0, 0, index)),
            evidenceIds: [t4Evidence.evidenceId],
            reasonCodes: ["PRICE_LEADER"],
            signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
            state: "LEADER",
            stateVersion: "test",
            themeCandidateId: candidate.themeCandidateId,
          })),
        });

        const result = await scoreThemeExpressions(prisma, {
          themeRef: themeCode,
        });
        jobRunId = result.jobRunId;

        expect(result.candidatesScored).toBe(1);
        expect(result.evidenceWritten).toBe(1);

        const updated = await prisma.themeCandidate.findUniqueOrThrow({
          where: {
            themeCandidateId: candidateId,
          },
        });

        expect(updated.finalState).toBe("NO_TRADE");
        expect(updated.candidateStatus).toBe("NO_TRADE");
        expect(updated.dashboardVisible).toBe(true);
        expect(updated.topFailReason).toBe("T6 risk veto");
        expect(Number(updated.tickerReviewPriorityScore)).toBeGreaterThan(0);

        const signalState = await prisma.candidateSignalState.findFirst({
          where: {
            jobRunId,
            signalLayer: "T8_EXPRESSION_DECISION",
            themeCandidateId: candidateId,
          },
        });
        const signalScore = await prisma.candidateSignalScore.findFirst({
          where: {
            jobRunId,
            signalLayer: "T8_EXPRESSION_DECISION",
            themeCandidateId: candidateId,
          },
        });
        const evidence = await prisma.evidenceLedger.findFirst({
          where: {
            jobRunId,
            metricName: "t8.expression_decision_detail",
            securityId,
            themeId,
          },
        });

        expect(signalState?.state).toBe("NO_TRADE");
        expect(Number(signalScore?.score)).toBeGreaterThan(0);
        expect(evidence?.metricValueText?.toLowerCase()).not.toContain("buy");
        expect(evidence?.metricValueText?.toLowerCase()).not.toContain("sell");

        const report = await buildExpressionReport(prisma, themeCode);

        expect(report.total_scored).toBe(1);
        expect(report.candidates[0]).toMatchObject({
          expression: "Research only",
          final_state: "NO_TRADE",
          ticker,
          top_fail_reason: "T6 risk veto",
        });
      } finally {
        if (candidateId) {
          await prisma.candidateSignalState.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
          await prisma.candidateSignalScore.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
        }

        if (themeId) {
          await prisma.evidenceLedger.deleteMany({
            where: {
              themeId,
            },
          });
          await prisma.themeCandidate.deleteMany({
            where: {
              themeId,
            },
          });
        }

        if (securityId) {
          await prisma.security.deleteMany({
            where: {
              securityId,
            },
          });
        }

        if (jobRunId) {
          await prisma.jobLock.deleteMany({
            where: {
              jobRunId,
            },
          });
          await prisma.jobItem.deleteMany({
            where: {
              jobRunId,
            },
          });
          await prisma.jobRun.deleteMany({
            where: {
              jobRunId,
            },
          });
        }

        if (themeId) {
          await prisma.themeDefinition.deleteMany({
            where: {
              themeId,
            },
          });
        }
      }
    });
  },
);
