import type { Prisma } from "@/generated/prisma/client";
import { insertEvidence } from "@/lib/evidence/ledger";
import {
  candidateSourceHash,
  hasProviderSource,
  mergeCandidateSourceDetails,
  sourceOfInclusionFromDetail,
} from "@/lib/candidates/sources";
import type {
  CandidateDbClient,
  CandidatePersistResult,
  CandidateSourceRecord,
} from "@/lib/candidates/types";

function candidateKey(source: CandidateSourceRecord) {
  return `${source.themeId}:${source.securityId}`;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function groupByCandidate(sources: CandidateSourceRecord[]) {
  const grouped = new Map<string, CandidateSourceRecord[]>();

  for (const source of sources) {
    const key = candidateKey(source);
    const existing = grouped.get(key) ?? [];

    existing.push(source);
    grouped.set(key, existing);
  }

  return grouped;
}

async function writeCandidateEvidence(
  prisma: CandidateDbClient,
  jobRunId: string,
  source: CandidateSourceRecord,
) {
  if (!source.provider || (!source.payloadId && !source.responseHash)) {
    return 0;
  }

  await insertEvidence(prisma, {
    endpoint: source.sourceType,
    entityId: `${source.themeCode}:${source.ticker}:${source.sourceKey}`,
    entityType: "theme_candidate_source",
    evidenceGrade: "C",
    fetchedAt: new Date(),
    jobRunId,
    metricName: "candidate_source_inclusion",
    metricUnit: source.sourceWeight === undefined ? undefined : "weight",
    metricValueNum: source.sourceWeight,
    metricValueText: source.sourceType,
    payloadId: source.payloadId,
    provider: source.provider,
    securityId: source.securityId,
    sourcePayloadHash:
      source.payloadId === undefined
        ? (source.responseHash ?? candidateSourceHash(source))
        : undefined,
    sourceUrlOrEndpoint: source.sourceUrlOrEndpoint ?? source.sourceType,
    themeId: source.themeId,
  });

  return 1;
}

export async function persistCandidateSources(
  prisma: CandidateDbClient,
  jobRunId: string,
  sources: CandidateSourceRecord[],
): Promise<CandidatePersistResult> {
  const grouped = groupByCandidate(sources);
  const now = new Date();
  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  let evidenceWritten = 0;
  let jobItemsWritten = 0;

  for (const group of grouped.values()) {
    const first = group[0];
    const existing = await prisma.themeCandidate.findUnique({
      where: {
        themeId_securityId: {
          securityId: first.securityId,
          themeId: first.themeId,
        },
      },
    });
    const mergedSourceDetail = mergeCandidateSourceDetails(
      existing?.sourceDetail,
      group,
      jobRunId,
      now,
    );
    const sourceOfInclusion = sourceOfInclusionFromDetail(mergedSourceDetail);
    const dashboardVisible = hasProviderSource(mergedSourceDetail);

    if (existing) {
      await prisma.themeCandidate.update({
        data: {
          beneficiaryType: null,
          candidateStatus: "REVIEW_REQUIRED",
          dashboardVisible,
          displayGroup: "Unclassified",
          finalState: null,
          lastSeenAt: now,
          sourceDetail: toJsonValue(mergedSourceDetail),
          sourceOfInclusion,
        },
        where: {
          themeCandidateId: existing.themeCandidateId,
        },
      });
      candidatesUpdated += 1;
    } else {
      await prisma.themeCandidate.create({
        data: {
          beneficiaryType: null,
          candidateStatus: "REVIEW_REQUIRED",
          dashboardVisible,
          displayGroup: "Unclassified",
          finalState: null,
          lastSeenAt: now,
          securityId: first.securityId,
          sourceDetail: toJsonValue(mergedSourceDetail),
          sourceOfInclusion,
          themeId: first.themeId,
        },
      });
      candidatesCreated += 1;
    }

    await prisma.jobItem.create({
      data: {
        finishedAt: now,
        itemId: `${first.themeCode}:${first.securityId}`,
        itemType: "THEME_CANDIDATE",
        jobRunId,
        startedAt: now,
        status: "SUCCEEDED",
      },
    });
    jobItemsWritten += 1;

    for (const source of group) {
      evidenceWritten += await writeCandidateEvidence(prisma, jobRunId, source);
    }
  }

  return {
    candidatesCreated,
    candidatesTouched: candidatesCreated + candidatesUpdated,
    candidatesUpdated,
    evidenceWritten,
    jobItemsWritten,
    skipped: [],
  };
}
