import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildFundamentalReport } from "@/lib/fundamentals/report";
import { scoreThemeFundamentals } from "@/lib/fundamentals/runner";

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 7 fundamental scoring persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("scores a T1 candidate, writes T3 signal rows, and preserves finalState ownership", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P7${suffix}`;
      const ticker = `P7X${suffix}`.slice(0, 10);
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
                display_label: "GPU",
                normalized_label: "gpu",
              },
            ],
            economicMechanism: {
              summary: "Phase 7 fixture mechanism",
            },
            excludedCategories: [
              {
                display_label: "unrelated fixture",
                normalized_label: "unrelated fixture",
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
                metric: "revenue_growth_yoy",
              },
            ],
            seedEtfs: [],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 7 Test Theme ${suffix}`,
            themeSlug: `phase-7-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        const security = await prisma.security.create({
          data: {
            canonicalTicker: ticker,
            companyName: "Phase Seven Fundamentals Inc.",
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
            candidateStatus: "REVIEW_REQUIRED",
            dashboardVisible: false,
            displayGroup: "Direct beneficiaries",
            finalState: "WATCHLIST_ONLY",
            securityId,
            sourceDetail: {
              generator_version: "test",
              source_count: 1,
              source_types: ["MANUAL_SEED_FOR_API_VALIDATION"],
              sources: [
                {
                  source_key: `manual_seed:${themeCode}:${ticker}`,
                  source_type: "MANUAL_SEED_FOR_API_VALIDATION",
                  ticker,
                },
              ],
            },
            sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
            themeId,
          },
        });
        candidateId = candidate.themeCandidateId;

        await prisma.candidateSignalScore.create({
          data: {
            maxScore: 100,
            score: 75,
            scoreVersion: "test",
            signalLayer: "T1_EXPOSURE_PURITY",
            themeCandidateId: candidateId,
          },
        });
        await prisma.candidateSignalState.create({
          data: {
            state: "DIRECT_BENEFICIARY",
            stateVersion: "test",
            signalLayer: "T1_EXPOSURE_PURITY",
            themeCandidateId: candidateId,
          },
        });

        const result = await scoreThemeFundamentals(prisma, {
          providerDataByTicker: {
            [ticker]: {
              fmp: {
                balanceSheetStatements: [
                  {
                    cashAndCashEquivalents: 500,
                    date: "2026-03-31",
                    period: "Q1",
                    symbol: ticker,
                    totalAssets: 1_000,
                    totalDebt: 100,
                  },
                ],
                cashFlowStatements: [
                  {
                    capitalExpenditure: -5,
                    date: "2026-03-31",
                    freeCashFlow: 28,
                    operatingCashFlow: 33,
                    period: "Q1",
                    symbol: ticker,
                  },
                  {
                    date: "2025-03-31",
                    freeCashFlow: 10,
                    period: "Q1",
                    symbol: ticker,
                  },
                ],
                incomeStatements: [
                  {
                    date: "2026-03-31",
                    grossProfit: 65,
                    operatingIncome: 39,
                    period: "Q1",
                    revenue: 130,
                    symbol: ticker,
                    weightedAverageShsOutDil: 100,
                  },
                  {
                    date: "2025-12-31",
                    period: "Q4",
                    revenue: 115,
                    symbol: ticker,
                    weightedAverageShsOutDil: 100,
                  },
                  {
                    date: "2025-09-30",
                    period: "Q3",
                    revenue: 110,
                    symbol: ticker,
                    weightedAverageShsOutDil: 100,
                  },
                  {
                    date: "2025-06-30",
                    period: "Q2",
                    revenue: 105,
                    symbol: ticker,
                    weightedAverageShsOutDil: 100,
                  },
                  {
                    date: "2025-03-31",
                    grossProfit: 40,
                    operatingIncome: 22,
                    period: "Q1",
                    revenue: 100,
                    symbol: ticker,
                    weightedAverageShsOutDil: 100,
                  },
                  {
                    date: "2024-12-31",
                    period: "Q4",
                    revenue: 95,
                    symbol: ticker,
                    weightedAverageShsOutDil: 100,
                  },
                ],
              },
            },
          },
          themeRef: themeCode,
        });
        jobRunId = result.jobRunId;

        expect(result.candidatesScored).toBe(1);
        expect(result.evidenceWritten).toBeGreaterThan(0);

        const updated = await prisma.themeCandidate.findUniqueOrThrow({
          where: {
            themeCandidateId: candidateId,
          },
        });

        expect(updated.finalState).toBe("WATCHLIST_ONLY");
        expect(updated.beneficiaryType).toBe("DIRECT_BENEFICIARY");

        const signalScore = await prisma.candidateSignalScore.findFirst({
          where: {
            jobRunId,
            signalLayer: "T3_FUNDAMENTALS",
            themeCandidateId: candidateId,
          },
        });
        const signalState = await prisma.candidateSignalState.findFirst({
          where: {
            jobRunId,
            signalLayer: "T3_FUNDAMENTALS",
            themeCandidateId: candidateId,
          },
        });

        expect(Number(signalScore?.score)).toBeGreaterThanOrEqual(60);
        expect(signalState?.state).toBe("IMPROVING");

        const report = await buildFundamentalReport(prisma, themeCode);

        expect(report.total_scored).toBe(1);
        expect(report.candidates[0]).toMatchObject({
          fundamental_state: "IMPROVING",
          ticker,
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
          await prisma.evidenceLedger.deleteMany({
            where: {
              themeId,
            },
          });
          await prisma.themeCandidate.deleteMany({
            where: {
              themeCandidateId: candidateId,
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

        if (securityId) {
          await prisma.security.deleteMany({
            where: {
              securityId,
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
