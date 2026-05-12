import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
import { T3_SIGNAL_LAYER } from "@/lib/fundamentals/constants";
import { T6_SIGNAL_LAYER } from "@/lib/liquidity/constants";
import { T4_SIGNAL_LAYER } from "@/lib/price/constants";
import {
  ACTIVE_THEME_STATUSES,
  SNAPSHOT_LOCK_TTL_MS,
  SNAPSHOT_REASON_CODES,
  T11_SNAPSHOT_DETAIL_METRIC,
  T11_SNAPSHOT_VERSION,
  T8_EXPRESSION_DETAIL_METRIC,
} from "@/lib/snapshots/constants";
import {
  buildSnapshotDetail,
  computeThemeSnapshot,
} from "@/lib/snapshots/scoring";
import type {
  SnapshotBuildOptions,
  SnapshotBuildSummary,
  SnapshotCandidateInput,
  SnapshotDbClient,
  SnapshotEvidenceInput,
  SnapshotSignal,
  SnapshotThemeInput,
  SnapshotThemeSummary,
  SnapshotWarning,
  ThemeSnapshotDetail,
} from "@/lib/snapshots/types";
import { toJsonValue } from "@/lib/snapshots/types";
import { T8_SIGNAL_LAYER } from "@/lib/expression/constants";
import type { ExpressionDecisionDetail } from "@/lib/expression/types";
import { isUuid } from "@/lib/util/uuid";

const SIGNAL_LAYERS = [
  T1_SIGNAL_LAYER,
  T3_SIGNAL_LAYER,
  T4_SIGNAL_LAYER,
  T6_SIGNAL_LAYER,
  T8_SIGNAL_LAYER,
] as const;

type ThemeForSnapshot = Awaited<
  ReturnType<typeof loadThemesForSnapshots>
>[number];
type CandidateForSnapshot = ThemeForSnapshot["candidates"][number];

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

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "string" && entry.length > 0 ? [entry] : [],
  );
}

function decimalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}

function snapshotDate(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function scopeFromOptions(options: SnapshotBuildOptions) {
  return options.themeRef ?? "all-active";
}

async function acquireLock(
  prisma: SnapshotDbClient,
  jobRunId: string,
  scope: string,
) {
  const lockKey = `theme_snapshot:${scope}`;
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
        expiresAt: new Date(now.getTime() + SNAPSHOT_LOCK_TTL_MS),
        jobRunId,
        lockKey,
        ownerId: "snapshot-builder-cli",
      },
    });
  } catch {
    throw new Error(`Theme snapshot build is already running for ${scope}.`);
  }

  return lockKey;
}

async function releaseLock(
  prisma: SnapshotDbClient,
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

async function loadThemesForSnapshots(
  prisma: SnapshotDbClient,
  options: SnapshotBuildOptions,
) {
  return prisma.themeDefinition.findMany({
    include: {
      candidates: {
        include: {
          security: {
            select: {
              canonicalTicker: true,
              companyName: true,
              securityId: true,
            },
          },
          signalScores: {
            orderBy: {
              computedAt: "desc",
            },
            where: {
              signalLayer: {
                in: [...SIGNAL_LAYERS],
              },
            },
          },
          signalStates: {
            orderBy: {
              computedAt: "desc",
            },
            where: {
              signalLayer: {
                in: [...SIGNAL_LAYERS],
              },
            },
          },
        },
        orderBy: [
          {
            tickerReviewPriorityScore: "desc",
          },
          {
            security: {
              canonicalTicker: "asc",
            },
          },
        ],
      },
      snapshots: {
        orderBy: [
          {
            snapshotDate: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 1,
      },
    },
    orderBy: [
      {
        sourceThemeCode: "asc",
      },
      {
        themeName: "asc",
      },
    ],
    where: themeWhere(options.themeRef),
  });
}

function latestScore(
  candidate: CandidateForSnapshot,
  signalLayer: (typeof SIGNAL_LAYERS)[number],
) {
  return candidate.signalScores.find(
    (score) => score.signalLayer === signalLayer,
  );
}

function latestState(
  candidate: CandidateForSnapshot,
  signalLayer: (typeof SIGNAL_LAYERS)[number],
) {
  return candidate.signalStates.find(
    (state) => state.signalLayer === signalLayer,
  );
}

function latestSignal(
  candidate: CandidateForSnapshot,
  signalLayer: (typeof SIGNAL_LAYERS)[number],
): SnapshotSignal | undefined {
  const score = latestScore(candidate, signalLayer);
  const state = latestState(candidate, signalLayer);

  if (!score && !state) {
    return undefined;
  }

  return {
    computedAt: score?.computedAt ?? state?.computedAt,
    evidenceIds: [
      ...new Set([
        ...stringArray(score?.evidenceIds),
        ...stringArray(state?.evidenceIds),
      ]),
    ],
    reasonCodes: [
      ...new Set([
        ...stringArray(score?.reasonCodes),
        ...stringArray(state?.reasonCodes),
      ]),
    ],
    score: decimalNumber(score?.score),
    state: state?.state,
  };
}

function candidateEvidenceIds(candidate: CandidateForSnapshot) {
  return [
    ...new Set(
      candidate.signalScores.flatMap((score) =>
        stringArray(score.evidenceIds).filter(isUuid),
      ),
    ),
  ];
}

function decisionDetail(source: unknown) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  return source as ExpressionDecisionDetail;
}

async function loadEvidenceRows(
  prisma: SnapshotDbClient,
  themes: ThemeForSnapshot[],
) {
  const themeIds = themes.map((theme) => theme.themeId);

  if (themeIds.length === 0) {
    return [];
  }

  return prisma.evidenceLedger.findMany({
    orderBy: {
      fetchedAt: "desc",
    },
    select: {
      evidenceGrade: true,
      evidenceId: true,
      fetchedAt: true,
      freshnessScore: true,
      metricName: true,
      metricValueText: true,
      reasonCode: true,
      themeId: true,
    },
    where: {
      themeId: {
        in: themeIds,
      },
    },
  });
}

function evidenceInput(
  row: Awaited<ReturnType<typeof loadEvidenceRows>>[number],
) {
  return {
    evidenceGrade: row.evidenceGrade,
    fetchedAt: row.fetchedAt,
    freshnessScore: decimalNumber(row.freshnessScore),
    metricName: row.metricName,
    reasonCode: row.reasonCode,
  } satisfies SnapshotEvidenceInput;
}

function buildT8DetailByEvidenceId(
  evidenceRows: Awaited<ReturnType<typeof loadEvidenceRows>>,
) {
  const detailByEvidenceId = new Map<string, ExpressionDecisionDetail>();

  for (const row of evidenceRows) {
    if (
      row.metricName !== T8_EXPRESSION_DETAIL_METRIC ||
      !row.metricValueText
    ) {
      continue;
    }

    try {
      const detail = decisionDetail(JSON.parse(row.metricValueText));

      if (detail) {
        detailByEvidenceId.set(row.evidenceId, detail);
      }
    } catch {
      // Ignore malformed historical detail previews; snapshots remain buildable.
    }
  }

  return detailByEvidenceId;
}

function candidateInput(
  candidate: CandidateForSnapshot,
  detailByEvidenceId: Map<string, ExpressionDecisionDetail>,
): SnapshotCandidateInput {
  const t8 = latestSignal(candidate, T8_SIGNAL_LAYER);
  const t8Detail = t8?.evidenceIds
    .map((evidenceId) => detailByEvidenceId.get(evidenceId))
    .find(Boolean);

  return {
    beneficiaryType: candidate.beneficiaryType,
    candidateStatus: candidate.candidateStatus,
    companyName: candidate.security.companyName,
    dashboardVisible: candidate.dashboardVisible,
    displayGroup: candidate.displayGroup,
    finalState: candidate.finalState,
    lastScannedAt: candidate.lastScannedAt,
    rejectionReasonCodes: stringArray(candidate.rejectionReasonCodes),
    reviewPriorityScore: decimalNumber(candidate.tickerReviewPriorityScore),
    securityId: candidate.securityId,
    t1: latestSignal(candidate, T1_SIGNAL_LAYER),
    t3: latestSignal(candidate, T3_SIGNAL_LAYER),
    t4: latestSignal(candidate, T4_SIGNAL_LAYER),
    t6: latestSignal(candidate, T6_SIGNAL_LAYER),
    t8,
    t8Detail,
    ticker: candidate.security.canonicalTicker,
    topFailReason: candidate.topFailReason,
    topPassReason: candidate.topPassReason,
  };
}

function snapshotThemeInput(theme: ThemeForSnapshot): SnapshotThemeInput {
  const previous = theme.snapshots[0];

  return {
    directBeneficiaryCategories: theme.directBeneficiaryCategories,
    economicMechanism: theme.economicMechanism,
    excludedCategories: theme.excludedCategories,
    invalidationRules: theme.invalidationRules,
    previousDashboardState: previous?.dashboardState,
    previousThemeRealityScore: decimalNumber(previous?.themeRealityScore),
    requiredEconomicProof: theme.requiredEconomicProof,
    seedEtfs: theme.seedEtfs,
    sourceThemeCode: theme.sourceThemeCode,
    status: theme.status,
    themeId: theme.themeId,
    themeName: theme.themeName,
    themeSlug: theme.themeSlug,
  };
}

function warningsForTheme(
  theme: ThemeForSnapshot,
  candidates: SnapshotCandidateInput[],
): SnapshotWarning[] {
  const warnings: SnapshotWarning[] = [];

  if (candidates.length === 0) {
    warnings.push({
      code: SNAPSHOT_REASON_CODES.DEMAND_PROVIDER_DATA_GAP,
      message: `${theme.sourceThemeCode ?? theme.themeSlug} has no candidates to aggregate.`,
      severity: "WARNING",
      themeCode: theme.sourceThemeCode ?? undefined,
    });
  }

  const missingT8 = candidates.filter((candidate) => !candidate.t8).length;

  if (missingT8 > 0) {
    warnings.push({
      code: SNAPSHOT_REASON_CODES.DECISION_INSUFFICIENT_DATA,
      message: `${theme.sourceThemeCode ?? theme.themeSlug} has ${missingT8} candidate(s) without a latest T8 expression decision.`,
      severity: "WARNING",
      themeCode: theme.sourceThemeCode ?? undefined,
    });
  }

  return warnings;
}

async function persistSnapshot(input: {
  computation: ReturnType<typeof computeThemeSnapshot>;
  detail: ThemeSnapshotDetail;
  jobRunId: string;
  prisma: SnapshotDbClient;
  snapshotDate: Date;
  theme: ThemeForSnapshot;
}) {
  const payloadHash = hashPayload({
    detail: input.detail,
    snapshotVersion: T11_SNAPSHOT_VERSION,
    themeId: input.theme.themeId,
  });
  await insertEvidence(input.prisma, {
    endpoint: "theme_snapshot_builder",
    entityId: input.theme.themeId,
    entityType: "theme_definition",
    evidenceGrade: "B",
    fetchedAt: new Date(),
    jobRunId: input.jobRunId,
    metricName: T11_SNAPSHOT_DETAIL_METRIC,
    metricValueNum: input.computation.reviewPriorityScore,
    metricValueText: JSON.stringify(input.detail),
    provider: "ALPHATREND_INTERNAL",
    reasonCode:
      input.computation.highlightReasonCodes[0] ??
      input.computation.cautionReasonCodes[0] ??
      SNAPSHOT_REASON_CODES.DEMAND_PROVIDER_DATA_GAP,
    sourcePayloadHash: payloadHash,
    sourceUrlOrEndpoint: "alphatrend://theme_snapshot_builder",
    themeId: input.theme.themeId,
  });
  const snapshot = await input.prisma.themeSnapshot.create({
    data: {
      basketPreferred: input.computation.basketPreferred,
      cautionReasonCodes: toJsonValue(input.computation.cautionReasonCodes),
      dashboardState: input.computation.dashboardState,
      dataQualityScore: input.computation.dataQualityScore,
      delayedCatchupCount: input.computation.delayedCatchupCount,
      directBeneficiaryCount: input.computation.directBeneficiaryCount,
      etfPreferred: input.computation.etfPreferred,
      highlightReasonCodes: toJsonValue(input.computation.highlightReasonCodes),
      investableCandidateCount: input.computation.investableCandidateCount,
      jobRunId: input.jobRunId,
      lastScannedAt: input.computation.lastScannedAt,
      leaderButExtendedCount: input.computation.leaderButExtendedCount,
      leaderCount: input.computation.leaderCount,
      noTradeCount: input.computation.noTradeCount,
      snapshotDate: input.snapshotDate,
      themeId: input.theme.themeId,
      themeRealityScore: input.computation.themeReality.final_score,
      themeReviewPriorityScore: input.computation.reviewPriorityScore,
      topDirectBeneficiaries: toJsonValue(
        input.computation.topDirectBeneficiaries,
      ),
      topRejectedTickers: toJsonValue(input.computation.topRejectedTickers),
      watchlistOnlyCount: input.computation.watchlistOnlyCount,
      wrongTickerCount: input.computation.wrongTickerCount,
    },
  });

  await input.prisma.jobItem.create({
    data: {
      finishedAt: new Date(),
      itemId: snapshot.themeSnapshotId,
      itemType: "THEME_SNAPSHOT",
      jobRunId: input.jobRunId,
      startedAt: new Date(),
      status: "SUCCEEDED",
    },
  });

  return snapshot;
}

function themeSummary(
  theme: ThemeForSnapshot,
  snapshotId: string,
  computation: ReturnType<typeof computeThemeSnapshot>,
): SnapshotThemeSummary {
  return {
    dashboardState: computation.dashboardState,
    directBeneficiaryCount: computation.directBeneficiaryCount,
    investableCandidateCount: computation.investableCandidateCount,
    noTradeCount: computation.noTradeCount,
    reviewPriorityScore: computation.reviewPriorityScore,
    snapshotId,
    sourceThemeCode: theme.sourceThemeCode,
    themeId: theme.themeId,
    themeName: theme.themeName,
    themeRealityScore: computation.themeReality.final_score,
    wrongTickerCount: computation.wrongTickerCount,
  };
}

export async function buildThemeSnapshots(
  prisma: SnapshotDbClient,
  options: SnapshotBuildOptions = {},
): Promise<SnapshotBuildSummary> {
  const scope = scopeFromOptions(options);
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "THEME_SNAPSHOT",
      scopeId: scope,
      scopeType: "theme_snapshot",
      status: "STARTED",
    },
  });
  let lockKey: string | undefined;
  let evidenceWritten = 0;
  let rowsWritten = 0;

  try {
    lockKey = await acquireLock(prisma, jobRun.jobRunId, scope);

    const themes = await loadThemesForSnapshots(prisma, options);

    if (themes.length === 0) {
      throw new Error(
        options.themeRef
          ? `No theme found for ${options.themeRef}.`
          : "No active themes found for snapshot build.",
      );
    }

    const evidenceRows = await loadEvidenceRows(prisma, themes);
    const evidenceByTheme = new Map<string, SnapshotEvidenceInput[]>();

    for (const row of evidenceRows) {
      const rows = evidenceByTheme.get(row.themeId ?? "") ?? [];
      rows.push(evidenceInput(row));
      evidenceByTheme.set(row.themeId ?? "", rows);
    }

    const detailByEvidenceId = buildT8DetailByEvidenceId(evidenceRows);
    const warnings: SnapshotWarning[] = [];
    const summaries: SnapshotThemeSummary[] = [];
    const date = snapshotDate();

    for (const theme of themes) {
      const candidates = theme.candidates.map((candidate) =>
        candidateInput(candidate, detailByEvidenceId),
      );
      const themeInput = snapshotThemeInput(theme);
      const computation = computeThemeSnapshot({
        candidates,
        evidenceRows: evidenceByTheme.get(theme.themeId) ?? [],
        theme: themeInput,
      });
      const detail = buildSnapshotDetail({
        candidates,
        computation,
        theme: themeInput,
      });
      const snapshot = await persistSnapshot({
        computation,
        detail,
        jobRunId: jobRun.jobRunId,
        prisma,
        snapshotDate: date,
        theme,
      });

      evidenceWritten += 1;
      rowsWritten += 3;
      warnings.push(...warningsForTheme(theme, candidates));
      summaries.push(
        themeSummary(theme, snapshot.themeSnapshotId, computation),
      );
    }

    const rowsRead =
      themes.length +
      themes.reduce((sum, theme) => sum + theme.candidates.length, 0) +
      evidenceRows.length;
    const summary: SnapshotBuildSummary = {
      evidenceWritten,
      jobRunId: jobRun.jobRunId,
      rowsRead,
      rowsWritten,
      snapshotsBuilt: summaries.length,
      themes: summaries,
      warnings,
    };

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length === 0
            ? undefined
            : `${warnings.length} snapshot warning(s); see command output.`,
        finishedAt: new Date(),
        providerCalls: 0,
        rowsRead,
        rowsWritten,
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
    if (lockKey) {
      await releaseLock(prisma, jobRun.jobRunId, lockKey);
    }
  }
}

export function _snapshotRunnerInternalsForTests() {
  return {
    candidateEvidenceIds,
    snapshotDate,
  };
}
