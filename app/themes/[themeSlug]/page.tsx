import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { JobTriggerButton } from "@/components/job-trigger-button";
import { ReasonChip } from "@/components/reason-chip";
import { StateBadge } from "@/components/state-badge";
import { WatchToggle } from "@/components/watch-toggle";
import { requirePageSession } from "@/lib/auth/server";
import { compactDateTime, formatNumber } from "@/lib/ui/format";
import { fetchInternalApi } from "@/lib/ui/api-client";
import type {
  CandidateRow,
  ThemeCandidatesView,
  WatchlistItemView,
} from "@/lib/ui/types";

type AlertCount = {
  unread_count: number;
};

type SnapshotView = {
  latest_snapshot: {
    dashboard_state: string;
    direct_beneficiary_count: number;
    investable_candidate_count: number;
    last_scanned_at: string | null;
    no_trade_count: number;
    theme_review_priority_score: number | null;
    wrong_ticker_count: number;
  } | null;
  short_description: string | null;
  theme_id: string;
  theme_name: string;
  theme_slug: string;
};

type ThemePageProps = {
  params: Promise<{
    themeSlug: string;
  }>;
};

const GROUP_ORDER = [
  "Direct beneficiaries",
  "Major beneficiaries",
  "Leaders",
  "Leader but extended",
  "Wrong ticker / rejected",
  "No-trade / fragile",
  "Indirect beneficiaries",
  "Indirect or partial beneficiaries",
  "Healthy participants",
  "Delayed catch-up candidates",
  "Basket candidates",
  "ETF expression options",
  "Watchlist only",
  "Non-participants",
  "Review required",
  "Unclassified",
];

const DEFAULT_OPEN = new Set([
  "Direct beneficiaries",
  "Major beneficiaries",
  "Leaders",
  "Leader but extended",
  "Wrong ticker / rejected",
  "No-trade / fragile",
]);

function groupEntries(groups: Record<string, CandidateRow[]>) {
  const known = GROUP_ORDER.flatMap((group) =>
    groups[group] ? [[group, groups[group]] as const] : [],
  );
  const seen = new Set(GROUP_ORDER);
  const extra = Object.entries(groups)
    .filter(([group]) => !seen.has(group))
    .sort(([left], [right]) => left.localeCompare(right));

  return [...known, ...extra];
}

function signalState(row: CandidateRow, layer: string) {
  return row.signal_states[layer]?.state ?? null;
}

function signalScore(row: CandidateRow, layer: string) {
  return row.signal_scores[layer]?.score ?? null;
}

function watchItemForCandidate(
  watchlist: WatchlistItemView[],
  themeId: string,
  securityId: string,
) {
  return watchlist.find(
    (item) =>
      item.watch_type === "TICKER_THEME_PAIR" &&
      item.theme?.theme_id === themeId &&
      item.security?.security_id === securityId &&
      item.status === "ACTIVE",
  );
}

export default async function ThemeDetailPage({ params }: ThemePageProps) {
  const { themeSlug } = await params;
  const user = await requirePageSession();
  const [snapshot, candidates, alertCount, watchlist] = await Promise.all([
    fetchInternalApi<SnapshotView>(`/api/themes/${themeSlug}/snapshot`),
    fetchInternalApi<ThemeCandidatesView>(
      `/api/themes/${themeSlug}/candidates?limit=200`,
    ),
    fetchInternalApi<AlertCount>("/api/alerts/unread-count"),
    fetchInternalApi<WatchlistItemView[]>("/api/watchlist?limit=200"),
  ]);
  const latest = snapshot.latest_snapshot;
  const themeWatch = watchlist.find(
    (item) =>
      item.watch_type === "THEME" &&
      item.theme?.theme_id === snapshot.theme_id &&
      item.status === "ACTIVE",
  );

  return (
    <AppShell
      breadcrumb={[
        { href: "/", label: "Dashboard" },
        { label: snapshot.theme_name },
      ]}
      unreadCount={alertCount.unread_count}
      user={user}
    >
      <div className="mx-auto grid max-w-7xl gap-4">
        <section className="border border-border bg-panel p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase text-amber">
                Theme detail
              </p>
              <h1 className="mt-1 text-lg font-semibold">
                {snapshot.theme_name}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-secondary">
                {snapshot.short_description ??
                  "Candidates are grouped by persisted AlphaTrend display group."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <WatchToggle
                initialWatchlistItemId={themeWatch?.watchlist_item_id}
                label={snapshot.theme_name}
                themeId={snapshot.theme_id}
                watchType="THEME"
              />
              <JobTriggerButton
                label="Refresh theme snapshot"
                scopeId={snapshot.theme_slug}
                scopeType="theme"
              />
            </div>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
            <StateBadge state={latest?.dashboard_state} />
            <span className="font-mono text-sm">
              Priority {formatNumber(latest?.theme_review_priority_score, 1)}
            </span>
            <span className="min-w-0 break-words font-mono text-xs text-muted">
              Last scan {compactDateTime(latest?.last_scanned_at)}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-subtle pt-3 font-mono text-xs md:grid-cols-5">
            <span>Direct {latest?.direct_beneficiary_count ?? 0}</span>
            <span>Investable {latest?.investable_candidate_count ?? 0}</span>
            <span>Wrong {latest?.wrong_ticker_count ?? 0}</span>
            <span>No trade {latest?.no_trade_count ?? 0}</span>
            <span>Total {candidates.candidate_count}</span>
          </div>
        </section>

        <section className="grid min-w-0 gap-3">
          {groupEntries(candidates.groups).map(([group, rows]) => (
            <details
              className="min-w-0 border border-border bg-panel"
              key={group}
              open={DEFAULT_OPEN.has(group)}
            >
              <summary className="cursor-pointer border-b border-border-subtle px-3 py-2 text-sm font-semibold text-amber">
                {group}{" "}
                <span className="font-mono text-xs text-muted">
                  ({rows.length})
                </span>
              </summary>
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead className="font-mono text-[10px] uppercase text-muted">
                    <tr className="border-b border-border-subtle">
                      <th className="px-2 py-2 text-left">Ticker</th>
                      <th className="px-2 py-2 text-left">Company</th>
                      <th className="px-2 py-2 text-right">T1</th>
                      <th className="px-2 py-2 text-center">T3</th>
                      <th className="px-2 py-2 text-center">T4</th>
                      <th className="px-2 py-2 text-center">T6</th>
                      <th className="px-2 py-2 text-center">Final</th>
                      <th className="px-2 py-2 text-left">Reasons</th>
                      <th className="px-2 py-2 text-right">Watch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const watched = watchItemForCandidate(
                        watchlist,
                        snapshot.theme_id,
                        row.security_id,
                      );

                      return (
                        <tr
                          className="border-b border-border-subtle hover:bg-row-hover"
                          key={row.security_id}
                        >
                          <td className="px-2 py-1.5 font-mono text-amber">
                            <Link
                              href={`/themes/${snapshot.theme_slug}/${row.ticker}`}
                            >
                              {row.ticker}
                            </Link>
                          </td>
                          <td className="max-w-72 truncate px-2 py-1.5 text-secondary">
                            {row.company_name}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {formatNumber(
                              signalScore(row, "T1_EXPOSURE_PURITY"),
                              1,
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <StateBadge
                              state={signalState(row, "T3_FUNDAMENTALS")}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <StateBadge
                              state={signalState(
                                row,
                                "T4_PRICE_VALUATION_PARTICIPATION",
                              )}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <StateBadge
                              state={signalState(
                                row,
                                "T6_LIQUIDITY_DILUTION_FRAGILITY",
                              )}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <StateBadge state={row.final_state} />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-wrap gap-1">
                              <ReasonChip
                                code={
                                  row.top_pass_reason ??
                                  row.top_fail_reason ??
                                  row.rejection_reason_codes[0]
                                }
                                securityId={row.security_id}
                                themeId={snapshot.theme_id}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <WatchToggle
                              initialWatchlistItemId={
                                watched?.watchlist_item_id
                              }
                              label={`${row.ticker} / ${snapshot.theme_name}`}
                              securityId={row.security_id}
                              themeCandidateId={row.theme_candidate_id}
                              themeId={snapshot.theme_id}
                              watchType="TICKER_THEME_PAIR"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
