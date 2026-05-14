import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { scoreAdvancedLayers } from "@/lib/advanced/runner";

function priceBars(count: number, securityId: string, ticker: string) {
  let close = 100;

  return Array.from({ length: count }, (_, index) => {
    close *= 1.0013;
    const barDate = new Date(Date.UTC(2020, 0, index + 1));

    return {
      adjusted: true,
      barDate,
      close,
      high: close * 1.01,
      low: close * 0.99,
      open: close * 0.999,
      provider: "MASSIVE" as const,
      securityId,
      sourcePayloadHash: `phase17-bar-${ticker}-${index}`,
      ticker,
      volume: 1_000_000 + index,
    };
  });
}

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 17 advanced-layer persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("writes T5/T7 context rows without mutating final state, priority, snapshots, or alerts", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P17${suffix}`.slice(0, 12);
      const ticker = `P17${suffix}`.slice(0, 10);
      let themeId: string | undefined;
      let securityId: string | undefined;
      let candidateId: string | undefined;
      const jobRunIds: string[] = [];

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
                display_label: "phase seventeen fixture",
                normalized_label: "phase seventeen fixture",
              },
            ],
            economicMechanism: {
              summary: "Phase 17 fixture mechanism",
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
                metric: "fixture",
              },
            ],
            seedEtfs: [],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 17 Test Theme ${suffix}`,
            themeSlug: `phase-17-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        const security = await prisma.security.create({
          data: {
            canonicalTicker: ticker,
            companyName: "Phase Seventeen Advanced Inc.",
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
            displayGroup: "Direct beneficiaries",
            finalState: "WATCHLIST_ONLY",
            securityId,
            sourceDetail: {
              generator_version: "test",
              source_count: 1,
              source_types: ["MANUAL_SEED_FOR_API_VALIDATION"],
            },
            sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
            themeId,
            tickerReviewPriorityScore: 42.5,
          },
        });
        candidateId = candidate.themeCandidateId;

        await prisma.priceBarDaily.createMany({
          data: priceBars(1500, securityId, ticker),
        });

        const beforeAlertCount = await prisma.alert.count({
          where: {
            themeCandidateId: candidateId,
          },
        });
        const beforeHistoryCount = await prisma.signalState.count({
          where: {
            themeCandidateId: candidateId,
          },
        });

        const result = await scoreAdvancedLayers(prisma, {
          themeRef: themeCode,
        });
        if (result.flowJobRunId) {
          jobRunIds.push(result.flowJobRunId);
        }
        if (result.baseRateJobRunId) {
          jobRunIds.push(result.baseRateJobRunId);
        }

        expect(result.flowScored).toBe(1);
        expect(result.baseRateScored).toBe(1);
        expect(result.providerCalls).toBe(0);
        expect(result.warnings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "DATA_MISSING",
              ticker,
            }),
          ]),
        );

        const updated = await prisma.themeCandidate.findUniqueOrThrow({
          where: {
            themeCandidateId: candidateId,
          },
        });

        expect(updated.finalState).toBe("WATCHLIST_ONLY");
        expect(Number(updated.tickerReviewPriorityScore)).toBe(42.5);

        const t5State = await prisma.candidateSignalState.findFirst({
          where: {
            signalLayer: "T5_OWNERSHIP_FLOW",
            themeCandidateId: candidateId,
          },
        });
        const t7State = await prisma.candidateSignalState.findFirst({
          where: {
            signalLayer: "T7_BASE_RATE",
            themeCandidateId: candidateId,
          },
        });
        const t5Score = await prisma.candidateSignalScore.findFirst({
          where: {
            signalLayer: "T5_OWNERSHIP_FLOW",
            themeCandidateId: candidateId,
          },
        });
        const t7Score = await prisma.candidateSignalScore.findFirst({
          where: {
            signalLayer: "T7_BASE_RATE",
            themeCandidateId: candidateId,
          },
        });
        const t5Evidence = await prisma.evidenceLedger.findFirst({
          where: {
            metricName: "t5.ownership_flow_score",
            securityId,
            themeId,
          },
        });
        const t7Evidence = await prisma.evidenceLedger.findFirst({
          where: {
            metricName: "t7.base_rate_score",
            securityId,
            themeId,
          },
        });
        const baseRate = await prisma.baseRateResult.findFirst({
          where: {
            themeCandidateId: candidateId,
          },
        });

        expect(t5State?.state).toBe("INSUFFICIENT_DATA");
        expect(t5State?.reasonCodes).toEqual(
          expect.arrayContaining(["DATA_MISSING"]),
        );
        expect(t7State?.state).toBe("SUPPORTIVE");
        expect(Number(t5Score?.score)).toBe(0);
        expect(Number(t7Score?.score)).toBeGreaterThan(0);
        expect(t5Evidence?.metricValueText).toBe("INSUFFICIENT_DATA:0");
        expect(t7Evidence?.metricValueText).toContain("SUPPORTIVE:");
        expect(baseRate?.sampleSize).toBeGreaterThanOrEqual(30);

        for (const jobRunId of jobRunIds) {
          const items = await prisma.jobItem.count({
            where: {
              jobRunId,
            },
          });

          expect(items).toBeGreaterThan(0);
        }

        await expect(
          prisma.themeSnapshot.count({
            where: {
              themeId,
            },
          }),
        ).resolves.toBe(0);
        await expect(
          prisma.alert.count({
            where: {
              themeCandidateId: candidateId,
            },
          }),
        ).resolves.toBe(beforeAlertCount);
        await expect(
          prisma.signalState.count({
            where: {
              themeCandidateId: candidateId,
            },
          }),
        ).resolves.toBe(beforeHistoryCount);
      } finally {
        if (themeCode) {
          const discoveredJobRuns = await prisma.jobRun.findMany({
            select: {
              jobRunId: true,
            },
            where: {
              jobType: {
                in: ["OWNERSHIP_FLOW_SCORE", "BASE_RATE_SCORE"],
              },
              scopeId: themeCode,
            },
          });
          for (const jobRun of discoveredJobRuns) {
            jobRunIds.push(jobRun.jobRunId);
          }
        }

        const cleanupJobRunIds = [...new Set(jobRunIds)];

        if (candidateId) {
          await prisma.alert.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
          await prisma.signalState.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
          await prisma.baseRateResult.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
          await prisma.ownershipSnapshot.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
          await prisma.etfFlowSnapshot.deleteMany({
            where: {
              themeCandidateId: candidateId,
            },
          });
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
        }

        if (securityId) {
          await prisma.priceBarDaily.deleteMany({
            where: {
              securityId,
            },
          });
          await prisma.security.deleteMany({
            where: {
              securityId,
            },
          });
        }

        if (cleanupJobRunIds.length > 0) {
          await prisma.jobLock.deleteMany({
            where: {
              jobRunId: {
                in: cleanupJobRunIds,
              },
            },
          });
          await prisma.jobItem.deleteMany({
            where: {
              jobRunId: {
                in: cleanupJobRunIds,
              },
            },
          });
          await prisma.jobRun.deleteMany({
            where: {
              jobRunId: {
                in: cleanupJobRunIds,
              },
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
