import type {
  AlertDeliveryStatus,
  AlertSeverity,
  FinalState,
  JobStatus,
  JobType,
  ProviderName,
  WatchlistStatus,
  WatchType,
} from "@/generated/prisma/client";
import {
  decodePageCursor,
  pageRows,
  type PaginationMeta,
} from "@/lib/api/pagination";
import { getPrismaClient } from "@/lib/db/prisma";
import { T8_SIGNAL_LAYER } from "@/lib/expression/constants";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
import { T3_SIGNAL_LAYER } from "@/lib/fundamentals/constants";
import { T6_SIGNAL_LAYER } from "@/lib/liquidity/constants";
import { T4_SIGNAL_LAYER } from "@/lib/price/constants";
import { isUuid } from "@/lib/util/uuid";

const SIGNAL_LAYERS = [
  T1_SIGNAL_LAYER,
  T3_SIGNAL_LAYER,
  T4_SIGNAL_LAYER,
  T6_SIGNAL_LAYER,
  T8_SIGNAL_LAYER,
] as const;

export function limited(value: number | undefined | null, fallback = 50) {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(200, Math.trunc(value)));
}

function decimalNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function dateIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function dateOnlyIso(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function cursorDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "string" && entry.length > 0 ? [entry] : [],
  );
}

function themeWhere(themeRef: string) {
  return {
    OR: [
      ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
      { sourceThemeCode: themeRef },
      { themeSlug: themeRef },
    ],
  };
}

function securityWhere(tickerOrId: string) {
  return {
    OR: [
      ...(isUuid(tickerOrId) ? [{ securityId: tickerOrId }] : []),
      { canonicalTicker: tickerOrId.toUpperCase() },
    ],
  };
}

function latestSignal<T extends { computedAt: Date; signalLayer: string }>(
  rows: T[],
  signalLayer: (typeof SIGNAL_LAYERS)[number],
) {
  return rows.find((row) => row.signalLayer === signalLayer);
}

function serializeSignal(input?: {
  computedAt: Date;
  evidenceIds: unknown;
  reasonCodes: unknown;
  score?: unknown;
  state?: string;
}) {
  if (!input) {
    return null;
  }

  return {
    computed_at: input.computedAt.toISOString(),
    evidence_ids: stringArray(input.evidenceIds),
    reason_codes: stringArray(input.reasonCodes),
    score: "score" in input ? decimalNumber(input.score) : null,
    state: input.state ?? null,
  };
}

function serializeCandidateReport(candidate: {
  beneficiaryType: string | null;
  candidateStatus: string;
  displayGroup: string | null;
  finalState: FinalState | null;
  lastScannedAt: Date | null;
  rejectionReasonCodes: unknown;
  signalScores: {
    computedAt: Date;
    evidenceIds: unknown;
    reasonCodes: unknown;
    score: unknown;
    signalLayer: string;
  }[];
  signalStates: {
    computedAt: Date;
    evidenceIds: unknown;
    reasonCodes: unknown;
    signalLayer: string;
    state: string;
  }[];
  sourceOfInclusion: string;
  themeCandidateId: string;
  tickerReviewPriorityScore: unknown;
  topFailReason: string | null;
  topPassReason: string | null;
}) {
  const latestScores = SIGNAL_LAYERS.map(
    (layer) => [layer, latestSignal(candidate.signalScores, layer)] as const,
  );
  const latestStates = SIGNAL_LAYERS.map(
    (layer) => [layer, latestSignal(candidate.signalStates, layer)] as const,
  );

  return {
    beneficiary_type: candidate.beneficiaryType,
    candidate_status: candidate.candidateStatus,
    display_group: candidate.displayGroup,
    final_state: candidate.finalState,
    last_scanned_at: dateIso(candidate.lastScannedAt),
    rejection_reason_codes: stringArray(candidate.rejectionReasonCodes),
    review_priority_score: decimalNumber(candidate.tickerReviewPriorityScore),
    signal_scores: Object.fromEntries(
      latestScores.map(([layer, score]) => [layer, serializeSignal(score)]),
    ),
    signal_states: Object.fromEntries(
      latestStates.map(([layer, state]) => [layer, serializeSignal(state)]),
    ),
    source_of_inclusion: candidate.sourceOfInclusion,
    theme_candidate_id: candidate.themeCandidateId,
    top_fail_reason: candidate.topFailReason,
    top_pass_reason: candidate.topPassReason,
  };
}

function serializeEvidence(row: {
  asOfDate: Date | null;
  createdAt: Date;
  endpoint: string | null;
  entityId: string | null;
  entityType: string | null;
  evidenceGrade: string | null;
  evidenceId: string;
  fetchedAt: Date;
  freshnessScore: unknown;
  jobRunId: string | null;
  metricName: string;
  metricUnit: string | null;
  metricValueNum: unknown;
  metricValueText: string | null;
  observedAt: Date | null;
  periodEnd: Date | null;
  periodStart: Date | null;
  provider: ProviderName;
  reasonCode: string | null;
  reliabilityScore: unknown;
  scoreImpact: unknown;
  security?: {
    canonicalTicker: string;
    companyName: string;
    securityId: string;
  } | null;
  securityId: string | null;
  sourcePayloadHash: string | null;
  sourceUrlOrEndpoint: string | null;
  theme?: {
    sourceThemeCode: string | null;
    themeId: string;
    themeName: string;
    themeSlug: string;
  } | null;
  themeId: string | null;
}) {
  return {
    as_of_date: dateOnlyIso(row.asOfDate),
    created_at: row.createdAt.toISOString(),
    endpoint: row.endpoint,
    entity_id: row.entityId,
    entity_type: row.entityType,
    evidence_grade: row.evidenceGrade,
    evidence_id: row.evidenceId,
    fetched_at: row.fetchedAt.toISOString(),
    freshness_score: decimalNumber(row.freshnessScore),
    job_run_id: row.jobRunId,
    metric_name: row.metricName,
    metric_unit: row.metricUnit,
    metric_value_num: decimalNumber(row.metricValueNum),
    metric_value_text: row.metricValueText,
    observed_at: dateIso(row.observedAt),
    period_end: dateOnlyIso(row.periodEnd),
    period_start: dateOnlyIso(row.periodStart),
    provider: row.provider,
    reason_code: row.reasonCode,
    reliability_score: decimalNumber(row.reliabilityScore),
    score_impact: decimalNumber(row.scoreImpact),
    security: row.security
      ? {
          company_name: row.security.companyName,
          security_id: row.security.securityId,
          ticker: row.security.canonicalTicker,
        }
      : null,
    security_id: row.securityId,
    source_payload_hash: row.sourcePayloadHash,
    source_url_or_endpoint: row.sourceUrlOrEndpoint,
    theme: row.theme
      ? {
          source_theme_code: row.theme.sourceThemeCode,
          theme_id: row.theme.themeId,
          theme_name: row.theme.themeName,
          theme_slug: row.theme.themeSlug,
        }
      : null,
    theme_id: row.themeId,
  };
}

type ReadPage<T> = {
  pagination: PaginationMeta;
  rows: T[];
};

export async function searchSecurities(query: string, limit = 8) {
  const q = query.trim();

  if (!q) {
    return [];
  }

  const rows = await getPrismaClient().security.findMany({
    orderBy: [
      {
        canonicalTicker: "asc",
      },
      {
        companyName: "asc",
      },
    ],
    select: {
      canonicalTicker: true,
      companyName: true,
      exchange: true,
      isAdr: true,
      isEtf: true,
      securityId: true,
      universeBucket: true,
    },
    take: limited(limit, 8),
    where: {
      isActive: true,
      isDelisted: false,
      OR: [
        {
          canonicalTicker: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          companyName: {
            contains: q,
            mode: "insensitive",
          },
        },
      ],
    },
  });

  return rows.map((row) => ({
    company_name: row.companyName,
    exchange: row.exchange,
    is_adr: row.isAdr,
    is_etf: row.isEtf,
    security_id: row.securityId,
    ticker: row.canonicalTicker,
    universe_bucket: row.universeBucket,
  }));
}

export async function buildTickerReport(input: {
  themeRef?: string | null;
  ticker: string;
}) {
  const prisma = getPrismaClient();
  const security = await prisma.security.findFirst({
    where: securityWhere(input.ticker),
  });

  if (!security) {
    return null;
  }

  const candidateInclude = {
    signalScores: {
      orderBy: {
        computedAt: "desc" as const,
      },
      where: {
        signalLayer: {
          in: [...SIGNAL_LAYERS],
        },
      },
    },
    signalStates: {
      orderBy: {
        computedAt: "desc" as const,
      },
      where: {
        signalLayer: {
          in: [...SIGNAL_LAYERS],
        },
      },
    },
    theme: true,
  };

  const candidateWhere = input.themeRef
    ? {
        securityId: security.securityId,
        theme: themeWhere(input.themeRef),
      }
    : {
        securityId: security.securityId,
      };
  const candidates = await prisma.themeCandidate.findMany({
    include: candidateInclude,
    orderBy: [
      {
        tickerReviewPriorityScore: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
    where: candidateWhere,
  });

  if (input.themeRef && candidates.length === 0) {
    return {
      security: {
        company_name: security.companyName,
        exchange: security.exchange,
        security_id: security.securityId,
        ticker: security.canonicalTicker,
        universe_bucket: security.universeBucket,
      },
      theme_reports: [],
    };
  }

  const evidence = await prisma.evidenceLedger.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          securityId: true,
        },
      },
      theme: {
        select: {
          sourceThemeCode: true,
          themeId: true,
          themeName: true,
          themeSlug: true,
        },
      },
    },
    orderBy: [
      {
        createdAt: "desc",
      },
    ],
    take: 60,
    where: {
      securityId: security.securityId,
      ...(input.themeRef
        ? {
            theme: themeWhere(input.themeRef),
          }
        : {}),
    },
  });

  return {
    evidence_summary: evidence.map(serializeEvidence),
    security: {
      company_name: security.companyName,
      exchange: security.exchange,
      security_id: security.securityId,
      ticker: security.canonicalTicker,
      universe_bucket: security.universeBucket,
    },
    theme_reports: candidates.map((candidate) => ({
      candidate: serializeCandidateReport(candidate),
      invalidation_rules: candidate.theme.invalidationRules,
      theme: {
        source_theme_code: candidate.theme.sourceThemeCode,
        theme_id: candidate.theme.themeId,
        theme_name: candidate.theme.themeName,
        theme_slug: candidate.theme.themeSlug,
      },
    })),
  };
}

export async function buildEvidencePage(input: {
  cursor?: string | null;
  limit?: number;
  metricName?: string | null;
  provider?: ProviderName | null;
  reasonCode?: string | null;
  securityId?: string | null;
  themeId?: string | null;
}): Promise<ReadPage<ReturnType<typeof serializeEvidence>>> {
  const prisma = getPrismaClient();
  const limit = limited(input.limit);
  const cursor = decodePageCursor(input.cursor);
  const fetchedCursor = cursorDate(cursor?.sort);
  const theme = input.themeId
    ? await prisma.themeDefinition.findFirst({
        select: {
          themeId: true,
        },
        where: themeWhere(input.themeId),
      })
    : null;
  const security = input.securityId
    ? await prisma.security.findFirst({
        select: {
          securityId: true,
        },
        where: securityWhere(input.securityId),
      })
    : null;
  const rows = await prisma.evidenceLedger.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          securityId: true,
        },
      },
      theme: {
        select: {
          sourceThemeCode: true,
          themeId: true,
          themeName: true,
          themeSlug: true,
        },
      },
    },
    orderBy: [
      {
        fetchedAt: "desc",
      },
      {
        evidenceId: "desc",
      },
    ],
    take: limit + 1,
    where: {
      metricName: input.metricName ?? undefined,
      ...(cursor && fetchedCursor
        ? {
            OR: [
              {
                fetchedAt: {
                  lt: fetchedCursor,
                },
              },
              {
                evidenceId: {
                  lt: cursor.id,
                },
                fetchedAt: fetchedCursor,
              },
            ],
          }
        : {}),
      provider: input.provider ?? undefined,
      reasonCode: input.reasonCode ?? undefined,
      securityId: security?.securityId ?? undefined,
      themeId: theme?.themeId ?? undefined,
    },
  });

  const page = pageRows(rows, limit, (row) => ({
    id: row.evidenceId,
    sort: row.fetchedAt.toISOString(),
  }));

  return {
    pagination: page.pagination,
    rows: page.rows.map(serializeEvidence),
  };
}

export async function buildAlertsPage(input: {
  cursor?: string | null;
  deliveryStatus?: AlertDeliveryStatus | null;
  limit?: number;
  readStatus?: "read" | "unread" | null;
  securityId?: string | null;
  severity?: AlertSeverity | null;
  themeId?: string | null;
}) {
  const prisma = getPrismaClient();
  const limit = limited(input.limit);
  const cursor = decodePageCursor(input.cursor);
  const createdCursor = cursorDate(cursor?.sort);
  const theme = input.themeId
    ? await prisma.themeDefinition.findFirst({
        select: {
          themeId: true,
        },
        where: themeWhere(input.themeId),
      })
    : null;
  const security = input.securityId
    ? await prisma.security.findFirst({
        select: {
          securityId: true,
        },
        where: securityWhere(input.securityId),
      })
    : null;
  const rows = await prisma.alert.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          securityId: true,
        },
      },
      theme: {
        select: {
          sourceThemeCode: true,
          themeId: true,
          themeName: true,
          themeSlug: true,
        },
      },
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        alertId: "desc",
      },
    ],
    take: limit + 1,
    where: {
      deliveryStatus: input.deliveryStatus ?? undefined,
      dismissedAt: null,
      ...(cursor && createdCursor
        ? {
            OR: [
              {
                createdAt: {
                  lt: createdCursor,
                },
              },
              {
                alertId: {
                  lt: cursor.id,
                },
                createdAt: createdCursor,
              },
            ],
          }
        : {}),
      readAt:
        input.readStatus === "read"
          ? {
              not: null,
            }
          : input.readStatus === "unread"
            ? null
            : undefined,
      securityId: security?.securityId ?? undefined,
      severity: input.severity ?? undefined,
      themeId: theme?.themeId ?? undefined,
    },
  });

  const page = pageRows(rows, limit, (row) => ({
    id: row.alertId,
    sort: row.createdAt.toISOString(),
  }));

  return {
    pagination: page.pagination,
    rows: page.rows.map((row) => ({
      alert_id: row.alertId,
      alert_type: row.alertType,
      created_at: row.createdAt.toISOString(),
      delivery_status: row.deliveryStatus,
      dismissed_at: dateIso(row.dismissedAt),
      message: row.message,
      read_at: dateIso(row.readAt),
      reason_codes: stringArray(row.reasonCodes),
      security: row.security
        ? {
            company_name: row.security.companyName,
            security_id: row.security.securityId,
            ticker: row.security.canonicalTicker,
          }
        : null,
      sent_at: dateIso(row.sentAt),
      severity: row.severity,
      theme: row.theme
        ? {
            source_theme_code: row.theme.sourceThemeCode,
            theme_id: row.theme.themeId,
            theme_name: row.theme.themeName,
            theme_slug: row.theme.themeSlug,
          }
        : null,
      title: row.title,
    })),
  };
}

export async function buildUnreadAlertCount() {
  const prisma = getPrismaClient();
  const latest = await prisma.alert.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      alertId: true,
      createdAt: true,
    },
    where: {
      dismissedAt: null,
      readAt: null,
    },
  });
  const unreadCount = await prisma.alert.count({
    where: {
      dismissedAt: null,
      readAt: null,
    },
  });

  return {
    latest_alert_created_at: dateIso(latest?.createdAt),
    latest_alert_id: latest?.alertId ?? null,
    unread_count: unreadCount,
  };
}

export async function buildWatchlistPage(input: {
  cursor?: string | null;
  limit?: number;
  securityId?: string | null;
  status?: WatchlistStatus | null;
  themeId?: string | null;
  userId: string;
  watchType?: WatchType | null;
}) {
  const prisma = getPrismaClient();
  const limit = limited(input.limit);
  const cursor = decodePageCursor(input.cursor);
  const updatedCursor = cursorDate(cursor?.sort);
  const theme = input.themeId
    ? await prisma.themeDefinition.findFirst({
        select: {
          themeId: true,
        },
        where: themeWhere(input.themeId),
      })
    : null;
  const security = input.securityId
    ? await prisma.security.findFirst({
        select: {
          securityId: true,
        },
        where: securityWhere(input.securityId),
      })
    : null;
  const rows = await prisma.watchlistItem.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          securityId: true,
        },
      },
      theme: {
        select: {
          sourceThemeCode: true,
          themeId: true,
          themeName: true,
          themeSlug: true,
        },
      },
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        watchlistItemId: "desc",
      },
    ],
    take: limit + 1,
    where: {
      ...(cursor && updatedCursor
        ? {
            OR: [
              {
                updatedAt: {
                  lt: updatedCursor,
                },
              },
              {
                updatedAt: updatedCursor,
                watchlistItemId: {
                  lt: cursor.id,
                },
              },
            ],
          }
        : {}),
      securityId: security?.securityId ?? undefined,
      status: input.status ?? "ACTIVE",
      themeId: theme?.themeId ?? undefined,
      userId: input.userId,
      watchType: input.watchType ?? undefined,
    },
  });

  const page = pageRows(rows, limit, (row) => ({
    id: row.watchlistItemId,
    sort: row.updatedAt.toISOString(),
  }));

  return {
    pagination: page.pagination,
    rows: page.rows.map((row) => ({
      archived_at: dateIso(row.archivedAt),
      created_at: row.createdAt.toISOString(),
      notes: row.notes,
      security: row.security
        ? {
            company_name: row.security.companyName,
            security_id: row.security.securityId,
            ticker: row.security.canonicalTicker,
          }
        : null,
      status: row.status,
      theme: row.theme
        ? {
            source_theme_code: row.theme.sourceThemeCode,
            theme_id: row.theme.themeId,
            theme_name: row.theme.themeName,
            theme_slug: row.theme.themeSlug,
          }
        : null,
      theme_candidate_id: row.themeCandidateId,
      updated_at: row.updatedAt.toISOString(),
      watch_type: row.watchType,
      watchlist_item_id: row.watchlistItemId,
    })),
  };
}

export async function buildProviderHealth() {
  const calls = await getPrismaClient().apiObservability.findMany({
    orderBy: {
      calledAt: "desc",
    },
    take: 500,
  });
  const byEndpoint = new Map<
    string,
    {
      endpoint: string;
      lastFailureAt: string | null;
      lastStatus: "HEALTHY" | "FAILING" | "STALE";
      lastSuccessAt: string | null;
      latestCalledAt: string;
      provider: ProviderName;
      rowCount: number | null;
      sanitizedError: string | null;
      statusCode: number | null;
      durationMs: number | null;
    }
  >();
  const now = Date.now();

  for (const call of calls) {
    const key = `${call.provider}:${call.endpoint}`;
    const existing = byEndpoint.get(key);
    const healthy =
      call.statusCode !== null &&
      call.statusCode >= 200 &&
      call.statusCode < 400 &&
      !call.sanitizedError;

    if (!existing) {
      const stale = now - call.calledAt.getTime() > 24 * 60 * 60 * 1_000;
      byEndpoint.set(key, {
        durationMs: call.durationMs,
        endpoint: call.endpoint,
        lastFailureAt: healthy ? null : call.calledAt.toISOString(),
        lastStatus: stale ? "STALE" : healthy ? "HEALTHY" : "FAILING",
        lastSuccessAt: healthy ? call.calledAt.toISOString() : null,
        latestCalledAt: call.calledAt.toISOString(),
        provider: call.provider,
        rowCount: call.rowCount,
        sanitizedError: call.sanitizedError,
        statusCode: call.statusCode,
      });
      continue;
    }

    if (
      healthy &&
      (!existing.lastSuccessAt ||
        Date.parse(existing.lastSuccessAt) < call.calledAt.getTime())
    ) {
      existing.lastSuccessAt = call.calledAt.toISOString();
    }

    if (
      !healthy &&
      (!existing.lastFailureAt ||
        Date.parse(existing.lastFailureAt) < call.calledAt.getTime())
    ) {
      existing.lastFailureAt = call.calledAt.toISOString();
    }
  }

  return [...byEndpoint.values()].sort(
    (left, right) =>
      Date.parse(right.latestCalledAt) - Date.parse(left.latestCalledAt),
  );
}

export async function buildJobRuns(input: {
  cursor?: string | null;
  jobType?: JobType | null;
  limit?: number;
  status?: JobStatus | null;
}) {
  const limit = limited(input.limit);
  const cursor = decodePageCursor(input.cursor);
  const startedCursor = cursorDate(cursor?.sort);
  const rows = await getPrismaClient().jobRun.findMany({
    include: {
      _count: {
        select: {
          jobItems: true,
        },
      },
    },
    orderBy: [
      {
        startedAt: "desc",
      },
      {
        jobRunId: "desc",
      },
    ],
    take: limit + 1,
    where: {
      jobType: input.jobType ?? undefined,
      ...(cursor && startedCursor
        ? {
            OR: [
              {
                startedAt: {
                  lt: startedCursor,
                },
              },
              {
                jobRunId: {
                  lt: cursor.id,
                },
                startedAt: startedCursor,
              },
            ],
          }
        : {}),
      status: input.status ?? undefined,
    },
  });

  const page = pageRows(rows, limit, (row) => ({
    id: row.jobRunId,
    sort: row.startedAt.toISOString(),
  }));

  return {
    pagination: page.pagination,
    rows: page.rows.map((row) => ({
      error_summary: row.errorSummary,
      finished_at: dateIso(row.finishedAt),
      item_count: row._count.jobItems,
      job_run_id: row.jobRunId,
      job_type: row.jobType,
      provider_calls: row.providerCalls,
      rows_read: row.rowsRead,
      rows_written: row.rowsWritten,
      scope_id: row.scopeId,
      scope_type: row.scopeType,
      started_at: row.startedAt.toISOString(),
      status: row.status,
    })),
  };
}
