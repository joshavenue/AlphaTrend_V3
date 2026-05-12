import type { Prisma } from "@/generated/prisma/client";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import {
  T8_EXPRESSION_SCORE_VERSION,
  T8_REASON_CODES,
  T8_SIGNAL_LAYER,
} from "@/lib/expression/constants";
import {
  assertNoAdviceLanguage,
  calculateReviewPriorityScore,
  calculateThemeDispersionRisk,
  scoreExpressionDecision,
} from "@/lib/expression/scoring";
import type {
  ExpressionCandidateForDispersion,
  ExpressionCandidateInput,
  ExpressionDbClient,
  ExpressionDecisionResult,
  ExpressionScoringOptions,
  ExpressionScoringSummary,
  ExpressionThemeSummary,
  ThemeDispersionRiskDetail,
} from "@/lib/expression/types";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
import { T3_SIGNAL_LAYER } from "@/lib/fundamentals/constants";
import { T6_SIGNAL_LAYER } from "@/lib/liquidity/constants";
import type { LiquidityScoreDetail } from "@/lib/liquidity/types";
import { T4_SIGNAL_LAYER } from "@/lib/price/constants";
import type { PriceScoreDetail } from "@/lib/price/types";
import { isUuid } from "@/lib/util/uuid";

const LOCK_TTL_MS = 30 * 60 * 1_000;
const ACTIVE_THEME_STATUSES = [
  "ACTIVE_UNSCANNED",
  "ACTIVE_SCANNED",
  "ACTIVE",
] as const;
const REQUIRED_SIGNAL_LAYERS = [
  T1_SIGNAL_LAYER,
  T3_SIGNAL_LAYER,
  T4_SIGNAL_LAYER,
  T6_SIGNAL_LAYER,
] as const;

type CandidateForExpression = Awaited<
  ReturnType<typeof loadCandidatesForExpression>
>[number];

type ParsedEvidenceDetail = PriceScoreDetail | LiquidityScoreDetail;

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

function evidenceIdsFromJson(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "string" && entry.length > 0 ? [entry] : [],
  );
}

function reasonCodesFromJson(value: unknown) {
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

function latestScore(
  candidate: CandidateForExpression,
  signalLayer: (typeof REQUIRED_SIGNAL_LAYERS)[number],
) {
  return candidate.signalScores.find(
    (score) => score.signalLayer === signalLayer,
  );
}

function latestState(
  candidate: CandidateForExpression,
  signalLayer: (typeof REQUIRED_SIGNAL_LAYERS)[number],
) {
  return candidate.signalStates.find(
    (state) => state.signalLayer === signalLayer,
  );
}

function seedEtfCount(seedEtfs: unknown) {
  return Array.isArray(seedEtfs) ? seedEtfs.length : 0;
}

async function loadCandidatesForExpression(
  prisma: ExpressionDbClient,
  options: ExpressionScoringOptions,
) {
  const candidates = await prisma.themeCandidate.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          exchange: true,
          securityId: true,
          universeBucket: true,
        },
      },
      signalScores: {
        orderBy: {
          computedAt: "desc",
        },
        take: 20,
        where: {
          signalLayer: {
            in: [...REQUIRED_SIGNAL_LAYERS],
          },
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        take: 20,
        where: {
          signalLayer: {
            in: [...REQUIRED_SIGNAL_LAYERS],
          },
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
        : "No active-theme candidates found for expression scoring.",
    );
  }

  return candidates;
}

async function acquireLock(
  prisma: ExpressionDbClient,
  jobRunId: string,
  scope: string,
) {
  const lockKey = `t8_expression:${scope}`;
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
        ownerId: "expression-scoring-cli",
      },
    });
  } catch {
    throw new Error(`T8 expression scoring is already running for ${scope}.`);
  }

  return lockKey;
}

async function releaseLock(
  prisma: ExpressionDbClient,
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

async function loadDetailEvidence(
  prisma: ExpressionDbClient,
  candidates: CandidateForExpression[],
) {
  const evidenceIds = candidates.flatMap((candidate) =>
    candidate.signalScores.flatMap((score) =>
      evidenceIdsFromJson(score.evidenceIds).filter(isUuid),
    ),
  );

  if (evidenceIds.length === 0) {
    return new Map<string, ParsedEvidenceDetail>();
  }

  const rows = await prisma.evidenceLedger.findMany({
    select: {
      evidenceId: true,
      metricName: true,
      metricValueText: true,
    },
    where: {
      evidenceId: {
        in: [...new Set(evidenceIds)],
      },
      metricName: {
        in: ["t4.price_score_detail", "t6.liquidity_fragility_score_detail"],
      },
    },
  });
  const detailByEvidenceId = new Map<string, ParsedEvidenceDetail>();

  for (const row of rows) {
    if (!row.metricValueText) {
      continue;
    }

    try {
      detailByEvidenceId.set(
        row.evidenceId,
        JSON.parse(row.metricValueText) as ParsedEvidenceDetail,
      );
    } catch {
      // Historical evidence previews should not block T8; the missing detail
      // will be represented through DATA_MISSING in the decision layer.
    }
  }

  return detailByEvidenceId;
}

function detailForSignal<T extends ParsedEvidenceDetail>(
  score:
    | {
        evidenceIds: unknown;
      }
    | undefined,
  detailByEvidenceId: Map<string, ParsedEvidenceDetail>,
  predicate: (detail: ParsedEvidenceDetail) => detail is T,
) {
  for (const evidenceId of evidenceIdsFromJson(score?.evidenceIds)) {
    const detail = detailByEvidenceId.get(evidenceId);

    if (detail && predicate(detail)) {
      return detail;
    }
  }

  return undefined;
}

function isPriceDetail(
  detail: ParsedEvidenceDetail,
): detail is PriceScoreDetail {
  return "price_state" in detail;
}

function isLiquidityDetail(
  detail: ParsedEvidenceDetail,
): detail is LiquidityScoreDetail {
  return "liquidity_state" in detail;
}

function signalSnapshot(
  candidate: CandidateForExpression,
  signalLayer: (typeof REQUIRED_SIGNAL_LAYERS)[number],
) {
  const score = latestScore(candidate, signalLayer);
  const state = latestState(candidate, signalLayer);

  return {
    evidenceIds: [
      ...new Set([
        ...evidenceIdsFromJson(score?.evidenceIds),
        ...evidenceIdsFromJson(state?.evidenceIds),
      ]),
    ],
    reasonCodes: [
      ...new Set([
        ...reasonCodesFromJson(score?.reasonCodes),
        ...reasonCodesFromJson(state?.reasonCodes),
      ]),
    ],
    score: decimalNumber(score?.score),
    state: state?.state,
  };
}

function candidateInput(
  candidate: CandidateForExpression,
  detailByEvidenceId: Map<string, ParsedEvidenceDetail>,
): ExpressionCandidateInput {
  const t4Score = latestScore(candidate, T4_SIGNAL_LAYER);
  const t6Score = latestScore(candidate, T6_SIGNAL_LAYER);

  return {
    beneficiaryType: candidate.beneficiaryType,
    candidateStatus: candidate.candidateStatus,
    priceDetail: detailForSignal(t4Score, detailByEvidenceId, isPriceDetail),
    securityId: candidate.securityId,
    sourceOfInclusion: candidate.sourceOfInclusion,
    t1: signalSnapshot(candidate, T1_SIGNAL_LAYER),
    t3: signalSnapshot(candidate, T3_SIGNAL_LAYER),
    t4: signalSnapshot(candidate, T4_SIGNAL_LAYER),
    t6: signalSnapshot(candidate, T6_SIGNAL_LAYER),
    t6Detail: detailForSignal(t6Score, detailByEvidenceId, isLiquidityDetail),
    themeCandidateId: candidate.themeCandidateId,
    ticker: candidate.security.canonicalTicker,
  };
}

function warning(input: ExpressionScoringSummary["warnings"][number]) {
  return input;
}

function warningForDecision(
  candidate: CandidateForExpression,
  decision: ExpressionDecisionResult,
) {
  if (decision.finalState !== "INSUFFICIENT_DATA") {
    return undefined;
  }

  return warning({
    code: T8_REASON_CODES.DECISION_INSUFFICIENT_DATA,
    message: `${candidate.security.canonicalTicker} cannot receive a final expression because required prior signals are missing.`,
    severity: "WARNING",
    themeCode: candidate.theme.sourceThemeCode ?? undefined,
    ticker: candidate.security.canonicalTicker,
  });
}

async function persistDecision(
  prisma: ExpressionDbClient,
  candidate: CandidateForExpression,
  jobRunId: string,
  decision: ExpressionDecisionResult,
) {
  const now = new Date();
  const detailEvidence = await insertEvidence(prisma, {
    endpoint: "t8_expression_decision",
    entityId: candidate.themeCandidateId,
    entityType: "theme_candidate",
    evidenceGrade: "B",
    fetchedAt: now,
    jobRunId,
    metricName: "t8.expression_decision_detail",
    metricValueNum: decision.reviewPriorityScore,
    metricValueText: JSON.stringify(decision.detail),
    provider: "ALPHATREND_INTERNAL",
    reasonCode: decision.primaryReasonCode,
    securityId: candidate.securityId,
    sourcePayloadHash: hashPayload({
      candidate: candidate.themeCandidateId,
      detail: decision.detail,
      scoreVersion: T8_EXPRESSION_SCORE_VERSION,
    }),
    sourceUrlOrEndpoint: "alphatrend://t8_expression_decision",
    themeId: candidate.themeId,
  });
  const evidenceIds = [
    ...new Set([detailEvidence.evidenceId, ...decision.evidenceIds]),
  ];
  const reasonCodes = toJsonValue(decision.detail.reason_codes);

  await prisma.candidateSignalScore.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      maxScore: 100,
      reasonCodes,
      score: decision.reviewPriorityScore,
      scoreVersion: T8_EXPRESSION_SCORE_VERSION,
      signalLayer: T8_SIGNAL_LAYER,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.candidateSignalState.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      reasonCodes,
      signalLayer: T8_SIGNAL_LAYER,
      state: decision.finalState,
      stateVersion: T8_EXPRESSION_SCORE_VERSION,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.themeCandidate.update({
    data: {
      candidateStatus: decision.candidateStatus,
      dashboardVisible: decision.dashboardVisible,
      displayGroup: decision.detail.display_group,
      finalState: decision.finalState,
      lastScannedAt: now,
      rejectionReasonCodes: toJsonValue(decision.rejectionReasonCodes),
      tickerReviewPriorityScore: decision.reviewPriorityScore,
      topFailReason: decision.topFailReason,
      topPassReason: decision.topPassReason,
    },
    where: {
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.jobItem.create({
    data: {
      finishedAt: now,
      itemId: `${candidate.theme.sourceThemeCode ?? candidate.themeId}:${candidate.security.canonicalTicker}`,
      itemType: "T8_EXPRESSION_DECISION",
      jobRunId,
      startedAt: now,
      status: "SUCCEEDED",
    },
  });

  return 5;
}

function emptyThemeSummary(
  candidate: CandidateForExpression,
  dispersion: ThemeDispersionRiskDetail,
): ExpressionThemeSummary {
  return {
    basketPreferred: 0,
    candidatesScored: 0,
    delayedCatchUp: 0,
    etfPreferred: 0,
    insufficientData: 0,
    leaderButExtended: 0,
    noTrade: 0,
    nonParticipant: 0,
    rejected: 0,
    singleStockResearchJustified: 0,
    sourceThemeCode: candidate.theme.sourceThemeCode ?? candidate.theme.themeId,
    themeDispersionRiskScore: dispersion.total_score,
    themeDispersionRiskState: dispersion.state,
    themeId: candidate.theme.themeId,
    themeName: candidate.theme.themeName,
    watchlistOnly: 0,
    wrongTicker: 0,
  };
}

function updateThemeSummary(
  summary: ExpressionThemeSummary,
  decision: ExpressionDecisionResult,
) {
  summary.candidatesScored += 1;

  if (decision.finalState === "SINGLE_STOCK_RESEARCH_JUSTIFIED") {
    summary.singleStockResearchJustified += 1;
  } else if (decision.finalState === "BASKET_PREFERRED") {
    summary.basketPreferred += 1;
  } else if (decision.finalState === "ETF_PREFERRED") {
    summary.etfPreferred += 1;
  } else if (decision.finalState === "WATCHLIST_ONLY") {
    summary.watchlistOnly += 1;
  } else if (decision.finalState === "LEADER_BUT_EXTENDED") {
    summary.leaderButExtended += 1;
  } else if (decision.finalState === "DELAYED_CATCH_UP_CANDIDATE") {
    summary.delayedCatchUp += 1;
  } else if (decision.finalState === "NON_PARTICIPANT") {
    summary.nonParticipant += 1;
  } else if (decision.finalState === "WRONG_TICKER") {
    summary.wrongTicker += 1;
  } else if (decision.finalState === "NO_TRADE") {
    summary.noTrade += 1;
  } else if (decision.finalState === "INSUFFICIENT_DATA") {
    summary.insufficientData += 1;
  } else {
    summary.rejected += 1;
  }
}

function groupByTheme(
  candidates: CandidateForExpression[],
  detailByEvidenceId: Map<string, ParsedEvidenceDetail>,
) {
  const grouped = new Map<
    string,
    Array<{
      candidate: CandidateForExpression;
      input: ExpressionCandidateInput;
    }>
  >();

  for (const candidate of candidates) {
    const input = candidateInput(candidate, detailByEvidenceId);
    const group = grouped.get(candidate.themeId) ?? [];
    group.push({
      candidate,
      input,
    });
    grouped.set(candidate.themeId, group);
  }

  return grouped;
}

export async function scoreThemeExpressions(
  prisma: ExpressionDbClient,
  options: ExpressionScoringOptions = {},
): Promise<ExpressionScoringSummary> {
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
      scopeType: "t8_expression_decision",
      status: "STARTED",
    },
  });
  const lockKey = await acquireLock(prisma, jobRun.jobRunId, scope);
  const warnings: ExpressionScoringSummary["warnings"] = [];
  const themeSummaries = new Map<string, ExpressionThemeSummary>();
  let evidenceWritten = 0;
  let rowsWritten = 0;

  try {
    const candidates = await loadCandidatesForExpression(prisma, options);
    const detailByEvidenceId = await loadDetailEvidence(prisma, candidates);
    const grouped = groupByTheme(candidates, detailByEvidenceId);

    for (const group of grouped.values()) {
      const dispersionInputs: ExpressionCandidateForDispersion[] = group.map(
        ({ input }) => ({
          ...input,
          provisionalPriorityScore: calculateReviewPriorityScore(input),
        }),
      );
      const dispersion = calculateThemeDispersionRisk(dispersionInputs, {
        seedEtfCount: seedEtfCount(group[0]?.candidate.theme.seedEtfs),
      });

      for (const { candidate, input } of group) {
        const decision = scoreExpressionDecision(input, dispersion);
        assertNoAdviceLanguage(decision);

        rowsWritten += await persistDecision(
          prisma,
          candidate,
          jobRun.jobRunId,
          decision,
        );
        evidenceWritten += 1;

        const decisionWarning = warningForDecision(candidate, decision);

        if (decisionWarning) {
          warnings.push(decisionWarning);
        }

        const summary =
          themeSummaries.get(candidate.themeId) ??
          emptyThemeSummary(candidate, dispersion);

        updateThemeSummary(summary, decision);
        themeSummaries.set(candidate.themeId, summary);
      }
    }

    const summary: ExpressionScoringSummary = {
      candidatesScored: candidates.length,
      evidenceWritten,
      jobRunId: jobRun.jobRunId,
      rowsRead: candidates.length + detailByEvidenceId.size,
      rowsWritten,
      themes: [...themeSummaries.values()],
      warnings,
    };

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length === 0
            ? undefined
            : `${warnings.length} expression decision warning(s); see command output.`,
        finishedAt: new Date(),
        providerCalls: 0,
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
