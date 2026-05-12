import type {
  DashboardState,
  FinalState,
  ThemeDefinitionStatus,
} from "@/generated/prisma/client";
import { T8_SIGNAL_LAYER } from "@/lib/expression/constants";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
import { T3_SIGNAL_LAYER } from "@/lib/fundamentals/constants";
import { T6_SIGNAL_LAYER } from "@/lib/liquidity/constants";
import { T4_SIGNAL_LAYER } from "@/lib/price/constants";
import { ACTIVE_THEME_STATUSES } from "@/lib/snapshots/constants";
import type { SnapshotDbClient } from "@/lib/snapshots/types";
import { isUuid } from "@/lib/util/uuid";

type DashboardQuery = {
  cursor?: string;
  dashboardState?: DashboardState;
  limit?: number;
  status?: ThemeDefinitionStatus;
};

type CandidateQuery = {
  displayGroup?: string;
  finalState?: FinalState;
  limit?: number;
};

const SIGNAL_LAYERS = [
  T1_SIGNAL_LAYER,
  T3_SIGNAL_LAYER,
  T4_SIGNAL_LAYER,
  T6_SIGNAL_LAYER,
  T8_SIGNAL_LAYER,
] as const;

const DASHBOARD_STATE_PRIORITY = new Map<DashboardState, number>([
  ["WORTH_CHECKING_OUT", 1],
  ["CONFIRMED_BUT_EXTENDED", 2],
  ["EARLY_WATCHLIST", 3],
  ["NO_CLEAN_EXPRESSION", 4],
  ["CROWDED_LATE", 5],
  ["FADING", 6],
  ["INSUFFICIENT_EVIDENCE", 7],
  ["REJECTED_INACTIVE", 8],
]);

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

function limited(value: number | undefined, fallback = 50) {
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

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "string" && entry.length > 0 ? [entry] : [],
  );
}

function mechanismSummary(value: unknown) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "summary" in value) {
    const summary = (value as { summary?: unknown }).summary;
    return typeof summary === "string" ? summary : null;
  }

  return null;
}

function serializeSnapshot(snapshot: {
  basketPreferred: boolean;
  cautionReasonCodes: unknown;
  createdAt: Date;
  dashboardState: DashboardState;
  dataQualityScore: unknown;
  delayedCatchupCount: number;
  directBeneficiaryCount: number;
  etfPreferred: boolean;
  highlightReasonCodes: unknown;
  investableCandidateCount: number;
  jobRunId: string | null;
  lastScannedAt: Date | null;
  leaderButExtendedCount: number;
  leaderCount: number;
  noTradeCount: number;
  snapshotDate: Date;
  themeRealityScore: unknown;
  themeReviewPriorityScore: unknown;
  themeSnapshotId: string;
  topDirectBeneficiaries: unknown;
  topRejectedTickers: unknown;
  watchlistOnlyCount: number;
  wrongTickerCount: number;
}) {
  return {
    basket_preferred: snapshot.basketPreferred,
    caution_reason_codes: Array.isArray(snapshot.cautionReasonCodes)
      ? snapshot.cautionReasonCodes
      : [],
    created_at: snapshot.createdAt.toISOString(),
    dashboard_state: snapshot.dashboardState,
    data_quality_score: decimalNumber(snapshot.dataQualityScore),
    delayed_catchup_count: snapshot.delayedCatchupCount,
    direct_beneficiary_count: snapshot.directBeneficiaryCount,
    etf_preferred: snapshot.etfPreferred,
    highlight_reason_codes: Array.isArray(snapshot.highlightReasonCodes)
      ? snapshot.highlightReasonCodes
      : [],
    investable_candidate_count: snapshot.investableCandidateCount,
    job_run_id: snapshot.jobRunId,
    last_scanned_at: dateIso(snapshot.lastScannedAt),
    leader_but_extended_count: snapshot.leaderButExtendedCount,
    leader_count: snapshot.leaderCount,
    no_trade_count: snapshot.noTradeCount,
    snapshot_date: snapshot.snapshotDate.toISOString().slice(0, 10),
    snapshot_id: snapshot.themeSnapshotId,
    theme_reality_score: decimalNumber(snapshot.themeRealityScore),
    theme_review_priority_score: decimalNumber(
      snapshot.themeReviewPriorityScore,
    ),
    top_direct_beneficiaries: Array.isArray(snapshot.topDirectBeneficiaries)
      ? snapshot.topDirectBeneficiaries
      : [],
    top_rejected_tickers: Array.isArray(snapshot.topRejectedTickers)
      ? snapshot.topRejectedTickers
      : [],
    watchlist_only_count: snapshot.watchlistOnlyCount,
    wrong_ticker_count: snapshot.wrongTickerCount,
  };
}

type DashboardThemeRow = {
  default_dashboard_state: DashboardState;
  economic_mechanism_summary: string | null;
  short_description: string | null;
  snapshot: ReturnType<typeof serializeSnapshot> | null;
  source_theme_code: string | null;
  status: ThemeDefinitionStatus;
  theme_id: string;
  theme_name: string;
  theme_slug: string;
};

function dashboardPriority(row: DashboardThemeRow) {
  return row.snapshot
    ? (DASHBOARD_STATE_PRIORITY.get(row.snapshot.dashboard_state) ?? 99)
    : (DASHBOARD_STATE_PRIORITY.get(row.default_dashboard_state) ?? 99);
}

function timestampMs(value: string | null | undefined) {
  return value ? Date.parse(value) || 0 : 0;
}

function compareDashboardRows(
  left: DashboardThemeRow,
  right: DashboardThemeRow,
) {
  return (
    dashboardPriority(left) - dashboardPriority(right) ||
    (right.snapshot?.theme_review_priority_score ?? -1) -
      (left.snapshot?.theme_review_priority_score ?? -1) ||
    timestampMs(right.snapshot?.last_scanned_at) -
      timestampMs(left.snapshot?.last_scanned_at) ||
    (left.source_theme_code ?? "").localeCompare(
      right.source_theme_code ?? "",
    ) ||
    left.theme_name.localeCompare(right.theme_name)
  );
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

export async function buildDashboardThemes(
  prisma: SnapshotDbClient,
  query: DashboardQuery = {},
) {
  const page = await buildDashboardThemesPage(prisma, query);

  return page.rows;
}

export async function buildDashboardThemesPage(
  prisma: SnapshotDbClient,
  query: DashboardQuery = {},
) {
  const themes = await prisma.themeDefinition.findMany({
    include: {
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
    orderBy: {
      sourceThemeCode: "asc",
    },
    where: {
      status: query.status
        ? query.status
        : {
            in: [...ACTIVE_THEME_STATUSES],
          },
    },
  });
  const limit = limited(query.limit);
  const rows = themes
    .map((theme): DashboardThemeRow => {
      const snapshot = theme.snapshots[0];

      return {
        default_dashboard_state: theme.defaultDashboardState,
        economic_mechanism_summary: mechanismSummary(theme.economicMechanism),
        short_description: theme.shortDescription,
        snapshot: snapshot ? serializeSnapshot(snapshot) : null,
        source_theme_code: theme.sourceThemeCode,
        status: theme.status,
        theme_id: theme.themeId,
        theme_name: theme.themeName,
        theme_slug: theme.themeSlug,
      };
    })
    .filter((row) =>
      query.dashboardState
        ? row.snapshot?.dashboard_state === query.dashboardState
        : true,
    )
    .sort(compareDashboardRows);
  const cursorIndex = query.cursor
    ? rows.findIndex((row) => row.theme_id === query.cursor)
    : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const pageRows = rows.slice(startIndex, startIndex + limit);
  const hasMore = rows.length > startIndex + limit;

  return {
    pagination: {
      hasMore,
      limit,
      nextCursor: hasMore ? (pageRows.at(-1)?.theme_id ?? null) : null,
    },
    rows: pageRows,
  };
}

export async function buildThemeSnapshotView(
  prisma: SnapshotDbClient,
  themeRef: string,
) {
  const theme = await prisma.themeDefinition.findFirst({
    include: {
      snapshots: {
        orderBy: [
          {
            snapshotDate: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 2,
      },
    },
    where: themeWhere(themeRef),
  });

  if (!theme) {
    return null;
  }

  const [latest, previous] = theme.snapshots;

  return {
    default_dashboard_state: theme.defaultDashboardState,
    economic_mechanism_summary: mechanismSummary(theme.economicMechanism),
    latest_snapshot: latest ? serializeSnapshot(latest) : null,
    previous_snapshot: previous ? serializeSnapshot(previous) : null,
    short_description: theme.shortDescription,
    source_theme_code: theme.sourceThemeCode,
    status: theme.status,
    theme_id: theme.themeId,
    theme_name: theme.themeName,
    theme_slug: theme.themeSlug,
  };
}

export async function buildThemeCandidatesView(
  prisma: SnapshotDbClient,
  themeRef: string,
  query: CandidateQuery = {},
) {
  const theme = await prisma.themeDefinition.findFirst({
    select: {
      sourceThemeCode: true,
      themeId: true,
      themeName: true,
      themeSlug: true,
    },
    where: themeWhere(themeRef),
  });

  if (!theme) {
    return null;
  }

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
        displayGroup: "asc",
      },
      {
        tickerReviewPriorityScore: "desc",
      },
      {
        security: {
          canonicalTicker: "asc",
        },
      },
    ],
    take: limited(query.limit, 200),
    where: {
      displayGroup: query.displayGroup,
      finalState: query.finalState,
      themeId: theme.themeId,
    },
  });
  const rows = candidates.map((candidate) => {
    const latestScores = SIGNAL_LAYERS.map(
      (layer) => [layer, latestSignal(candidate.signalScores, layer)] as const,
    );
    const latestStates = SIGNAL_LAYERS.map(
      (layer) => [layer, latestSignal(candidate.signalStates, layer)] as const,
    );

    return {
      beneficiary_type: candidate.beneficiaryType,
      candidate_status: candidate.candidateStatus,
      company_name: candidate.security.companyName,
      dashboard_visible: candidate.dashboardVisible,
      display_group: candidate.displayGroup,
      exchange: candidate.security.exchange,
      final_state: candidate.finalState,
      last_scanned_at: dateIso(candidate.lastScannedAt),
      rejection_reason_codes: stringArray(candidate.rejectionReasonCodes),
      review_priority_score: decimalNumber(candidate.tickerReviewPriorityScore),
      security_id: candidate.securityId,
      signal_scores: Object.fromEntries(
        latestScores.map(([layer, score]) => [layer, serializeSignal(score)]),
      ),
      signal_states: Object.fromEntries(
        latestStates.map(([layer, state]) => [layer, serializeSignal(state)]),
      ),
      source_of_inclusion: candidate.sourceOfInclusion,
      theme_candidate_id: candidate.themeCandidateId,
      ticker: candidate.security.canonicalTicker,
      top_fail_reason: candidate.topFailReason,
      top_pass_reason: candidate.topPassReason,
      universe_bucket: candidate.security.universeBucket,
    };
  });
  const groups = rows.reduce<Record<string, typeof rows>>((grouped, row) => {
    const group = row.display_group ?? "Unclassified";
    grouped[group] = grouped[group] ?? [];
    grouped[group].push(row);
    return grouped;
  }, {});

  return {
    candidate_count: rows.length,
    groups,
    rows,
    theme,
  };
}
