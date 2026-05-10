import type {
  EvidenceGrade,
  Prisma,
  PrismaClient,
  ProviderName,
} from "@/generated/prisma/client";
import {
  defaultEvidenceGradeForProvider,
  freshnessScoreForDate,
  reliabilityScoreForGrade,
} from "@/lib/evidence/freshness";

type EvidenceDbClient = Pick<PrismaClient, "evidenceLedger">;

export type InsertEvidenceInput = {
  provider: ProviderName;
  endpoint?: string;
  jobRunId?: string;
  themeId?: string;
  securityId?: string;
  payloadId?: string;
  sourcePayloadHash?: string;
  sourceUrlOrEndpoint?: string;
  entityType?: string;
  entityId?: string;
  metricName: string;
  metricValueText?: string;
  metricValueNum?: Prisma.Decimal | number | string;
  metricUnit?: string;
  periodStart?: Date;
  periodEnd?: Date;
  asOfDate?: Date;
  observedAt?: Date;
  fetchedAt?: Date;
  evidenceGrade?: EvidenceGrade;
  reliabilityScore?: Prisma.Decimal | number | string;
  freshnessScore?: Prisma.Decimal | number | string;
  reasonCode?: string;
  scoreImpact?: Prisma.Decimal | number | string;
};

export async function insertEvidence(
  prisma: EvidenceDbClient,
  input: InsertEvidenceInput,
) {
  if (!input.payloadId && !input.sourcePayloadHash) {
    throw new Error("Evidence requires payloadId or sourcePayloadHash.");
  }

  if (input.scoreImpact !== undefined && !input.reasonCode) {
    throw new Error("Evidence with scoreImpact requires a reasonCode.");
  }

  const evidenceGrade =
    input.evidenceGrade ?? defaultEvidenceGradeForProvider(input.provider);
  const observedAt = input.observedAt ?? input.asOfDate ?? input.fetchedAt;

  return prisma.evidenceLedger.create({
    data: {
      asOfDate: input.asOfDate,
      endpoint: input.endpoint,
      entityId: input.entityId,
      entityType: input.entityType,
      evidenceGrade,
      fetchedAt: input.fetchedAt,
      freshnessScore:
        input.freshnessScore ??
        (observedAt === undefined
          ? undefined
          : freshnessScoreForDate(observedAt)),
      jobRunId: input.jobRunId,
      metricName: input.metricName,
      metricUnit: input.metricUnit,
      metricValueNum: input.metricValueNum,
      metricValueText: input.metricValueText,
      observedAt: input.observedAt,
      payloadId: input.payloadId,
      periodEnd: input.periodEnd,
      periodStart: input.periodStart,
      provider: input.provider,
      reasonCode: input.reasonCode,
      reliabilityScore:
        input.reliabilityScore ?? reliabilityScoreForGrade(evidenceGrade),
      scoreImpact: input.scoreImpact,
      securityId: input.securityId,
      sourcePayloadHash: input.sourcePayloadHash,
      sourceUrlOrEndpoint: input.sourceUrlOrEndpoint,
      themeId: input.themeId,
    },
  });
}
