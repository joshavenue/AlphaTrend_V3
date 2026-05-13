import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEMAND_REASON_CODES,
  T2_PROVIDER_FEED_METRIC,
} from "@/lib/demand/constants";
import { scoreEconomicDemandThemes } from "@/lib/demand/runner";
import { createPrismaClient } from "@/lib/db/prisma";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import { buildThemeSnapshots } from "@/lib/snapshots/runner";

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 14 economic demand persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("scores provider-backed demand proof and snapshots consume stored T2 evidence", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P14${suffix}`;
      const jobRunIds: string[] = [];
      let themeId: string | undefined;

      try {
        const theme = await prisma.themeDefinition.create({
          data: {
            candidateIndustries: [],
            candidateScreenerRules: [],
            defaultDashboardState: "INSUFFICIENT_EVIDENCE",
            directBeneficiaryCategories: [
              {
                normalized_label: "power equipment",
              },
            ],
            economicMechanism: {
              summary:
                "Demand driver maps to constrained power infrastructure, pricing power, and public beneficiaries with measurable provider-backed evidence.",
            },
            excludedCategories: [],
            indirectBeneficiaryCategories: [],
            invalidationRules: [
              {
                rule: "power demand declines",
              },
            ],
            primaryDemandDrivers: [
              {
                label: "data-center power demand",
              },
            ],
            requiredEconomicProof: [
              {
                metric: "electricity demand",
              },
            ],
            requiredFundamentalProof: [],
            seedEtfs: ["P14ETF"],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 14 Test Theme ${suffix}`,
            themeSlug: `phase-14-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        await prisma.themeEconomicMapping.create({
          data: {
            description: "Fixture EIA demand mapping",
            enabled: true,
            endpoint: "electricity_retail_sales",
            evidenceGradeCeiling: "A",
            feedId: "eia_electricity_retail_sales",
            frequency: "monthly",
            freshnessThresholdDays: 90,
            mappingMethod: "theme_context_only",
            mapsToSecurity: false,
            mapsToTheme: true,
            proofCategory: "capacity",
            provider: "EIA",
            seriesOrQueryId: "electricity/retail-sales:sales",
            themeId,
          },
        });

        await insertEvidence(prisma, {
          endpoint: "electricity_retail_sales",
          entityId: "eia_electricity_retail_sales",
          entityType: "demand_feed",
          evidenceGrade: "A",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: T2_PROVIDER_FEED_METRIC,
          metricValueNum: 12,
          metricValueText: JSON.stringify({
            feed_id: "eia_electricity_retail_sales",
            kind: "eia_electricity_retail_sales",
            provider_status: "SUCCESS",
            row_count: 12,
          }),
          provider: "EIA",
          reasonCode: DEMAND_REASON_CODES.DEMAND_CAPACITY_TIGHTNESS_EVIDENCE,
          sourcePayloadHash: hashPayload({
            fixture: "p14_eia_power",
            suffix,
          }),
          themeId,
        });

        const demandResult = await scoreEconomicDemandThemes(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(demandResult.jobRunId);

        expect(demandResult.themes[0]?.score).toBeGreaterThan(0);
        expect(demandResult.evidenceWritten).toBe(1);

        const snapshotResult = await buildThemeSnapshots(prisma, {
          themeRef: themeCode,
        });
        jobRunIds.push(snapshotResult.jobRunId);

        const snapshot = await prisma.themeSnapshot.findFirstOrThrow({
          orderBy: {
            createdAt: "desc",
          },
          where: {
            themeId,
          },
        });

        expect(Number(snapshot.themeRealityScore)).toBeGreaterThan(0);
      } finally {
        if (themeId) {
          const jobRuns = await prisma.jobRun.findMany({
            select: {
              jobRunId: true,
            },
            where: {
              OR: [
                {
                  jobRunId: {
                    in: jobRunIds,
                  },
                },
                {
                  scopeId: {
                    contains: themeCode,
                  },
                },
              ],
            },
          });
          const cleanupJobRunIds = jobRuns.map((jobRun) => jobRun.jobRunId);

          await prisma.themeSnapshot.deleteMany({ where: { themeId } });
          await prisma.evidenceLedger.deleteMany({ where: { themeId } });
          await prisma.themeEconomicMapping.deleteMany({ where: { themeId } });
          await prisma.jobItem.deleteMany({
            where: { jobRunId: { in: cleanupJobRunIds } },
          });
          await prisma.jobLock.deleteMany({
            where: { jobRunId: { in: cleanupJobRunIds } },
          });
          await prisma.jobRun.deleteMany({
            where: { jobRunId: { in: cleanupJobRunIds } },
          });
          await prisma.themeDefinition.deleteMany({ where: { themeId } });
        }
      }
    });
  },
);
