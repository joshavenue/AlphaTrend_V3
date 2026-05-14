import type { Prisma } from "@/generated/prisma/client";
import {
  T5_OWNERSHIP_FLOW_SCORE_VERSION,
  T5_REASON_CODES,
  T5_SIGNAL_LAYER,
  T7_BASE_RATE_SCORE_VERSION,
  T7_REASON_CODES,
  T7_SIGNAL_LAYER,
} from "@/lib/advanced/constants";
import { scoreBaseRate, scoreOwnershipFlow } from "@/lib/advanced/scoring";
import type {
  AdvancedDbClient,
  AdvancedScoringOptions,
  AdvancedScoringSummary,
  AdvancedThemeSummary,
  AdvancedWarning,
  LatestEtfFlowSnapshot,
  LatestOwnershipSnapshot,
  OwnershipFlowSnapshotInput,
  PriceBarForBaseRate,
} from "@/lib/advanced/types";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import { isUuid } from "@/lib/util/uuid";

const LOCK_TTL_MS = 30 * 60 * 1_000;
const ACTIVE_THEME_STATUSES = [
  "ACTIVE_UNSCANNED",
  "ACTIVE_SCANNED",
  "ACTIVE",
] as const;
const PRICE_BAR_LIMIT = 900;

type CandidateForAdvanced = Awaited<
  ReturnType<typeof loadCandidatesForAdvanced>
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

function decimalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}

async function acquireLock(
  prisma: AdvancedDbClient,
  jobRunId: string,
  key: string,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  await prisma.jobLock.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
      lockKey: key,
    },
  });

  try {
    await prisma.jobLock.create({
      data: {
        expiresAt,
        jobRunId,
        lockKey: key,
        lockedAt: now,
        ownerId: `advanced:${process.pid}`,
      },
    });
  } catch (error) {
    throw new Error(
      `Advanced-layer job is already running for ${key}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return key;
}

async function releaseLock(
  prisma: AdvancedDbClient,
  jobRunId: string,
  lockKey?: string,
) {
  if (!lockKey) {
    return;
  }

  await prisma.jobLock.deleteMany({
    where: {
      jobRunId,
      lockKey,
    },
  });
}

async function loadCandidatesForAdvanced(
  prisma: AdvancedDbClient,
  options: AdvancedScoringOptions,
) {
  return prisma.themeCandidate.findMany({
    include: {
      etfFlowSnapshots: {
        orderBy: {
          fetchedAt: "desc",
        },
        take: 1,
      },
      ownershipSnapshots: {
        orderBy: {
          fetchedAt: "desc",
        },
        take: 1,
      },
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          securityId: true,
        },
      },
      theme: {
        select: {
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
      dashboardVisible: true,
      ...(options.ticker
        ? {
            security: {
              canonicalTicker: options.ticker.trim().toUpperCase(),
            },
          }
        : {}),
      theme: themeWhere(options.themeRef),
    },
  });
}

function ownershipInput(
  candidate: CandidateForAdvanced,
): OwnershipFlowSnapshotInput {
  const ownership = candidate.ownershipSnapshots[0] as
    | LatestOwnershipSnapshot
    | undefined;
  const etf = candidate.etfFlowSnapshots[0] as
    | LatestEtfFlowSnapshot
    | undefined;

  return {
    delayedData: ownership?.delayedData ?? true,
    etfFlowEligible: etf?.flowEligible,
    etfWeight: decimalNumber(etf?.holdingWeight),
    holderCount: ownership?.holderCount ?? undefined,
    licenseRestricted: etf?.licenseRestricted,
    ownershipPercent: decimalNumber(ownership?.ownershipPercent),
    ownershipTrend:
      ownership?.ownershipTrend === "INCREASING" ||
      ownership?.ownershipTrend === "DECREASING" ||
      ownership?.ownershipTrend === "STABLE"
        ? ownership.ownershipTrend
        : undefined,
    reportDate: ownership?.reportDate?.toISOString().slice(0, 10),
  };
}

async function loadPriceBars(
  prisma: AdvancedDbClient,
  securityId: string,
): Promise<PriceBarForBaseRate[]> {
  const rows = await prisma.priceBarDaily.findMany({
    orderBy: {
      barDate: "desc",
    },
    select: {
      barDate: true,
      close: true,
      high: true,
      low: true,
    },
    take: PRICE_BAR_LIMIT,
    where: {
      adjusted: true,
      securityId,
    },
  });

  return rows
    .map((row) => ({
      close: Number(row.close),
      date: row.barDate.toISOString().slice(0, 10),
      high: Number(row.high),
      low: Number(row.low),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function themeSummary(
  summaries: Map<string, AdvancedThemeSummary>,
  candidate: CandidateForAdvanced,
) {
  const existing = summaries.get(candidate.themeId);

  if (existing) {
    return existing;
  }

  const created = {
    baseRateLowSample: 0,
    baseRateScored: 0,
    flowScored: 0,
    flowWithAccess: 0,
    sourceThemeCode: candidate.theme.sourceThemeCode ?? candidate.themeId,
    themeId: candidate.themeId,
    themeName: candidate.theme.themeName,
  };

  summaries.set(candidate.themeId, created);
  return created;
}

async function persistOwnershipFlow(
  prisma: AdvancedDbClient,
  candidate: CandidateForAdvanced,
  jobRunId: string,
  result: ReturnType<typeof scoreOwnershipFlow>,
) {
  const now = new Date();
  const evidence = await insertEvidence(prisma, {
    entityId: candidate.themeCandidateId,
    entityType: "theme_candidate",
    jobRunId,
    metricName: "t5.ownership_flow_score",
    metricValueNum: result.score,
    metricValueText: `${result.flowState}:${result.score}`,
    provider: "ALPHATREND_INTERNAL",
    reasonCode: result.reasonCodes[0] ?? T5_REASON_CODES.DATA_MISSING,
    scoreImpact: undefined,
    securityId: candidate.securityId,
    sourcePayloadHash: hashPayload({
      candidate: candidate.themeCandidateId,
      detail: result.scoreDetail,
      scoreVersion: T5_OWNERSHIP_FLOW_SCORE_VERSION,
    }),
    sourceUrlOrEndpoint: "alphatrend://t5_ownership_flow",
    themeId: candidate.themeId,
  });
  const evidenceIds = [evidence.evidenceId];
  const reasonCodes = toJsonValue(result.reasonCodes);

  await prisma.candidateSignalScore.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      maxScore: 100,
      reasonCodes,
      score: result.score,
      scoreVersion: T5_OWNERSHIP_FLOW_SCORE_VERSION,
      signalLayer: T5_SIGNAL_LAYER,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.candidateSignalState.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      reasonCodes,
      signalLayer: T5_SIGNAL_LAYER,
      state: result.flowState,
      stateVersion: T5_OWNERSHIP_FLOW_SCORE_VERSION,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.jobItem.create({
    data: {
      finishedAt: now,
      itemId: `${candidate.theme.sourceThemeCode ?? candidate.themeId}:${candidate.security.canonicalTicker}`,
      itemType: "T5_OWNERSHIP_FLOW_SCORE",
      jobRunId,
      startedAt: now,
      status: "SUCCEEDED",
    },
  });

  return {
    evidenceWritten: evidenceIds.length,
    rowsWritten: evidenceIds.length + 3,
  };
}

async function persistBaseRate(
  prisma: AdvancedDbClient,
  candidate: CandidateForAdvanced,
  jobRunId: string,
  result: ReturnType<typeof scoreBaseRate>,
) {
  const now = new Date();
  const evidence = await insertEvidence(prisma, {
    entityId: candidate.themeCandidateId,
    entityType: "theme_candidate",
    jobRunId,
    metricName: "t7.base_rate_score",
    metricValueNum: result.score,
    metricValueText: `${result.baseRateState}:${result.score}:sample=${result.sampleSize}`,
    provider: "ALPHATREND_INTERNAL",
    reasonCode: result.reasonCodes[0] ?? T7_REASON_CODES.DATA_MISSING,
    securityId: candidate.securityId,
    sourcePayloadHash: hashPayload({
      candidate: candidate.themeCandidateId,
      detail: result.scoreDetail,
      scoreVersion: T7_BASE_RATE_SCORE_VERSION,
    }),
    sourceUrlOrEndpoint: "alphatrend://t7_base_rate",
    themeId: candidate.themeId,
  });
  const evidenceIds = [evidence.evidenceId];
  const reasonCodes = toJsonValue(result.reasonCodes);
  const metrics = result.scoreDetail.metrics;

  await prisma.baseRateResult.create({
    data: {
      algorithmVersion: T7_BASE_RATE_SCORE_VERSION,
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      medianDrawdown: metrics.median_drawdown,
      medianReturn1m: metrics.median_return_1m,
      medianReturn3m: metrics.median_return_3m,
      medianReturn6m: metrics.median_return_6m,
      reasonCodes,
      sampleSize: result.sampleSize,
      score: result.score,
      securityId: candidate.securityId,
      setupKey: result.setupKey,
      state: result.baseRateState,
      themeCandidateId: candidate.themeCandidateId,
      themeId: candidate.themeId,
      winRate1m: metrics.win_rate_1m,
      winRate3m: metrics.win_rate_3m,
      winRate6m: metrics.win_rate_6m,
      worstDecileDrawdown: metrics.worst_decile_drawdown,
    },
  });

  await prisma.candidateSignalScore.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      maxScore: 100,
      reasonCodes,
      score: result.score,
      scoreVersion: T7_BASE_RATE_SCORE_VERSION,
      signalLayer: T7_SIGNAL_LAYER,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.candidateSignalState.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      reasonCodes,
      signalLayer: T7_SIGNAL_LAYER,
      state: result.baseRateState,
      stateVersion: T7_BASE_RATE_SCORE_VERSION,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.jobItem.create({
    data: {
      finishedAt: now,
      itemId: `${candidate.theme.sourceThemeCode ?? candidate.themeId}:${candidate.security.canonicalTicker}`,
      itemType: "T7_BASE_RATE_SCORE",
      jobRunId,
      startedAt: now,
      status: "SUCCEEDED",
    },
  });

  return {
    evidenceWritten: evidenceIds.length,
    rowsWritten: evidenceIds.length + 4,
  };
}

export async function scoreOwnershipFlowLayer(
  prisma: AdvancedDbClient,
  options: AdvancedScoringOptions = {},
) {
  const scope = [
    options.themeRef ?? "all-active",
    options.ticker ? options.ticker.trim().toUpperCase() : undefined,
  ]
    .filter(Boolean)
    .join(":");
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "OWNERSHIP_FLOW_SCORE",
      scopeId: scope,
      scopeType: "t5_ownership_flow",
      status: "STARTED",
    },
  });
  let lockKey: string | undefined;
  const summaries = new Map<string, AdvancedThemeSummary>();
  const warnings: AdvancedWarning[] = [];
  let rowsRead = 0;
  let rowsWritten = 0;
  let evidenceWritten = 0;
  let candidatesScored = 0;

  try {
    lockKey = await acquireLock(
      prisma,
      jobRun.jobRunId,
      `t5_ownership_flow:${scope}`,
    );
    const candidates = await loadCandidatesForAdvanced(prisma, options);
    rowsRead = candidates.length;

    for (const candidate of candidates) {
      const result = scoreOwnershipFlow(ownershipInput(candidate));
      const persisted = await persistOwnershipFlow(
        prisma,
        candidate,
        jobRun.jobRunId,
        result,
      );
      const summary = themeSummary(summaries, candidate);
      summary.flowScored += 1;

      if (
        result.flowState === "ETF_FLOW_ELIGIBLE" ||
        result.flowState === "BROADENING_OWNERSHIP" ||
        result.flowState === "INSTITUTIONAL_ACCUMULATION"
      ) {
        summary.flowWithAccess += 1;
      }

      if (result.reasonCodes.includes("DATA_MISSING")) {
        warnings.push({
          code: "FLOW_DATA_MISSING",
          message: "No current ownership or ETF-flow context was available.",
          severity: "CAUTION",
          themeCode: candidate.theme.sourceThemeCode ?? undefined,
          ticker: candidate.security.canonicalTicker,
        });
      }

      candidatesScored += 1;
      evidenceWritten += persisted.evidenceWritten;
      rowsWritten += persisted.rowsWritten;
    }

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length > 0 ? `${warnings.length} warnings` : undefined,
        finishedAt: new Date(),
        rowsRead,
        rowsWritten,
        status: warnings.length > 0 ? "PARTIAL" : "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    return {
      candidatesScored,
      evidenceWritten,
      jobRunId: jobRun.jobRunId,
      rowsRead,
      rowsWritten,
      themes: [...summaries.values()],
      warnings,
    };
  } catch (error) {
    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(
          error instanceof Error ? error.message : String(error),
        ),
        finishedAt: new Date(),
        rowsRead,
        rowsWritten,
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

export async function scoreBaseRateLayer(
  prisma: AdvancedDbClient,
  options: AdvancedScoringOptions = {},
) {
  const scope = [
    options.themeRef ?? "all-active",
    options.ticker ? options.ticker.trim().toUpperCase() : undefined,
  ]
    .filter(Boolean)
    .join(":");
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "BASE_RATE_SCORE",
      scopeId: scope,
      scopeType: "t7_base_rate",
      status: "STARTED",
    },
  });
  let lockKey: string | undefined;
  const summaries = new Map<string, AdvancedThemeSummary>();
  const warnings: AdvancedWarning[] = [];
  let rowsRead = 0;
  let rowsWritten = 0;
  let evidenceWritten = 0;
  let candidatesScored = 0;

  try {
    lockKey = await acquireLock(
      prisma,
      jobRun.jobRunId,
      `t7_base_rate:${scope}`,
    );
    const candidates = await loadCandidatesForAdvanced(prisma, options);
    rowsRead = candidates.length;

    for (const candidate of candidates) {
      const bars = await loadPriceBars(prisma, candidate.securityId);
      rowsRead += bars.length;
      const result = scoreBaseRate(bars);
      const persisted = await persistBaseRate(
        prisma,
        candidate,
        jobRun.jobRunId,
        result,
      );
      const summary = themeSummary(summaries, candidate);
      summary.baseRateScored += 1;

      if (result.baseRateState === "LOW_SAMPLE_WARNING") {
        summary.baseRateLowSample += 1;
        warnings.push({
          code: "BASE_RATE_LOW_SAMPLE_WARNING",
          message:
            "Historical base-rate sample is below the minimum threshold.",
          severity: "CAUTION",
          themeCode: candidate.theme.sourceThemeCode ?? undefined,
          ticker: candidate.security.canonicalTicker,
        });
      }

      candidatesScored += 1;
      evidenceWritten += persisted.evidenceWritten;
      rowsWritten += persisted.rowsWritten;
    }

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length > 0 ? `${warnings.length} warnings` : undefined,
        finishedAt: new Date(),
        rowsRead,
        rowsWritten,
        status: warnings.length > 0 ? "PARTIAL" : "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    return {
      candidatesScored,
      evidenceWritten,
      jobRunId: jobRun.jobRunId,
      rowsRead,
      rowsWritten,
      themes: [...summaries.values()],
      warnings,
    };
  } catch (error) {
    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(
          error instanceof Error ? error.message : String(error),
        ),
        finishedAt: new Date(),
        rowsRead,
        rowsWritten,
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

export async function scoreAdvancedLayers(
  prisma: AdvancedDbClient,
  options: AdvancedScoringOptions = {},
): Promise<AdvancedScoringSummary> {
  const flow = await scoreOwnershipFlowLayer(prisma, options);
  const baseRate = await scoreBaseRateLayer(prisma, options);
  const themeMap = new Map<string, AdvancedThemeSummary>();

  for (const summary of [...flow.themes, ...baseRate.themes]) {
    const existing = themeMap.get(summary.themeId);

    if (!existing) {
      themeMap.set(summary.themeId, { ...summary });
      continue;
    }

    existing.baseRateLowSample += summary.baseRateLowSample;
    existing.baseRateScored += summary.baseRateScored;
    existing.flowScored += summary.flowScored;
    existing.flowWithAccess += summary.flowWithAccess;
  }

  return {
    baseRateEvidenceWritten: baseRate.evidenceWritten,
    baseRateJobRunId: baseRate.jobRunId,
    baseRateRowsWritten: baseRate.rowsWritten,
    baseRateScored: baseRate.candidatesScored,
    flowEvidenceWritten: flow.evidenceWritten,
    flowJobRunId: flow.jobRunId,
    flowRowsWritten: flow.rowsWritten,
    flowScored: flow.candidatesScored,
    providerCalls: 0,
    rowsRead: flow.rowsRead + baseRate.rowsRead,
    themes: [...themeMap.values()],
    warnings: [...flow.warnings, ...baseRate.warnings],
  };
}
