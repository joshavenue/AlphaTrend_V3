import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildAlertDetail,
  buildAlertsPage,
  buildUnreadAlertCount,
  dismissAlert,
  markAlertRead,
} from "@/lib/app/read-models";
import { evaluateAlerts } from "@/lib/alerts/runner";
import { createPrismaClient } from "@/lib/db/prisma";

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 13 state history and alert generation",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("baselines current states, alerts on changes, applies cooldown, and supports read/dismiss APIs", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P13${suffix}`;
      const ticker = `A13${suffix}`.slice(0, 10);
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
                "Demand driver maps to constrained supply and direct beneficiary revenue capture.",
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
            seedEtfs: ["P13ETF"],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 13 Test Theme ${suffix}`,
            themeSlug: `phase-13-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        const security = await prisma.security.create({
          data: {
            canonicalTicker: ticker,
            cik: "0000320193",
            companyName: "Phase Thirteen Alerts Inc.",
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
            displayGroup: "Watchlist only",
            finalState: "WATCHLIST_ONLY",
            lastScannedAt: new Date("2026-05-12T00:00:00.000Z"),
            securityId,
            sourceDetail: {
              generator_version: "test",
              source_count: 1,
              source_types: ["MANUAL_SEED_FOR_API_VALIDATION"],
            },
            sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
            themeId,
            tickerReviewPriorityScore: 50,
            topPassReason: "DECISION_WATCHLIST_ONLY",
          },
        });
        candidateId = candidate.themeCandidateId;

        const snapshot = await prisma.themeSnapshot.create({
          data: {
            basketPreferred: false,
            cautionReasonCodes: [],
            dashboardState: "EARLY_WATCHLIST",
            dataQualityScore: 80,
            delayedCatchupCount: 0,
            directBeneficiaryCount: 1,
            etfPreferred: false,
            highlightReasonCodes: ["DEMAND_MECHANISM_SPECIFIC"],
            investableCandidateCount: 1,
            lastScannedAt: new Date("2026-05-12T00:00:00.000Z"),
            leaderButExtendedCount: 0,
            leaderCount: 0,
            noTradeCount: 0,
            snapshotDate: new Date("2026-05-12T00:00:00.000Z"),
            themeId,
            themeRealityScore: 55,
            themeReviewPriorityScore: 50,
            topDirectBeneficiaries: [],
            topRejectedTickers: [],
            watchlistOnlyCount: 1,
            wrongTickerCount: 0,
          },
        });

        const first = await evaluateAlerts(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(first.jobRunId);

        expect(first.alertsCreated).toBe(0);
        expect(first.baselinesCreated).toBe(2);

        await prisma.themeCandidate.update({
          data: {
            finalState: "BASKET_PREFERRED",
            topPassReason: "DECISION_BASKET_PREFERRED",
          },
          where: {
            themeCandidateId: candidateId,
          },
        });

        const second = await evaluateAlerts(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(second.jobRunId);

        expect(second.alertsCreated).toBe(1);

        const finalAlert = await prisma.alert.findFirstOrThrow({
          where: {
            alertType: "FINAL_STATE_CHANGED",
            themeCandidateId: candidateId,
          },
        });

        expect(finalAlert.reasonCodes).toContain("ALERT_FINAL_STATE_CHANGED");

        const detail = await buildAlertDetail(finalAlert.alertId);
        expect(detail?.signal_state).toMatchObject({
          current_state: "BASKET_PREFERRED",
          previous_state: "WATCHLIST_ONLY",
          state_type: "candidate_final_state",
        });

        await prisma.themeCandidate.update({
          data: {
            finalState: "INVALIDATED",
            topFailReason: "DECISION_INVALIDATED",
          },
          where: {
            themeCandidateId: candidateId,
          },
        });

        const severityBypass = await evaluateAlerts(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(severityBypass.jobRunId);

        expect(severityBypass.alertsCreated).toBe(1);

        const unreadBefore = await buildUnreadAlertCount();
        expect(unreadBefore.unread_count).toBeGreaterThanOrEqual(2);

        const page = await buildAlertsPage({
          limit: 10,
          themeId: themeCode,
        });
        expect(page.rows.length).toBeGreaterThanOrEqual(2);
        expect(page.rows[0]?.reason_metadata?.[0]?.display_label).toBeTruthy();

        const missingThemePage = await buildAlertsPage({
          limit: 10,
          themeId: `${themeCode}_MISSING`,
        });
        expect(missingThemePage.rows).toEqual([]);
        expect(missingThemePage.pagination).toMatchObject({
          hasMore: false,
          nextCursor: null,
        });

        const missingSecurityPage = await buildAlertsPage({
          limit: 10,
          securityId: `${ticker}_MISSING`,
        });
        expect(missingSecurityPage.rows).toEqual([]);

        const newestAlertId = page.rows[0]?.alert_id;
        expect(newestAlertId).toBeDefined();

        if (!newestAlertId) {
          throw new Error("Expected a generated alert.");
        }

        await expect(markAlertRead(newestAlertId)).resolves.toBe(true);
        const readDetail = await buildAlertDetail(newestAlertId);
        expect(readDetail?.read_at).toBeTruthy();

        await expect(dismissAlert(newestAlertId)).resolves.toBe(true);
        const dismissedDetail = await buildAlertDetail(newestAlertId);
        expect(dismissedDetail?.dismissed_at).toBeTruthy();
        await expect(markAlertRead(newestAlertId)).resolves.toBe(true);

        const repeat = await evaluateAlerts(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(repeat.jobRunId);

        expect(repeat.alertsCreated).toBe(0);
        expect(repeat.signalStatesWritten).toBe(0);

        await prisma.themeSnapshot.update({
          data: {
            dashboardState: "WORTH_CHECKING_OUT",
            highlightReasonCodes: ["DEMAND_MULTIPLE_BENEFICIARIES_VALIDATE"],
          },
          where: {
            themeSnapshotId: snapshot.themeSnapshotId,
          },
        });

        const themeChange = await evaluateAlerts(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(themeChange.jobRunId);

        expect(themeChange.alertsCreated).toBe(1);

        await prisma.themeSnapshot.update({
          data: {
            dashboardState: "EARLY_WATCHLIST",
          },
          where: {
            themeSnapshotId: snapshot.themeSnapshotId,
          },
        });

        const suppressed = await evaluateAlerts(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(suppressed.jobRunId);

        expect(suppressed.alertsCreated).toBe(0);
        expect(suppressed.changesSuppressed).toBe(1);
      } finally {
        if (themeId || candidateId) {
          await prisma.watchlistItem.deleteMany({
            where: {
              OR: [
                { themeId },
                { themeCandidateId: candidateId },
                { securityId },
              ],
            },
          });
          await prisma.alert.deleteMany({
            where: {
              OR: [
                { themeId },
                { themeCandidateId: candidateId },
                { securityId },
              ],
            },
          });
          await prisma.signalState.deleteMany({
            where: {
              OR: [
                { themeId },
                { themeCandidateId: candidateId },
                { securityId },
              ],
            },
          });
        }

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
