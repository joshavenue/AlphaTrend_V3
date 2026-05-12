import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { hashPayload } from "@/lib/evidence/hash";
import { buildPriceReport } from "@/lib/price/report";
import { scoreThemePrices } from "@/lib/price/runner";
import type { PriceBar } from "@/lib/price/types";

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
    recentBoost?: number;
    recentDays?: number;
    start?: number;
  } = {},
): PriceBar[] {
  const dates = tradingDates(count);
  let close = options.start ?? 100;

  return dates.map((date, index) => {
    const inRecentWindow =
      index >= count - (options.recentDays ?? 30) && index < count;
    const returnValue =
      (options.dailyReturn ?? 0.001) +
      (inRecentWindow ? (options.recentBoost ?? 0) : 0);
    const open = close;
    close *= 1 + returnValue;

    return {
      close,
      date,
      high: Math.max(open, close) * 1.004,
      low: Math.min(open, close) * 0.996,
      open,
      volume: 1_200_000 + index * 1_000,
      vwap: (open + close) / 2,
    };
  });
}

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 8 price scoring persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("scores a T1/T3 candidate, writes T4 rows, stores bars, and preserves finalState ownership", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P8${suffix}`;
      const ticker = `P8X${suffix}`.slice(0, 10);
      const seedTicker = `P8E${suffix}`.slice(0, 10);
      const tickerBars = bars(280, {
        dailyReturn: 0.001,
        recentBoost: 0.001,
      });
      const seedBars = bars(280, {
        dailyReturn: 0.0004,
      });
      const spyBars = bars(280, {
        dailyReturn: 0.0003,
      });
      const qqqBars = bars(280, {
        dailyReturn: 0.00035,
      });
      const fixtureHashes = [
        hashPayload(tickerBars),
        hashPayload(seedBars),
        hashPayload(spyBars),
        hashPayload(qqqBars),
      ];
      let themeId: string | undefined;
      let securityId: string | undefined;
      let seedSecurityId: string | undefined;
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
                display_label: "phase eight fixture",
                normalized_label: "phase eight fixture",
              },
            ],
            economicMechanism: {
              summary: "Phase 8 fixture mechanism",
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
            priceConfirmationRules: [
              {
                rule: "fixture_price_confirmation",
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
            seedEtfs: [
              {
                provider: "MASSIVE",
                role: "theme_proxy",
                symbol: seedTicker,
              },
            ],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 8 Test Theme ${suffix}`,
            themeSlug: `phase-8-test-theme-${suffix.toLowerCase()}`,
            valuationRiskRules: [
              {
                rule: "fixture_valuation_risk",
              },
            ],
          },
        });
        themeId = theme.themeId;

        const security = await prisma.security.create({
          data: {
            canonicalTicker: ticker,
            companyName: "Phase Eight Price Inc.",
            exchange: "NASDAQ",
            isActive: true,
            isEtf: false,
            securityType: "COMMON_STOCK",
            universeBucket: "US_COMMON_ALL",
          },
        });
        securityId = security.securityId;

        const seedSecurity = await prisma.security.create({
          data: {
            canonicalTicker: seedTicker,
            companyName: "Phase Eight Seed ETF",
            exchange: "NYSEARCA",
            isActive: true,
            isEtf: true,
            securityType: "ETF",
            universeBucket: "US_ETF_ALL",
          },
        });
        seedSecurityId = seedSecurity.securityId;

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

        await prisma.candidateSignalScore.createMany({
          data: [
            {
              computedAt: new Date("2026-04-01T00:00:00.000Z"),
              maxScore: 100,
              score: 75,
              scoreVersion: "test",
              signalLayer: "T1_EXPOSURE_PURITY",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-04-02T00:00:00.000Z"),
              maxScore: 100,
              score: 82,
              scoreVersion: "test",
              signalLayer: "T3_FUNDAMENTALS",
              themeCandidateId: candidateId,
            },
          ],
        });
        await prisma.candidateSignalState.createMany({
          data: [
            {
              computedAt: new Date("2026-04-01T00:00:00.000Z"),
              state: "DIRECT_BENEFICIARY",
              stateVersion: "test",
              signalLayer: "T1_EXPOSURE_PURITY",
              themeCandidateId: candidateId,
            },
            {
              computedAt: new Date("2026-04-02T00:00:00.000Z"),
              state: "VALIDATED",
              stateVersion: "test",
              signalLayer: "T3_FUNDAMENTALS",
              themeCandidateId: candidateId,
            },
          ],
        });

        const result = await scoreThemePrices(prisma, {
          includeFmp: false,
          includeMassive: false,
          providerDataByTicker: {
            [ticker]: {
              bars: tickerBars,
            },
            [seedTicker]: {
              bars: seedBars,
            },
            QQQ: {
              bars: qqqBars,
            },
            SPY: {
              bars: spyBars,
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
            signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
            themeCandidateId: candidateId,
          },
        });
        const signalState = await prisma.candidateSignalState.findFirst({
          where: {
            jobRunId,
            signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
            themeCandidateId: candidateId,
          },
        });
        const storedBars = await prisma.priceBarDaily.count({
          where: {
            securityId,
          },
        });
        const metric = await prisma.priceMetricDaily.findFirst({
          where: {
            securityId,
          },
        });
        const basket = await prisma.themeBasketPrice.findFirst({
          where: {
            themeId,
          },
        });

        expect(Number(signalScore?.score)).toBeGreaterThan(0);
        expect(signalState?.state).not.toBeNull();
        expect(storedBars).toBeGreaterThanOrEqual(280);
        expect(metric?.averageDollarVolume20d).not.toBeNull();
        expect(basket?.method).toBe("seed_etf_proxy");

        const report = await buildPriceReport(prisma, themeCode);

        expect(report.total_scored).toBe(1);
        expect(report.candidates[0]).toMatchObject({
          final_state: "WATCHLIST_ONLY",
          ticker,
        });
        expect(report.candidates[0].valuation_state).toBe("INSUFFICIENT_DATA");
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
          await prisma.themeBasketPrice.deleteMany({
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

        await prisma.priceBarDaily.deleteMany({
          where: {
            sourcePayloadHash: {
              in: fixtureHashes,
            },
          },
        });

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

        if (seedSecurityId) {
          await prisma.priceMetricDaily.deleteMany({
            where: {
              securityId: seedSecurityId,
            },
          });
          await prisma.security.deleteMany({
            where: {
              securityId: seedSecurityId,
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
