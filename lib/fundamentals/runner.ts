import type { Prisma } from "@/generated/prisma/client";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import {
  T3_DATA_REASON_CODES,
  T3_FUNDAMENTAL_SCORE_VERSION,
  T3_REASON_CODES,
  T3_SIGNAL_LAYER,
} from "@/lib/fundamentals/constants";
import {
  mergeFundamentalData,
  normalizeFmpFundamentals,
  normalizeSecCompanyFacts,
} from "@/lib/fundamentals/normalization";
import { reconcileFundamentals } from "@/lib/fundamentals/reconciliation";
import { scoreFundamentalValidation } from "@/lib/fundamentals/scoring";
import type {
  FundamentalDbClient,
  FundamentalProviderBundle,
  FundamentalScoringOptions,
  FundamentalScoringSummary,
  FundamentalThemeSummary,
  ReconciliationSummary,
} from "@/lib/fundamentals/types";
import {
  fetchFmpBalanceSheetStatement,
  fetchFmpCashFlowStatement,
  fetchFmpIncomeStatement,
  fetchFmpKeyMetrics,
  fetchFmpRatios,
  fetchSecFundamentalCompanyFacts,
} from "@/lib/providers/clients";
import type { ProviderResult } from "@/lib/providers/types";
import { isUuid } from "@/lib/util/uuid";

const LOCK_TTL_MS = 30 * 60 * 1_000;
const ACTIVE_THEME_STATUSES = [
  "ACTIVE_UNSCANNED",
  "ACTIVE_SCANNED",
  "ACTIVE",
] as const;
const SCORABLE_T1_STATES = [
  "MAJOR_BENEFICIARY",
  "DIRECT_BENEFICIARY",
  "PARTIAL_BENEFICIARY",
  "INDIRECT_BENEFICIARY",
] as const;

type CandidateForFundamentals = Awaited<
  ReturnType<typeof loadCandidatesForFundamentals>
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

async function loadCandidatesForFundamentals(
  prisma: FundamentalDbClient,
  options: FundamentalScoringOptions,
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
      signalScores: {
        orderBy: {
          computedAt: "desc",
        },
        take: 1,
        where: {
          signalLayer: T1_SIGNAL_LAYER,
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        take: 1,
        where: {
          signalLayer: T1_SIGNAL_LAYER,
        },
      },
      theme: {
        select: {
          requiredFundamentalProof: true,
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
      signalStates: {
        some: {
          signalLayer: T1_SIGNAL_LAYER,
          state: {
            in: [...SCORABLE_T1_STATES],
          },
        },
      },
      theme: themeWhere(options.themeRef),
    },
  });

  if (candidates.length === 0) {
    throw new Error(
      options.themeRef || options.ticker
        ? `No T1-scored candidates found for ${options.themeRef ?? "all themes"} ${options.ticker ?? ""}.`.trim()
        : "No active-theme T1-scored candidates found for fundamental scoring.",
    );
  }

  return candidates;
}

async function acquireLock(
  prisma: FundamentalDbClient,
  jobRunId: string,
  scope: string,
) {
  const lockKey = `t3_fundamentals:${scope}`;
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
        ownerId: "fundamental-scoring-cli",
      },
    });
  } catch {
    throw new Error(`T3 fundamental scoring is already running for ${scope}.`);
  }

  return lockKey;
}

async function releaseLock(
  prisma: FundamentalDbClient,
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

function warning(input: FundamentalScoringSummary["warnings"][number]) {
  return input;
}

function providerWarning(
  candidate: CandidateForFundamentals,
  result: ProviderResult<unknown>,
) {
  if (result.ok) {
    return undefined;
  }

  return warning({
    code:
      result.status === "UNCONFIGURED"
        ? T3_DATA_REASON_CODES.PROVIDER_UNCONFIGURED
        : T3_DATA_REASON_CODES.PROVIDER_CALL_FAILED,
    message: `${result.provider}:${result.endpoint} ${candidate.security.canonicalTicker} ${result.status}${
      result.sanitizedError ? ` - ${shortError(result.sanitizedError)}` : ""
    }`,
    severity: "WARNING",
    themeCode: candidate.theme.sourceThemeCode ?? undefined,
    ticker: candidate.security.canonicalTicker,
  });
}

async function fetchFmpBundle(
  prisma: FundamentalDbClient,
  jobRunId: string,
  ticker: string,
) {
  const providerResults: ProviderResult<unknown>[] = [];
  const periodOptions = {
    limit: 12,
    period: "quarter" as const,
  };
  const income = await fetchFmpIncomeStatement(
    {
      jobRunId,
      prisma,
    },
    ticker,
    periodOptions,
  );
  providerResults.push(income);

  if (income.status === "UNCONFIGURED") {
    return {
      bundle: undefined,
      providerResults,
    };
  }

  const [balance, cashFlow, keyMetrics, ratios] = await Promise.all([
    fetchFmpBalanceSheetStatement(
      {
        jobRunId,
        prisma,
      },
      ticker,
      periodOptions,
    ),
    fetchFmpCashFlowStatement(
      {
        jobRunId,
        prisma,
      },
      ticker,
      periodOptions,
    ),
    fetchFmpKeyMetrics(
      {
        jobRunId,
        prisma,
      },
      ticker,
      periodOptions,
    ),
    fetchFmpRatios(
      {
        jobRunId,
        prisma,
      },
      ticker,
      periodOptions,
    ),
  ]);

  providerResults.push(balance, cashFlow, keyMetrics, ratios);

  return {
    bundle: {
      balanceSheetStatements: balance.ok ? balance.data : undefined,
      cashFlowStatements: cashFlow.ok ? cashFlow.data : undefined,
      incomeStatements: income.ok ? income.data : undefined,
      keyMetrics: keyMetrics.ok ? keyMetrics.data : undefined,
      ratios: ratios.ok ? ratios.data : undefined,
    },
    providerResults,
  };
}

async function fetchProviderBundle(
  prisma: FundamentalDbClient,
  candidate: CandidateForFundamentals,
  jobRunId: string,
  options: FundamentalScoringOptions,
) {
  const ticker = candidate.security.canonicalTicker;
  const fixture = options.providerDataByTicker?.[ticker];
  const providerResults: ProviderResult<unknown>[] = [];
  const warnings: FundamentalScoringSummary["warnings"] = [];
  let sec = fixture?.sec;
  let fmp = fixture?.fmp;

  if (!fixture && options.includeSec !== false) {
    if (candidate.security.cik) {
      const secResult = await fetchSecFundamentalCompanyFacts(
        {
          jobRunId,
          prisma,
        },
        candidate.security.cik,
      );
      providerResults.push(secResult);

      const secWarning = providerWarning(candidate, secResult);

      if (secWarning) {
        warnings.push(secWarning);
      }

      sec = secResult.ok ? secResult.data : undefined;
    } else {
      warnings.push(
        warning({
          code: T3_REASON_CODES.CRITICAL_DATA_MISSING,
          message: `${ticker} has no CIK in the security master; SEC companyfacts skipped.`,
          severity: "WARNING",
          themeCode: candidate.theme.sourceThemeCode ?? undefined,
          ticker,
        }),
      );
    }
  }

  if (!fixture && options.includeFmp !== false) {
    const fmpResult = await fetchFmpBundle(prisma, jobRunId, ticker);
    providerResults.push(...fmpResult.providerResults);

    for (const result of fmpResult.providerResults) {
      const fmpWarning = providerWarning(candidate, result);

      if (fmpWarning) {
        warnings.push(fmpWarning);
      }
    }

    fmp = fmpResult.bundle;
  }

  return {
    bundle: {
      fmp,
      sec,
    } satisfies FundamentalProviderBundle,
    providerResults,
    warnings,
  };
}

function segmentEvidenceFor(candidate: CandidateForFundamentals) {
  const state = candidate.signalStates[0]?.state;

  if (state === "MAJOR_BENEFICIARY" || state === "DIRECT_BENEFICIARY") {
    return "direct_business_line" as const;
  }

  if (state === "PARTIAL_BENEFICIARY" || state === "INDIRECT_BENEFICIARY") {
    return "partial" as const;
  }

  return "none" as const;
}

function dateFromIso(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

async function writeEvidenceRows(
  prisma: FundamentalDbClient,
  candidate: CandidateForFundamentals,
  jobRunId: string,
  score: ReturnType<typeof scoreFundamentalValidation>,
  reconciliation: ReconciliationSummary,
) {
  const now = new Date();
  const evidenceIds: string[] = [];
  const detailEvidence = await insertEvidence(prisma, {
    endpoint: "t3_fundamental_validation",
    entityId: candidate.themeCandidateId,
    entityType: "theme_candidate",
    evidenceGrade: "B",
    fetchedAt: now,
    jobRunId,
    metricName: "t3.fundamental_score_detail",
    metricValueNum: score.score,
    metricValueText: JSON.stringify(score.scoreDetail),
    provider: "ALPHATREND_INTERNAL",
    reasonCode:
      score.scoreDetail.reason_codes[0] ??
      T3_REASON_CODES.CRITICAL_DATA_MISSING,
    scoreImpact: score.score,
    securityId: candidate.securityId,
    sourcePayloadHash: hashPayload({
      candidate: candidate.themeCandidateId,
      scoreDetail: score.scoreDetail,
    }),
    sourceUrlOrEndpoint: "alphatrend://t3_fundamental_validation",
    themeId: candidate.themeId,
  });

  evidenceIds.push(detailEvidence.evidenceId);

  for (const detail of score.evidenceDetails) {
    const evidence = await insertEvidence(prisma, {
      asOfDate: dateFromIso(detail.periodEnd),
      endpoint: "t3_fundamental_validation",
      entityId: candidate.themeCandidateId,
      entityType: "theme_candidate",
      evidenceGrade: "B",
      fetchedAt: now,
      jobRunId,
      metricName: detail.metricName,
      metricUnit: detail.metricUnit,
      metricValueNum: detail.metricValueNum,
      metricValueText: detail.metricValueText,
      provider: "ALPHATREND_INTERNAL",
      reasonCode: detail.reasonCode,
      scoreImpact: detail.scoreImpact,
      securityId: candidate.securityId,
      sourcePayloadHash: hashPayload({
        candidate: candidate.themeCandidateId,
        detail,
        scoreVersion: T3_FUNDAMENTAL_SCORE_VERSION,
      }),
      sourceUrlOrEndpoint: "alphatrend://t3_fundamental_validation",
      themeId: candidate.themeId,
    });

    evidenceIds.push(evidence.evidenceId);
  }

  for (const discrepancy of reconciliation.discrepancies) {
    const evidence = await insertEvidence(prisma, {
      asOfDate: dateFromIso(discrepancy.periodEnd),
      endpoint: "t3_fundamental_reconciliation",
      entityId: candidate.themeCandidateId,
      entityType: "theme_candidate",
      evidenceGrade: "B",
      fetchedAt: now,
      jobRunId,
      metricName: `t3.reconciliation.${discrepancy.metricName}`,
      metricUnit: "ratio",
      metricValueNum: discrepancy.percentDifference,
      metricValueText: JSON.stringify(discrepancy),
      provider: "ALPHATREND_INTERNAL",
      reasonCode: T3_DATA_REASON_CODES.DATA_VENDOR_DISAGREEMENT,
      securityId: candidate.securityId,
      sourcePayloadHash: hashPayload({
        candidate: candidate.themeCandidateId,
        discrepancy,
        scoreVersion: T3_FUNDAMENTAL_SCORE_VERSION,
      }),
      sourceUrlOrEndpoint: "alphatrend://t3_fundamental_reconciliation",
      themeId: candidate.themeId,
    });

    evidenceIds.push(evidence.evidenceId);
  }

  return evidenceIds;
}

async function persistFundamentalScore(
  prisma: FundamentalDbClient,
  candidate: CandidateForFundamentals,
  jobRunId: string,
  score: ReturnType<typeof scoreFundamentalValidation>,
  reconciliation: ReconciliationSummary,
) {
  const now = new Date();
  const evidenceIds = await writeEvidenceRows(
    prisma,
    candidate,
    jobRunId,
    score,
    reconciliation,
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
      scoreVersion: T3_FUNDAMENTAL_SCORE_VERSION,
      signalLayer: T3_SIGNAL_LAYER,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.candidateSignalState.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      reasonCodes,
      signalLayer: T3_SIGNAL_LAYER,
      state: score.state,
      stateVersion: T3_FUNDAMENTAL_SCORE_VERSION,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.themeCandidate.update({
    data: {
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
      itemType: "T3_FUNDAMENTAL_SCORE",
      jobRunId,
      startedAt: now,
      status: "SUCCEEDED",
    },
  });

  return evidenceIds.length;
}

function emptyThemeSummary(
  candidate: CandidateForFundamentals,
): FundamentalThemeSummary {
  return {
    candidatesScored: 0,
    contradicted: 0,
    deteriorating: 0,
    improving: 0,
    insufficientData: 0,
    notYetValidated: 0,
    sourceThemeCode: candidate.theme.sourceThemeCode ?? candidate.theme.themeId,
    themeId: candidate.theme.themeId,
    themeName: candidate.theme.themeName,
    validated: 0,
  };
}

function updateThemeSummary(
  summary: FundamentalThemeSummary,
  score: ReturnType<typeof scoreFundamentalValidation>,
) {
  summary.candidatesScored += 1;

  if (score.state === "VALIDATED") {
    summary.validated += 1;
  } else if (score.state === "IMPROVING") {
    summary.improving += 1;
  } else if (score.state === "NOT_YET_VALIDATED") {
    summary.notYetValidated += 1;
  } else if (score.state === "DETERIORATING") {
    summary.deteriorating += 1;
  } else if (score.state === "CONTRADICTED") {
    summary.contradicted += 1;
  } else if (score.state === "INSUFFICIENT_DATA") {
    summary.insufficientData += 1;
  }
}

export async function scoreThemeFundamentals(
  prisma: FundamentalDbClient,
  options: FundamentalScoringOptions = {},
): Promise<FundamentalScoringSummary> {
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
      scopeType: "t3_fundamentals",
      status: "STARTED",
    },
  });
  const lockKey = await acquireLock(prisma, jobRun.jobRunId, scope);
  const providerResults: ProviderResult<unknown>[] = [];
  const warnings: FundamentalScoringSummary["warnings"] = [];
  const themeSummaries = new Map<string, FundamentalThemeSummary>();
  let evidenceWritten = 0;
  let rowsWritten = 0;

  try {
    const candidates = await loadCandidatesForFundamentals(prisma, options);

    for (const candidate of candidates) {
      const ticker = candidate.security.canonicalTicker;
      const provider = await fetchProviderBundle(
        prisma,
        candidate,
        jobRun.jobRunId,
        options,
      );

      providerResults.push(...provider.providerResults);
      warnings.push(...provider.warnings);

      const secData = normalizeSecCompanyFacts(provider.bundle.sec);
      const fmpData = normalizeFmpFundamentals(provider.bundle.fmp ?? {});
      const reconciliation = reconcileFundamentals(secData, fmpData);
      const financials = mergeFundamentalData(secData, fmpData);
      const t1Score = candidate.signalScores[0]?.score;
      const score = scoreFundamentalValidation({
        financials,
        reconciliation,
        segmentEvidence: segmentEvidenceFor(candidate),
        t1ExposureScore:
          t1Score === null || t1Score === undefined
            ? undefined
            : Number(t1Score),
        t1State: candidate.signalStates[0]?.state,
      });

      if (reconciliation.materialDisagreementCount > 0) {
        warnings.push(
          warning({
            code: T3_REASON_CODES.SEC_VENDOR_DISAGREEMENT,
            message: `${ticker} has ${reconciliation.materialDisagreementCount} material SEC/FMP fundamental disagreement(s). SEC values won scoring.`,
            severity: "WARNING",
            themeCode: candidate.theme.sourceThemeCode ?? undefined,
            ticker,
          }),
        );
      }

      const candidateEvidenceWritten = await persistFundamentalScore(
        prisma,
        candidate,
        jobRun.jobRunId,
        score,
        reconciliation,
      );
      evidenceWritten += candidateEvidenceWritten;
      rowsWritten += candidateEvidenceWritten + 4;

      const summary =
        themeSummaries.get(candidate.theme.themeId) ??
        emptyThemeSummary(candidate);

      updateThemeSummary(summary, score);
      themeSummaries.set(candidate.theme.themeId, summary);
    }

    const summary: FundamentalScoringSummary = {
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
            : `${warnings.length} fundamental scoring warning(s); see command output.`,
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
