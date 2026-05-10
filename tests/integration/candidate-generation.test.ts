import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { generateThemeCandidates } from "@/lib/candidates/generator";

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 5 candidate generation persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("maps manual validation fixtures, excludes ETFs/review buckets, and reruns idempotently", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P5${suffix}`;
      const commonTicker = `P5C${suffix}`.slice(0, 10);
      const etfTicker = `P5E${suffix}`.slice(0, 10);
      const reviewTicker = `P5R${suffix}`.slice(0, 10);
      const tempDir = await mkdtemp(join(tmpdir(), "alphatrend-p5-"));
      const companySeedPath = join(tempDir, "company-seeds.csv");
      let themeId: string | undefined;
      const jobRunIds: string[] = [];

      try {
        await writeFile(
          companySeedPath,
          [
            "theme_id,ticker,company_name,initial_inclusion_method,api_retrievable,must_pass_alpha_trend_gates,candidate_rank_within_theme,candidate_role,beneficiary_type,api_validation_priority,notes",
            `${themeCode},${commonTicker},Phase 5 Common,manual_seed_for_api_validation,yes,T1/T3/T4/T6/T8,1,Direct beneficiary,Direct,high,eligible fixture`,
            `${themeCode},${etfTicker},Phase 5 ETF,manual_seed_for_api_validation,yes,T1/T3/T4/T6/T8,2,ETF,ETF,low,ETF fixture`,
            `${themeCode},${reviewTicker},Phase 5 Review,manual_seed_for_api_validation,yes,T1/T3/T4/T6/T8,3,Review,Review,low,review fixture`,
          ].join("\n"),
          "utf8",
        );

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
                display_label: "phase five fixture",
                normalized_label: "phase five fixture",
              },
            ],
            economicMechanism: {
              summary: "Phase 5 fixture mechanism",
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
            seedEtfs: [
              {
                provider: "FMP",
                role: "candidate_seed",
                symbol: etfTicker,
              },
            ],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 5 Test Theme ${suffix}`,
            themeSlug: `phase-5-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        await prisma.security.createMany({
          data: [
            {
              canonicalTicker: commonTicker,
              companyName: "Phase 5 Common Inc.",
              exchange: "NASDAQ",
              isActive: true,
              isEtf: false,
              securityType: "COMMON_STOCK",
              universeBucket: "US_COMMON_ALL",
            },
            {
              canonicalTicker: etfTicker,
              companyName: "Phase 5 ETF",
              exchange: "NASDAQ",
              isActive: true,
              isEtf: true,
              securityType: "ETF",
              universeBucket: "US_ETF_ALL",
            },
            {
              canonicalTicker: reviewTicker,
              companyName: "Phase 5 Review Inc.",
              exchange: "NASDAQ",
              isActive: true,
              isEtf: false,
              securityType: "COMMON_STOCK",
              universeBucket: "REVIEW_REQUIRED",
            },
          ],
        });

        const first = await generateThemeCandidates(prisma, {
          companySeedPath,
          includeFmp: false,
          themeRef: themeCode,
        });
        const second = await generateThemeCandidates(prisma, {
          companySeedPath,
          includeFmp: false,
          themeRef: themeCode,
        });
        jobRunIds.push(first.jobRunId, second.jobRunId);

        expect(first.candidatesCreated).toBe(1);
        expect(second.candidatesCreated).toBe(0);
        expect(second.candidatesUpdated).toBe(1);
        expect(first.warnings.map((item) => item.code)).toContain(
          "CANDIDATE_SOURCE_ETF_EXCLUDED_FROM_STOCK_CANDIDATES",
        );
        expect(first.warnings.map((item) => item.code)).toContain(
          "CANDIDATE_SOURCE_SECURITY_NOT_ELIGIBLE",
        );

        const candidates = await prisma.themeCandidate.findMany({
          include: {
            security: true,
          },
          where: {
            themeId,
          },
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0].security.canonicalTicker).toBe(commonTicker);
        expect(candidates[0]).toMatchObject({
          beneficiaryType: null,
          candidateStatus: "REVIEW_REQUIRED",
          dashboardVisible: false,
          displayGroup: "Unclassified",
          finalState: null,
          sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
        });
        expect(candidates[0].sourceDetail).toMatchObject({
          generator_version: "phase5_candidate_generator_2026_05_10",
          source_count: 1,
          source_types: ["MANUAL_SEED_FOR_API_VALIDATION"],
        });
      } finally {
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

        await prisma.security.deleteMany({
          where: {
            canonicalTicker: {
              in: [commonTicker, etfTicker, reviewTicker],
            },
          },
        });

        if (themeId) {
          await prisma.themeDefinition.deleteMany({
            where: {
              themeId,
            },
          });
        }

        await rm(tempDir, {
          force: true,
          recursive: true,
        });
      }
    });
  },
);
