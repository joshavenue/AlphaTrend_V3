import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Prisma } from "@/generated/prisma/client";
import { hasProviderSource } from "@/lib/candidates/sources";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import { fetchFmpProfile, fetchSecCompanyFacts } from "@/lib/providers/clients";
import type { ProviderResult } from "@/lib/providers/types";
import { validateCompanySeedRows } from "@/lib/themes/company-seeds";
import {
  T1_EXPOSURE_SCORE_VERSION,
  T1_REASON_CODES,
  T1_SIGNAL_LAYER,
} from "@/lib/exposure/constants";
import { scoreExposurePurity } from "@/lib/exposure/scoring";
import type {
  ExposureDbClient,
  ExposureScoringOptions,
  ExposureScoringSummary,
  ExposureThemeSummary,
} from "@/lib/exposure/types";
import { isUuid } from "@/lib/util/uuid";

const DEFAULT_COMPANY_SEED_PATH = resolve(
  process.cwd(),
  "data/theme-seeds/AlphaTrend_V3_theme_company_seed_universe.csv",
);
const LOCK_TTL_MS = 30 * 60 * 1_000;
const ACTIVE_THEME_STATUSES = [
  "ACTIVE_UNSCANNED",
  "ACTIVE_SCANNED",
  "ACTIVE",
] as const;

type CandidateForScoring = Awaited<
  ReturnType<typeof loadCandidatesForScoring>
>[number];

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function shortError(error: string | undefined) {
  if (!error) {
    return undefined;
  }

  return error.length > 180 ? `${error.slice(0, 177)}...` : error;
}

function providerCalls(results: ProviderResult<unknown>[]) {
  return results.filter((result) => result.status !== "UNCONFIGURED").length;
}

function rowsReadFromProviders(results: ProviderResult<unknown>[]) {
  return results.reduce((sum, result) => sum + (result.rowCount ?? 0), 0);
}

function themeWhere(themeRef?: string) {
  if (!themeRef) {
    return {
      status: {
        in: [...ACTIVE_THEME_STATUSES],
      },
    };
  }

  return {
    OR: [
      ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
      { sourceThemeCode: themeRef },
      { themeSlug: themeRef },
    ],
  };
}

async function loadCandidatesForScoring(
  prisma: ExposureDbClient,
  options: ExposureScoringOptions,
) {
  const candidates = await prisma.themeCandidate.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          cik: true,
          companyName: true,
          securityId: true,
        },
      },
      theme: {
        select: {
          directBeneficiaryCategories: true,
          excludedCategories: true,
          indirectBeneficiaryCategories: true,
          seedEtfs: true,
          sourceThemeCode: true,
          themeId: true,
          themeName: true,
          themeSlug: true,
        },
      },
    },
    orderBy: [
      {
        theme: {
          sourceThemeCode: "asc",
        },
      },
      {
        security: {
          canonicalTicker: "asc",
        },
      },
    ],
    where: {
      security: options.ticker
        ? {
            canonicalTicker: options.ticker.trim().toUpperCase(),
          }
        : undefined,
      theme: themeWhere(options.themeRef),
    },
  });

  if (candidates.length === 0) {
    throw new Error(
      options.themeRef || options.ticker
        ? `No candidates found for ${options.themeRef ?? "all themes"} ${options.ticker ?? ""}.`.trim()
        : "No active-theme candidates found for exposure scoring.",
    );
  }

  return candidates;
}

async function acquireLock(
  prisma: ExposureDbClient,
  jobRunId: string,
  scope: string,
) {
  const lockKey = `t1_exposure_purity:${scope}`;
  const now = new Date();

  await prisma.jobLock.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
      lockKey,
    },
  });

  try {
    await prisma.jobLock.create({
      data: {
        expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
        jobRunId,
        lockKey,
        ownerId: "exposure-scoring-cli",
      },
    });
  } catch {
    throw new Error(`T1 exposure scoring is already running for ${scope}.`);
  }

  return lockKey;
}

async function releaseLock(
  prisma: ExposureDbClient,
  jobRunId: string,
  lockKey: string,
) {
  await prisma.jobLock.deleteMany({
    where: {
      jobRunId,
      lockKey,
    },
  });
}

async function loadManualSeeds(companySeedPath: string) {
  const source = await readFile(companySeedPath, "utf8");
  const result = validateCompanySeedRows(source);
  const errors = result.issues.filter((issue) => issue.severity === "ERROR");

  if (errors.length > 0) {
    throw new Error(
      `Company seed validation failed: ${errors
        .slice(0, 3)
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return new Map(
    result.rows.map((row) => [
      `${row.themeCode}:${row.ticker.toUpperCase()}`,
      {
        beneficiaryType: row.beneficiaryType,
        candidateRole: row.candidateRole,
        notes: row.notes,
      },
    ]),
  );
}

function warning(input: ExposureScoringSummary["warnings"][number]) {
  return input;
}

function providerWarning(
  candidate: CandidateForScoring,
  result: ProviderResult<unknown>,
) {
  if (result.ok) {
    return undefined;
  }

  return warning({
    code:
      result.status === "UNCONFIGURED"
        ? T1_REASON_CODES.PROVIDER_UNCONFIGURED
        : T1_REASON_CODES.PROVIDER_CALL_FAILED,
    message: `${result.provider}:${result.endpoint} ${candidate.security.canonicalTicker} ${result.status}${
      result.sanitizedError ? ` - ${shortError(result.sanitizedError)}` : ""
    }`,
    severity: "WARNING",
    themeCode: candidate.theme.sourceThemeCode ?? undefined,
    ticker: candidate.security.canonicalTicker,
  });
}

async function writeEvidenceRows(
  prisma: ExposureDbClient,
  candidate: CandidateForScoring,
  jobRunId: string,
  score: ReturnType<typeof scoreExposurePurity>,
) {
  const now = new Date();
  const evidenceIds: string[] = [];
  const detailEvidence = await insertEvidence(prisma, {
    endpoint: "t1_exposure_purity",
    entityId: candidate.themeCandidateId,
    entityType: "theme_candidate",
    evidenceGrade: "B",
    fetchedAt: now,
    jobRunId,
    metricName: "t1.exposure_score_detail",
    metricValueNum: score.score,
    metricValueText: JSON.stringify(score.scoreDetail),
    provider: "ALPHATREND_INTERNAL",
    reasonCode:
      score.scoreDetail.reason_codes[0] ??
      T1_REASON_CODES.MAPPING_REVIEW_REQUIRED,
    scoreImpact: score.score,
    securityId: candidate.securityId,
    sourcePayloadHash: hashPayload({
      candidate: candidate.themeCandidateId,
      scoreDetail: score.scoreDetail,
    }),
    sourceUrlOrEndpoint: "alphatrend://t1_exposure_purity",
    themeId: candidate.themeId,
  });

  evidenceIds.push(detailEvidence.evidenceId);

  for (const detail of score.evidenceDetails) {
    const evidence = await insertEvidence(prisma, {
      endpoint: "t1_exposure_purity",
      entityId: candidate.themeCandidateId,
      entityType: "theme_candidate",
      evidenceGrade: "B",
      fetchedAt: now,
      jobRunId,
      metricName: detail.metricName,
      metricValueNum:
        detail.metricName === "t1.exposure_purity_score"
          ? score.score
          : detail.scoreImpact,
      metricValueText: detail.metricValueText,
      provider: "ALPHATREND_INTERNAL",
      reasonCode: detail.reasonCode,
      scoreImpact: detail.scoreImpact,
      securityId: candidate.securityId,
      sourcePayloadHash: hashPayload({
        candidate: candidate.themeCandidateId,
        detail,
        scoreVersion: T1_EXPOSURE_SCORE_VERSION,
      }),
      sourceUrlOrEndpoint: "alphatrend://t1_exposure_purity",
      themeId: candidate.themeId,
    });

    evidenceIds.push(evidence.evidenceId);
  }

  return evidenceIds;
}

async function persistExposureScore(
  prisma: ExposureDbClient,
  candidate: CandidateForScoring,
  jobRunId: string,
  score: ReturnType<typeof scoreExposurePurity>,
) {
  const now = new Date();
  const evidenceIds = await writeEvidenceRows(
    prisma,
    candidate,
    jobRunId,
    score,
  );
  const reasonCodes = toJsonValue(score.scoreDetail.reason_codes);

  await prisma.candidateSignalScore.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      maxScore: 100,
      reasonCodes,
      score: score.score,
      scoreVersion: T1_EXPOSURE_SCORE_VERSION,
      signalLayer: T1_SIGNAL_LAYER,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.candidateSignalState.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      reasonCodes,
      signalLayer: T1_SIGNAL_LAYER,
      state: score.beneficiaryType,
      stateVersion: T1_EXPOSURE_SCORE_VERSION,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.themeCandidate.update({
    data: {
      beneficiaryType: score.beneficiaryType,
      candidateStatus: score.candidateStatus,
      dashboardVisible: hasProviderSource(candidate.sourceDetail),
      displayGroup: score.displayGroup,
      lastScannedAt: now,
    },
    where: {
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.jobItem.create({
    data: {
      finishedAt: now,
      itemId: `${candidate.theme.sourceThemeCode ?? candidate.themeId}:${candidate.security.canonicalTicker}`,
      itemType: "T1_EXPOSURE_SCORE",
      jobRunId,
      startedAt: now,
      status: "SUCCEEDED",
    },
  });

  return evidenceIds.length;
}

function emptyThemeSummary(
  candidate: CandidateForScoring,
): ExposureThemeSummary {
  return {
    candidatesScored: 0,
    directBeneficiaries: 0,
    majorBeneficiaries: 0,
    rejectedOrWrongTicker: 0,
    reviewRequired: 0,
    sourceThemeCode: candidate.theme.sourceThemeCode ?? candidate.theme.themeId,
    themeId: candidate.theme.themeId,
    themeName: candidate.theme.themeName,
    watchOnly: 0,
  };
}

function updateThemeSummary(
  summary: ExposureThemeSummary,
  score: ReturnType<typeof scoreExposurePurity>,
) {
  summary.candidatesScored += 1;

  if (score.beneficiaryType === "DIRECT_BENEFICIARY") {
    summary.directBeneficiaries += 1;
  }

  if (score.beneficiaryType === "MAJOR_BENEFICIARY") {
    summary.majorBeneficiaries += 1;
  }

  if (score.candidateStatus === "REJECTED") {
    summary.rejectedOrWrongTicker += 1;
  }

  if (score.candidateStatus === "REVIEW_REQUIRED") {
    summary.reviewRequired += 1;
  }

  if (score.candidateStatus === "WATCH_ONLY") {
    summary.watchOnly += 1;
  }
}

export async function scoreThemeExposure(
  prisma: ExposureDbClient,
  options: ExposureScoringOptions = {},
): Promise<ExposureScoringSummary> {
  const includeFmp = options.includeFmp ?? true;
  const includeSec = options.includeSec ?? true;
  const companySeedPath = resolve(
    options.companySeedPath ?? DEFAULT_COMPANY_SEED_PATH,
  );
  const scope = [
    options.themeRef ?? "all-active",
    options.ticker ? options.ticker.trim().toUpperCase() : undefined,
  ]
    .filter(Boolean)
    .join(":");
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "THEME_SCAN",
      scopeId: scope,
      scopeType: "t1_exposure_purity",
      status: "STARTED",
    },
  });
  const lockKey = await acquireLock(prisma, jobRun.jobRunId, scope);
  const providerResults: ProviderResult<unknown>[] = [];
  const warnings: ExposureScoringSummary["warnings"] = [];
  const themeSummaries = new Map<string, ExposureThemeSummary>();
  let evidenceWritten = 0;
  let rowsWritten = 0;

  try {
    const [candidates, manualSeeds] = await Promise.all([
      loadCandidatesForScoring(prisma, options),
      loadManualSeeds(companySeedPath),
    ]);

    for (const candidate of candidates) {
      const ticker = candidate.security.canonicalTicker;
      const manualSeed =
        manualSeeds.get(
          `${candidate.theme.sourceThemeCode ?? candidate.themeId}:${ticker}`,
        ) ?? undefined;
      const fmpProfileResult = includeFmp
        ? await fetchFmpProfile(
            {
              jobRunId: jobRun.jobRunId,
              prisma,
            },
            ticker,
          )
        : undefined;
      const secCompanyFactsResult =
        includeSec && candidate.security.cik
          ? await fetchSecCompanyFacts(
              {
                jobRunId: jobRun.jobRunId,
                prisma,
              },
              candidate.security.cik,
            )
          : undefined;

      if (fmpProfileResult) {
        providerResults.push(fmpProfileResult);
        const fmpWarning = providerWarning(candidate, fmpProfileResult);

        if (fmpWarning) {
          warnings.push(fmpWarning);
        }
      }

      if (secCompanyFactsResult) {
        providerResults.push(secCompanyFactsResult);
        const secWarning = providerWarning(candidate, secCompanyFactsResult);

        if (secWarning) {
          warnings.push(secWarning);
        }
      } else if (includeSec && !candidate.security.cik) {
        warnings.push(
          warning({
            code: T1_REASON_CODES.SEC_CIK_MISSING,
            message: `${ticker} has no CIK in the security master; SEC companyfacts skipped.`,
            severity: "WARNING",
            themeCode: candidate.theme.sourceThemeCode ?? undefined,
            ticker,
          }),
        );
      }

      const score = scoreExposurePurity({
        candidate: {
          sourceDetail: candidate.sourceDetail,
          sourceOfInclusion: candidate.sourceOfInclusion,
          themeCandidateId: candidate.themeCandidateId,
        },
        fmpProfile: fmpProfileResult?.ok
          ? fmpProfileResult.data?.[0]
          : undefined,
        manualSeed,
        secCompanyFacts: secCompanyFactsResult?.ok
          ? secCompanyFactsResult.data
          : undefined,
        security: {
          canonicalTicker: ticker,
          companyName: candidate.security.companyName,
        },
        theme: {
          directBeneficiaryCategories:
            candidate.theme.directBeneficiaryCategories,
          excludedCategories: candidate.theme.excludedCategories,
          indirectBeneficiaryCategories:
            candidate.theme.indirectBeneficiaryCategories,
          seedEtfs: candidate.theme.seedEtfs,
          sourceThemeCode: candidate.theme.sourceThemeCode,
          themeId: candidate.theme.themeId,
          themeName: candidate.theme.themeName,
        },
      });

      const candidateEvidenceWritten = await persistExposureScore(
        prisma,
        candidate,
        jobRun.jobRunId,
        score,
      );
      evidenceWritten += candidateEvidenceWritten;
      rowsWritten += candidateEvidenceWritten + 4;

      const summary =
        themeSummaries.get(candidate.theme.themeId) ??
        emptyThemeSummary(candidate);

      updateThemeSummary(summary, score);
      themeSummaries.set(candidate.theme.themeId, summary);
    }

    const summary: ExposureScoringSummary = {
      candidatesScored: candidates.length,
      evidenceWritten,
      fmpConfigured: providerResults.some(
        (result) =>
          result.provider === "FMP" && result.status !== "UNCONFIGURED",
      ),
      jobRunId: jobRun.jobRunId,
      providerCalls: providerCalls(providerResults),
      rowsRead: candidates.length + rowsReadFromProviders(providerResults),
      rowsWritten,
      secConfigured: providerResults.some(
        (result) =>
          result.provider === "SEC" && result.status !== "UNCONFIGURED",
      ),
      themes: [...themeSummaries.values()],
      warnings,
    };

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length === 0
            ? undefined
            : `${warnings.length} exposure scoring warning(s); see command output.`,
        finishedAt: new Date(),
        providerCalls: summary.providerCalls,
        rowsRead: summary.rowsRead,
        rowsWritten: summary.rowsWritten,
        status: "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(message),
        finishedAt: new Date(),
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    throw error;
  } finally {
    await releaseLock(prisma, jobRun.jobRunId, lockKey);
  }
}
