import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import {
  hashRequestMetadata,
  insertEvidence,
  recordApiObservability,
  storeProviderPayload,
} from "@/lib/evidence";

const expectedFoundationTables = [
  "accounts",
  "alerts",
  "api_observability",
  "auth_audit_events",
  "candidate_signal_scores",
  "candidate_signal_states",
  "evidence_ledger",
  "job_items",
  "job_locks",
  "job_runs",
  "provider_payloads",
  "security_identifiers",
  "securities",
  "sessions",
  "signal_states",
  "theme_candidates",
  "theme_definitions",
  "theme_snapshots",
  "users",
  "verification_tokens",
  "watchlist_items",
];

function definedWhere(
  conditions: Array<Record<string, string | undefined>>,
): Array<Record<string, string>> {
  return conditions.filter((condition): condition is Record<string, string> =>
    Object.values(condition).every((value) => value !== undefined),
  );
}

describe.skipIf(!process.env.DATABASE_URL)(
  "Phase 1 evidence foundation",
  () => {
    const prisma = createPrismaClient();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("creates the Phase 1 foundation tables", async () => {
      const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
    `;
      const tableNames = new Set(rows.map((row) => row.table_name));

      expect(
        expectedFoundationTables.every((table) => tableNames.has(table)),
      ).toBe(true);
    });

    it("writes fake provider payload, observability, evidence, state, alert, and watchlist rows", async () => {
      const suffix = randomUUID().slice(0, 8);
      const requestWithSecret =
        "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json?apikey=secret-one&symbol=AAPL";
      const requestWithDifferentSecret =
        "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json?symbol=AAPL&apikey=secret-two";

      let jobRunId: string | undefined;
      let payloadId: string | undefined;
      let securityId: string | undefined;
      let themeId: string | undefined;
      let themeCandidateId: string | undefined;
      let evidenceId: string | undefined;
      let signalStateId: string | undefined;

      try {
        const jobRun = await prisma.jobRun.create({
          data: {
            jobType: "PROVIDER_SMOKE",
            scopeId: suffix,
            scopeType: "phase1-test",
            status: "STARTED",
          },
        });
        jobRunId = jobRun.jobRunId;

        const payload = await storeProviderPayload(prisma, {
          contentType: "application/json",
          endpoint: "/api/xbrl/companyfacts",
          entityId: "AAPL",
          entityType: "ticker",
          httpStatus: 200,
          payload: {
            cik: "0000320193",
            facts: {
              revenue: 123,
            },
            token: "payload-secret",
          },
          provider: "SEC",
          requestMetadata: requestWithSecret,
        });
        payloadId = payload.payloadId;

        expect(payload.requestHash).toBe(
          hashRequestMetadata(requestWithDifferentSecret),
        );
        expect(JSON.stringify(payload.payloadPreviewJson)).not.toContain(
          "payload-secret",
        );

        const apiCall = await recordApiObservability(prisma, {
          durationMs: 42,
          endpoint: "/api/xbrl/companyfacts",
          errorMessage:
            "upstream failed with DATABASE_URL=postgresql://user:pass@127.0.0.1:5433/db",
          jobRunId,
          payloadId,
          provider: "SEC",
          requestMetadata: requestWithSecret,
          responseHash: payload.responseHash,
          rowCount: 1,
          statusCode: 200,
        });

        expect(apiCall.requestHash).toBe(payload.requestHash);
        expect(apiCall.sanitizedError).not.toContain("user:pass");

        const security = await prisma.security.create({
          data: {
            canonicalTicker: `P1${suffix}`.toUpperCase(),
            companyName: `Phase 1 Test Co ${suffix}`,
            exchange: "TEST",
            isActive: true,
            securityType: "COMMON_STOCK",
          },
        });
        securityId = security.securityId;

        const theme = await prisma.themeDefinition.create({
          data: {
            directBeneficiaryCategories: ["direct category"],
            economicMechanism: ["test mechanism"],
            excludedCategories: ["excluded category"],
            indirectBeneficiaryCategories: ["indirect category"],
            invalidationRules: ["test invalidation"],
            primaryDemandDrivers: ["test demand"],
            requiredEconomicProof: ["test economic proof"],
            requiredFundamentalProof: ["test fundamental proof"],
            seedEtfs: ["TEST"],
            status: "ACTIVE",
            themeName: `Phase 1 Test Theme ${suffix}`,
            themeSlug: `phase-1-test-${suffix}`,
          },
        });
        themeId = theme.themeId;

        const candidate = await prisma.themeCandidate.create({
          data: {
            candidateStatus: "ACTIVE",
            finalState: "WATCHLIST_ONLY",
            securityId,
            sourceDetail: {
              fixture: true,
            },
            sourceOfInclusion: "PHASE_1_FIXTURE",
            themeId,
          },
        });
        themeCandidateId = candidate.themeCandidateId;

        const evidence = await insertEvidence(prisma, {
          endpoint: "/api/xbrl/companyfacts",
          jobRunId,
          metricName: "revenue",
          metricUnit: "USD",
          metricValueNum: 123,
          payloadId,
          provider: "SEC",
          reasonCode: "FUNDAMENTAL_REVENUE_GROWING",
          scoreImpact: 1,
          securityId,
          themeId,
        });
        evidenceId = evidence.evidenceId;

        await prisma.candidateSignalScore.create({
          data: {
            evidenceIds: [evidenceId],
            jobRunId,
            reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
            score: 70,
            scoreVersion: "phase1_test",
            signalLayer: "T1_EXPOSURE_PURITY",
            themeCandidateId,
          },
        });

        await prisma.candidateSignalState.create({
          data: {
            evidenceIds: [evidenceId],
            jobRunId,
            reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
            signalLayer: "T1_EXPOSURE_PURITY",
            state: "DIRECT_BENEFICIARY",
            stateVersion: "phase1_test",
            themeCandidateId,
          },
        });

        await prisma.themeSnapshot.create({
          data: {
            dashboardState: "EARLY_WATCHLIST",
            jobRunId,
            snapshotDate: new Date("2026-05-10T00:00:00.000Z"),
            themeId,
            watchlistOnlyCount: 1,
          },
        });

        const signalState = await prisma.signalState.create({
          data: {
            currentState: "WATCHLIST_ONLY",
            currentScore: 70,
            evidenceIds: [evidenceId],
            jobRunId,
            reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
            securityId,
            severity: "INFO",
            stateType: "T8_EXPRESSION_DECISION",
            themeCandidateId,
            themeId,
          },
        });
        signalStateId = signalState.signalStateId;

        const alert = await prisma.alert.create({
          data: {
            alertType: "STATE_CHANGED",
            deliveryStatus: "STORED",
            message: "Phase 1 fixture alert",
            reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
            securityId,
            severity: "INFO",
            signalStateId,
            themeCandidateId,
            themeId,
            title: "Phase 1 fixture",
          },
        });

        await prisma.watchlistItem.create({
          data: {
            createdFromAlertId: alert.alertId,
            securityId,
            themeCandidateId,
            themeId,
            watchType: "TICKER_THEME_PAIR",
          },
        });

        await prisma.jobRun.update({
          data: {
            finishedAt: new Date(),
            providerCalls: 1,
            rowsRead: 1,
            rowsWritten: 10,
            status: "SUCCEEDED",
          },
          where: {
            jobRunId,
          },
        });

        await expect(
          prisma.themeCandidate.create({
            data: {
              candidateStatus: "ACTIVE",
              securityId: randomUUID(),
              sourceOfInclusion: "INVALID_FK_TEST",
              themeId,
            },
          }),
        ).rejects.toThrow();
      } finally {
        const candidateScope = definedWhere([
          { themeCandidateId },
          { securityId },
          { themeId },
        ]);
        const stateScope = definedWhere([
          { signalStateId },
          { themeCandidateId },
          { securityId },
          { themeId },
        ]);
        const jobScope = definedWhere([{ jobRunId }, { payloadId }]);

        if (candidateScope.length > 0) {
          await prisma.watchlistItem.deleteMany({
            where: { OR: candidateScope },
          });
        }
        if (stateScope.length > 0) {
          await prisma.alert.deleteMany({ where: { OR: stateScope } });
          await prisma.signalState.deleteMany({ where: { OR: stateScope } });
        }
        if (definedWhere([{ jobRunId }, { themeId }]).length > 0) {
          await prisma.themeSnapshot.deleteMany({
            where: { OR: definedWhere([{ jobRunId }, { themeId }]) },
          });
        }
        if (definedWhere([{ jobRunId }, { themeCandidateId }]).length > 0) {
          await prisma.candidateSignalState.deleteMany({
            where: { OR: definedWhere([{ jobRunId }, { themeCandidateId }]) },
          });
          await prisma.candidateSignalScore.deleteMany({
            where: { OR: definedWhere([{ jobRunId }, { themeCandidateId }]) },
          });
        }
        if (
          definedWhere([{ evidenceId }, { jobRunId }, { payloadId }]).length > 0
        ) {
          await prisma.evidenceLedger.deleteMany({
            where: {
              OR: definedWhere([{ evidenceId }, { jobRunId }, { payloadId }]),
            },
          });
        }
        if (candidateScope.length > 0) {
          await prisma.themeCandidate.deleteMany({
            where: { OR: candidateScope },
          });
        }
        if (themeId) {
          await prisma.themeDefinition.deleteMany({ where: { themeId } });
        }
        if (securityId) {
          await prisma.security.deleteMany({ where: { securityId } });
        }
        if (jobScope.length > 0) {
          await prisma.apiObservability.deleteMany({ where: { OR: jobScope } });
        }
        if (payloadId) {
          await prisma.providerPayload.deleteMany({ where: { payloadId } });
        }
        if (jobRunId) {
          await prisma.jobRun.deleteMany({ where: { jobRunId } });
        }
      }
    });
  },
);
