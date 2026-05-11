import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { scoreThemeExposure } from "@/lib/exposure/runner";
import { buildExposureReport } from "@/lib/exposure/report";

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 6 exposure scoring persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("scores a candidate, writes T1 signal rows, and preserves manual-only review boundary", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const themeCode = `P6${suffix}`;
      const ticker = `P6X${suffix}`.slice(0, 10);
      const tempDir = await mkdtemp(join(tmpdir(), "alphatrend-p6-"));
      const companySeedPath = join(tempDir, "company-seeds.csv");
      let themeId: string | undefined;
      let securityId: string | undefined;
      let candidateId: string | undefined;
      let jobRunId: string | undefined;

      try {
        await writeFile(
          companySeedPath,
          [
            "theme_id,ticker,company_name,initial_inclusion_method,api_retrievable,must_pass_alpha_trend_gates,candidate_rank_within_theme,candidate_role,beneficiary_type,api_validation_priority,notes",
            `${themeCode},${ticker},Phase Six Exposure,manual_seed_for_api_validation,yes,T1/T3/T4/T6/T8,1,Direct beneficiary,GPU / accelerator,high,manual fixture must not bypass T1`,
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
                display_label: "GPU",
                normalized_label: "gpu",
              },
            ],
            economicMechanism: {
              summary: "Phase 6 fixture mechanism",
            },
            excludedCategories: [
              {
                display_label: "generic AI software",
                normalized_label: "generic ai software",
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
                symbol: "P6ETF",
              },
            ],
            sourceThemeCode: themeCode,
            status: "ACTIVE_UNSCANNED",
            themeName: `Phase 6 Test Theme ${suffix}`,
            themeSlug: `phase-6-test-theme-${suffix.toLowerCase()}`,
          },
        });
        themeId = theme.themeId;

        const security = await prisma.security.create({
          data: {
            canonicalTicker: ticker,
            companyName: "Phase Six Exposure Inc.",
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
            candidateStatus: "REVIEW_REQUIRED",
            dashboardVisible: false,
            displayGroup: "Unclassified",
            securityId,
            sourceDetail: {
              generator_version: "test",
              source_count: 1,
              source_types: ["MANUAL_SEED_FOR_API_VALIDATION"],
              sources: [
                {
                  details: {
                    candidate_role: "Direct beneficiary",
                  },
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

        const summary = await scoreThemeExposure(prisma, {
          companySeedPath,
          includeFmp: false,
          includeSec: false,
          themeRef: themeCode,
        });
        jobRunId = summary.jobRunId;

        expect(summary.candidatesScored).toBe(1);
        expect(summary.evidenceWritten).toBeGreaterThan(0);

        const updated = await prisma.themeCandidate.findUniqueOrThrow({
          where: {
            themeCandidateId: candidateId,
          },
        });

        expect(updated).toMatchObject({
          beneficiaryType: "INDIRECT_BENEFICIARY",
          candidateStatus: "REVIEW_REQUIRED",
          dashboardVisible: false,
          finalState: null,
        });

        const signalScore = await prisma.candidateSignalScore.findFirst({
          where: {
            jobRunId,
            themeCandidateId: candidateId,
            signalLayer: "T1_EXPOSURE_PURITY",
          },
        });
        const signalState = await prisma.candidateSignalState.findFirst({
          where: {
            jobRunId,
            themeCandidateId: candidateId,
            signalLayer: "T1_EXPOSURE_PURITY",
          },
        });

        expect(Number(signalScore?.score)).toBeLessThan(50);
        expect(signalState?.state).toBe("INDIRECT_BENEFICIARY");

        const report = await buildExposureReport(prisma, themeCode);

        expect(report.total_scored).toBe(1);
        expect(report.candidates[0]).toMatchObject({
          candidate_status: "REVIEW_REQUIRED",
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

        await rm(tempDir, {
          force: true,
          recursive: true,
        });
      }
    });
  },
);
