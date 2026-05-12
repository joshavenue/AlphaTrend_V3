import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildDashboardThemes } from "@/lib/snapshots/dashboard";
import { buildSnapshotReport } from "@/lib/snapshots/report";
import { buildThemeSnapshots } from "@/lib/snapshots/runner";

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 11 theme snapshot persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("builds snapshot history from stored T8 handoff rows and exposes dashboard data", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P11${suffix}`;
      const ticker = `S11${suffix}`.slice(0, 10);
      const jobRunIds: string[] = [];
      let themeId: string | undefined;
      let securityId: string | undefined;
      let candidateId: string | undefined;

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
                display_label: "accelerator",
                normalized_label: "accelerator",
              },
            ],
            economicMechanism: {
              summary:
                "Demand driver maps to constrained accelerator supply, pricing power, and direct beneficiary revenue capture through products with measurable exposure.",
            },
            excludedCategories: [
              {
                display_label: "generic software",
                normalized_label: "generic software",
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
                metric: "fixture",
              },
            ],
            requiredFundamentalProof: [
              {
                metric: "revenue_growth",
              },
            ],
            seedEtfs: ["P11ETF"],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 11 Test Theme ${suffix}`,
            themeSlug: `phase-11-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        const security = await prisma.security.create({
          data: {
            canonicalTicker: ticker,
            cik: "0000320193",
            companyName: "Phase Eleven Snapshot Inc.",
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
            dashboardVisible: true,
            displayGroup: "Leader but extended",
            finalState: "LEADER_BUT_EXTENDED",
            lastScannedAt: new Date("2026-05-12T00:00:00.000Z"),
            securityId,
            sourceDetail: {
              generator_version: "test",
              source_count: 1,
              source_types: ["MANUAL_SEED_FOR_API_VALIDATION"],
            },
            sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
            themeId,
            tickerReviewPriorityScore: 72,
            topPassReason: "DECISION_LEADER_BUT_EXTENDED",
          },
        });
        candidateId = candidate.themeCandidateId;

        for (let index = 0; index < 6; index += 1) {
          await prisma.evidenceLedger.create({
            data: {
              evidenceGrade: "B",
              metricName: `t3.fixture_metric_${index}`,
              metricValueNum: 1,
              provider: "ALPHATREND_INTERNAL",
              reasonCode: "FUNDAMENTAL_REVENUE_GROWING",
              securityId,
              sourcePayloadHash: `p11-metric-${suffix}-${index}`,
              themeId,
            },
          });
        }

        const t8Evidence = await prisma.evidenceLedger.create({
          data: {
            entityId: candidateId,
            entityType: "theme_candidate",
            evidenceGrade: "B",
            metricName: "t8.expression_decision_detail",
            metricValueNum: 72,
            metricValueText: JSON.stringify({
              algorithm_version: "test",
              blocking_reason_codes: [],
              data_freshness_warning: false,
              display_group: "Leader but extended",
              evidence_count: 4,
              expression: "watch",
              final_state: "LEADER_BUT_EXTENDED",
              next_state_to_watch: "consolidation",
              primary_reason: "DECISION_LEADER_BUT_EXTENDED",
              reason_codes: ["DECISION_LEADER_BUT_EXTENDED"],
              review_priority_score: 72,
              supporting_reason_codes: ["PRICE_LEADER_EXTENDED"],
              threshold_version: "test",
            }),
            provider: "ALPHATREND_INTERNAL",
            reasonCode: "DECISION_LEADER_BUT_EXTENDED",
            securityId,
            sourcePayloadHash: `p11-t8-${suffix}`,
            themeId,
          },
        });

        await prisma.candidateSignalScore.createMany({
          data: [
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [`t1-${suffix}`],
              maxScore: 100,
              reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
              score: 78,
              scoreVersion: "test",
              signalLayer: "T1_EXPOSURE_PURITY",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [`t3-${suffix}`],
              maxScore: 100,
              reasonCodes: ["FUNDAMENTAL_REVENUE_GROWING"],
              score: 75,
              scoreVersion: "test",
              signalLayer: "T3_FUNDAMENTALS",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [`t4-${suffix}`],
              maxScore: 100,
              reasonCodes: ["PRICE_LEADER_EXTENDED"],
              score: 82,
              scoreVersion: "test",
              signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [`t6-${suffix}`],
              maxScore: 100,
              reasonCodes: ["LIQUIDITY_CORE_ELIGIBLE"],
              score: 0,
              scoreVersion: "test",
              signalLayer: "T6_LIQUIDITY_DILUTION_FRAGILITY",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [t8Evidence.evidenceId],
              maxScore: 100,
              reasonCodes: ["DECISION_LEADER_BUT_EXTENDED"],
              score: 72,
              scoreVersion: "test",
              signalLayer: "T8_EXPRESSION_DECISION",
              themeCandidateId: candidateId,
            },
          ],
        });

        await prisma.candidateSignalState.createMany({
          data: [
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [`t1-${suffix}`],
              reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
              signalLayer: "T1_EXPOSURE_PURITY",
              state: "DIRECT_BENEFICIARY",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [`t3-${suffix}`],
              reasonCodes: ["FUNDAMENTAL_REVENUE_GROWING"],
              signalLayer: "T3_FUNDAMENTALS",
              state: "VALIDATED",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [`t4-${suffix}`],
              reasonCodes: ["PRICE_LEADER_EXTENDED"],
              signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
              state: "LEADER_BUT_EXTENDED",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [`t6-${suffix}`],
              reasonCodes: ["LIQUIDITY_CORE_ELIGIBLE"],
              signalLayer: "T6_LIQUIDITY_DILUTION_FRAGILITY",
              state: "CORE_ELIGIBLE",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-05-12T00:00:00.000Z"),
              evidenceIds: [t8Evidence.evidenceId],
              reasonCodes: ["DECISION_LEADER_BUT_EXTENDED"],
              signalLayer: "T8_EXPRESSION_DECISION",
              state: "LEADER_BUT_EXTENDED",
              stateVersion: "test",
              themeCandidateId: candidateId,
            },
          ],
        });

        const first = await buildThemeSnapshots(prisma, {
          themeRef: themeCode,
        });
        const second = await buildThemeSnapshots(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(first.jobRunId, second.jobRunId);

        expect(first.snapshotsBuilt).toBe(1);
        expect(first.themes[0]).toMatchObject({
          dashboardState: "CONFIRMED_BUT_EXTENDED",
          directBeneficiaryCount: 1,
          investableCandidateCount: 1,
        });

        const snapshots = await prisma.themeSnapshot.findMany({
          orderBy: {
            createdAt: "asc",
          },
          where: {
            themeId,
          },
        });

        expect(snapshots).toHaveLength(2);
        expect(snapshots[0]).toMatchObject({
          dashboardState: "CONFIRMED_BUT_EXTENDED",
          directBeneficiaryCount: 1,
          leaderButExtendedCount: 1,
        });

        const dashboard = await buildDashboardThemes(prisma, {
          dashboardState: "CONFIRMED_BUT_EXTENDED",
        });

        expect(
          dashboard.some(
            (row) =>
              row?.source_theme_code === themeCode &&
              row.snapshot?.dashboard_state === "CONFIRMED_BUT_EXTENDED",
          ),
        ).toBe(true);

        await prisma.themeSnapshot.update({
          data: {
            dashboardState: "NO_CLEAN_EXPRESSION",
          },
          where: {
            themeSnapshotId: snapshots[0].themeSnapshotId,
          },
        });

        const staleStateDashboard = await buildDashboardThemes(prisma, {
          dashboardState: "NO_CLEAN_EXPRESSION",
        });

        expect(
          staleStateDashboard.some(
            (row) => row?.source_theme_code === themeCode,
          ),
        ).toBe(false);

        const report = await buildSnapshotReport(prisma, themeCode);

        expect("theme_snapshot" in report).toBe(true);
        if (!("theme_snapshot" in report)) {
          throw new Error("Expected theme-scoped snapshot report.");
        }
        const scopedReport = report as {
          candidate_rows: unknown[];
          theme_snapshot: {
            latest_snapshot?: {
              dashboard_state?: string;
            } | null;
          };
        };

        expect(
          scopedReport.theme_snapshot.latest_snapshot?.dashboard_state,
        ).toBe("CONFIRMED_BUT_EXTENDED");
        expect(scopedReport.candidate_rows).toHaveLength(1);
      } finally {
        if (candidateId) {
          await prisma.candidateSignalScore.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
          await prisma.candidateSignalState.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
        }

        if (themeId) {
          await prisma.themeSnapshot.deleteMany({
            where: {
              themeId,
            },
          });
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
          await prisma.themeDefinition.deleteMany({
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

        if (jobRunIds.length > 0) {
          await prisma.jobLock.deleteMany({
            where: {
              jobRunId: {
                in: jobRunIds,
              },
            },
          });
          await prisma.jobItem.deleteMany({
            where: {
              jobRunId: {
                in: jobRunIds,
              },
            },
          });
          await prisma.jobRun.deleteMany({
            where: {
              jobRunId: {
                in: jobRunIds,
              },
            },
          });
        }
      }
    });
  },
);
