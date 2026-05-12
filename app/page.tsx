import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { JobTriggerButton } from "@/components/job-trigger-button";
import { ReasonChip } from "@/components/reason-chip";
import { StateBadge } from "@/components/state-badge";
import { WatchToggle } from "@/components/watch-toggle";
import { requirePageSession } from "@/lib/auth/server";
import { compactDateTime, formatNumber, freshnessLabel } from "@/lib/ui/format";
import { fetchInternalApi } from "@/lib/ui/api-client";
import type { DashboardThemeRow, WatchlistItemView } from "@/lib/ui/types";

type AlertCount = {
  unread_count: number;
};

function watchItemForTheme(watchlist: WatchlistItemView[], themeId: string) {
  return watchlist.find(
    (item) =>
      item.watch_type === "THEME" &&
      item.status === "ACTIVE" &&
      item.theme?.theme_id === themeId,
  );
}

function primaryState(theme: DashboardThemeRow) {
  return theme.snapshot?.dashboard_state ?? theme.default_dashboard_state;
}

export default async function DashboardPage() {
  const user = await requirePageSession();
  const [themes, alertCount, watchlist] = await Promise.all([
    fetchInternalApi<DashboardThemeRow[]>("/api/themes?limit=200"),
    fetchInternalApi<AlertCount>("/api/alerts/unread-count"),
    fetchInternalApi<WatchlistItemView[]>("/api/watchlist?limit=200"),
  ]);

  const scannedThemes = themes.filter((theme) => theme.snapshot);
  const hasSnapshots = scannedThemes.length > 0;

  return (
    <AppShell unreadCount={alertCount.unread_count} user={user}>
      <div className="mx-auto grid max-w-7xl gap-4">
        <section className="flex flex-col gap-3 border border-border bg-panel p-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase text-amber">
              Theme dashboard
            </p>
            <h1 className="mt-1 text-lg font-semibold">
              All active AlphaTrend themes
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-secondary">
              Dashboard states and priority scores are read from Phase 11
              snapshots. The UI sorts and filters, but does not recompute theme
              state.
            </p>
          </div>
          <JobTriggerButton
            jobType="THEME_SNAPSHOT"
            label={hasSnapshots ? "Refresh snapshots" : "Build first snapshot"}
          />
        </section>

        {!hasSnapshots ? (
          <section className="border border-caution bg-caution-bg p-3 text-sm text-caution">
            No scan has completed yet. Active themes are visible without fake
            scores; use the admin action to build the first dashboard snapshot
            when source signals are ready.
          </section>
        ) : null}

        <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {themes.map((theme) => {
            const snapshot = theme.snapshot;
            const watched = watchItemForTheme(watchlist, theme.theme_id);
            const freshness = freshnessLabel(snapshot?.last_scanned_at);

            return (
              <article
                className="grid gap-3 border border-border bg-panel p-3"
                key={theme.theme_id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      className="text-base font-semibold text-foreground hover:text-amber"
                      href={`/themes/${theme.theme_slug}`}
                    >
                      {theme.theme_name}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-sm text-secondary">
                      {theme.economic_mechanism_summary ??
                        theme.short_description ??
                        "No mechanism summary loaded."}
                    </p>
                  </div>
                  <WatchToggle
                    initialWatchlistItemId={watched?.watchlist_item_id}
                    label={theme.theme_name}
                    themeId={theme.theme_id}
                    watchType="THEME"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StateBadge state={primaryState(theme)} />
                  <span className="font-mono text-sm">
                    Priority{" "}
                    {formatNumber(snapshot?.theme_review_priority_score, 1)}
                  </span>
                  <span
                    className={
                      freshness === "Stale"
                        ? "border border-caution px-2 py-0.5 font-mono text-[11px] text-caution"
                        : "border border-border px-2 py-0.5 font-mono text-[11px] text-muted"
                    }
                  >
                    {freshness}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 border-y border-border-subtle py-2 font-mono text-xs">
                  <div>
                    <p className="text-muted">Direct</p>
                    <p>{snapshot?.direct_beneficiary_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Investable</p>
                    <p>{snapshot?.investable_candidate_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Extended</p>
                    <p>{snapshot?.leader_but_extended_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Watchlist</p>
                    <p>{snapshot?.watchlist_only_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Wrong</p>
                    <p>{snapshot?.wrong_ticker_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">No trade</p>
                    <p>{snapshot?.no_trade_count ?? 0}</p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(snapshot?.highlight_reason_codes ?? [])
                      .slice(0, 3)
                      .map((code) => (
                        <ReasonChip
                          code={code}
                          key={code}
                          themeId={theme.theme_id}
                        />
                      ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(snapshot?.caution_reason_codes ?? [])
                      .slice(0, 3)
                      .map((code) => (
                        <ReasonChip
                          code={code}
                          key={code}
                          themeId={theme.theme_id}
                        />
                      ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-muted">
                  <span>
                    Last scan {compactDateTime(snapshot?.last_scanned_at)}
                  </span>
                  <span>
                    {snapshot?.basket_preferred ? "Basket preferred" : null}
                    {snapshot?.etf_preferred ? " ETF preferred" : null}
                  </span>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
