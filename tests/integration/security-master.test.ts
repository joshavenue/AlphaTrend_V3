import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildSecurityMaster } from "@/lib/security-master/builder";
import { persistSecurityMaster } from "@/lib/security-master/persist";

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 3 security master persistence",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("upserts securities, identifiers, job items, and summary evidence", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const commonTicker = `P3C${suffix}`.slice(0, 10);
      const etfTicker = `P3E${suffix}`.slice(0, 10);
      let jobRunId: string | undefined;

      try {
        const jobRun = await prisma.jobRun.create({
          data: {
            jobType: "SECURITY_MASTER_REFRESH",
            scopeId: suffix,
            scopeType: "phase3-test",
            status: "STARTED",
          },
        });
        jobRunId = jobRun.jobRunId;

        const build = buildSecurityMaster({
          nasdaqListed: [
            {
              etf: false,
              marketCategory: "Q",
              securityName: `${commonTicker} Test Common - Common Stock`,
              symbol: commonTicker,
              testIssue: false,
            },
            {
              etf: true,
              marketCategory: "Q",
              securityName: `${etfTicker} Test ETF`,
              symbol: etfTicker,
              testIssue: false,
            },
            {
              etf: false,
              marketCategory: "Q",
              securityName: "Phase 3 Test Issue",
              symbol: `P3T${suffix}`.slice(0, 10),
              testIssue: true,
            },
          ],
          openFigiMappings: [
            {
              compositeFigi: `BBGP3C${suffix}`,
              figi: `BBGP3F${suffix}`,
              securityType: "Common Stock",
              shareClassFigi: `BBGP3S${suffix}`,
              ticker: commonTicker,
            },
            {
              compositeFigi: `BBGP3EC${suffix}`,
              figi: `BBGP3EF${suffix}`,
              securityType: "ETF",
              ticker: etfTicker,
            },
          ],
          providerPayloadRefs: {
            NASDAQ_TRADER: {
              endpoint: "fixture",
              responseHash: `nasdaq-${suffix}`,
            },
            OPENFIGI: {
              endpoint: "fixture",
              responseHash: `openfigi-${suffix}`,
            },
            SEC: {
              endpoint: "fixture",
              responseHash: `sec-${suffix}`,
            },
          },
          secTickers: [
            {
              cik: "1",
              companyName: `${commonTicker} Test Common Inc.`,
              ticker: commonTicker,
            },
          ],
        });
        const persisted = await persistSecurityMaster(
          prisma,
          jobRun.jobRunId,
          build,
        );

        expect(persisted.securitiesWritten).toBe(2);
        expect(persisted.identifiersWritten).toBeGreaterThanOrEqual(5);
        expect(persisted.evidenceWritten).toBeGreaterThan(0);

        const common = await prisma.security.findUnique({
          where: {
            canonicalTicker_exchange: {
              canonicalTicker: commonTicker,
              exchange: "NASDAQ",
            },
          },
        });
        const etf = await prisma.security.findUnique({
          where: {
            canonicalTicker_exchange: {
              canonicalTicker: etfTicker,
              exchange: "NASDAQ",
            },
          },
        });

        expect(common).toMatchObject({
          cik: "0000000001",
          figi: `BBGP3F${suffix}`,
          securityType: "COMMON_STOCK",
          universeBucket: "US_COMMON_ALL",
        });
        expect(etf).toMatchObject({
          isEtf: true,
          securityType: "ETF",
          universeBucket: "US_ETF_ALL",
        });

        const identifiers = await prisma.securityIdentifier.findMany({
          where: {
            securityId: common?.securityId,
          },
        });

        expect(
          identifiers.some(
            (identifier) =>
              identifier.provider === "OPENFIGI" &&
              identifier.identifierType === "FIGI" &&
              identifier.identifierValue === `BBGP3F${suffix}`,
          ),
        ).toBe(true);

        const testIssueRows = await prisma.security.findMany({
          where: {
            canonicalTicker: `P3T${suffix}`.slice(0, 10),
          },
        });

        expect(testIssueRows).toHaveLength(0);

        await prisma.jobRun.update({
          data: {
            finishedAt: new Date(),
            rowsRead: build.summary.recordsBuilt,
            rowsWritten: persisted.securitiesWritten,
            status: "SUCCEEDED",
          },
          where: {
            jobRunId,
          },
        });
      } finally {
        const securities = await prisma.security.findMany({
          where: {
            canonicalTicker: {
              in: [commonTicker, etfTicker, `P3T${suffix}`.slice(0, 10)],
            },
          },
        });
        const securityIds = securities.map((security) => security.securityId);

        if (jobRunId) {
          await prisma.evidenceLedger.deleteMany({
            where: {
              OR: [
                { jobRunId },
                securityIds.length > 0
                  ? { securityId: { in: securityIds } }
                  : { securityId: "00000000-0000-0000-0000-000000000000" },
              ],
            },
          });
          await prisma.jobItem.deleteMany({
            where: {
              jobRunId,
            },
          });
        }

        if (securityIds.length > 0) {
          await prisma.securityIdentifier.deleteMany({
            where: {
              securityId: {
                in: securityIds,
              },
            },
          });
          await prisma.security.deleteMany({
            where: {
              securityId: {
                in: securityIds,
              },
            },
          });
        }

        if (jobRunId) {
          await prisma.jobRun.deleteMany({
            where: {
              jobRunId,
            },
          });
        }
      }
    });
  },
);
