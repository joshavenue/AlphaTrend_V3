import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildLiquidityReport } from "@/lib/liquidity/report";
import { scoreThemeLiquidity } from "@/lib/liquidity/runner";

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 9 liquidity scoring persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("scores a T1 candidate, writes T6 rows, and preserves finalState ownership", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P9${suffix}`;
      const ticker = `P9X${suffix}`.slice(0, 10);
      const currentMetricDate = new Date();
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
                display_label: "phase nine fixture",
                normalized_label: "phase nine fixture",
              },
            ],
            economicMechanism: {
              summary: "Phase 9 fixture mechanism",
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
            seedEtfs: [],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 9 Test Theme ${suffix}`,
            themeSlug: `phase-9-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        const security = await prisma.security.create({
          data: {
            canonicalTicker: ticker,
            cik: "0000320193",
            companyName: "Phase Nine Liquidity Inc.",
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
            computedAt: new Date("2026-04-01T00:00:00.000Z"),
            maxScore: 100,
            score: 75,
            scoreVersion: "test",
            signalLayer: "T1_EXPOSURE_PURITY",
            themeCandidateId: candidateId,
          },
        });
        await prisma.candidateSignalState.create({
          data: {
            computedAt: new Date("2026-04-01T00:00:00.000Z"),
            state: "DIRECT_BENEFICIARY",
            stateVersion: "test",
            signalLayer: "T1_EXPOSURE_PURITY",
            themeCandidateId: candidateId,
          },
        });
        await prisma.priceMetricDaily.create({
          data: {
            algorithmVersion: "test",
            averageDollarVolume20d: 40_000_000,
            averageVolume20d: 2_000_000,
            computedAt: currentMetricDate,
            latestClose: 20,
            metricDate: currentMetricDate,
            securityId,
          },
        });

        const result = await scoreThemeLiquidity(prisma, {
          includeFmp: false,
          includeMassive: false,
          includeSec: false,
          providerDataByTicker: {
            [ticker]: {
              fmp: {
                balanceSheetStatements: [
                  {
                    cashAndCashEquivalents: 500_000_000,
                    date: "2026-03-31",
                    period: "Q1",
                    symbol: ticker,
                    totalDebt: 100_000_000,
                  },
                  {
                    date: "2025-03-31",
                    period: "Q1",
                    symbol: ticker,
                  },
                ],
                cashFlowStatements: [
                  {
                    date: "2026-03-31",
                    freeCashFlow: 80_000_000,
                    operatingCashFlow: 90_000_000,
                    period: "Q1",
                    symbol: ticker,
                  },
                ],
                keyMetrics: [
                  {
                    date: "2026-03-31",
                    period: "Q1",
                    sharesOutstanding: 100_000_000,
                    symbol: ticker,
                  },
                  {
                    date: "2025-03-31",
                    period: "Q1",
                    sharesOutstanding: 100_000_000,
                    symbol: ticker,
                  },
                ],
                profiles: [
                  {
                    marketCap: 5_000_000_000,
                    raw: {},
                    symbol: ticker,
                  },
                ],
              },
              sec: {
                submissions: [],
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

        const signalScore = await prisma.candidateSignalScore.findFirst({
          where: {
            jobRunId,
            signalLayer: "T6_LIQUIDITY_DILUTION_FRAGILITY",
            themeCandidateId: candidateId,
          },
        });
        const signalState = await prisma.candidateSignalState.findFirst({
          where: {
            jobRunId,
            signalLayer: "T6_LIQUIDITY_DILUTION_FRAGILITY",
            themeCandidateId: candidateId,
          },
        });
        const detail = await prisma.evidenceLedger.findFirst({
          where: {
            jobRunId,
            metricName: "t6.liquidity_fragility_score_detail",
            securityId,
            themeId,
          },
        });

        expect(Number(signalScore?.score)).toBe(0);
        expect(signalState?.state).toBe("CORE_ELIGIBLE");
        expect(detail?.metricValueText).toContain("NORMAL_RISK");

        const report = await buildLiquidityReport(prisma, themeCode);

        expect(report.total_scored).toBe(1);
        expect(report.candidates[0]).toMatchObject({
          dilution_risk_state: "LOW",
          final_state: "WATCHLIST_ONLY",
          liquidity_state: "CORE_ELIGIBLE",
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
          await prisma.priceMetricDaily.deleteMany({
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
