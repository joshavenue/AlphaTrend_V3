import Link from "next/link";

import { AlertActions } from "@/components/alert-actions";
import { AppShell } from "@/components/app-shell";
import { ReasonChip } from "@/components/reason-chip";
import { requirePageSession } from "@/lib/auth/server";
import { compactDateTime } from "@/lib/ui/format";
import { fetchInternalApi } from "@/lib/ui/api-client";
import type { AlertRow, WatchlistItemView } from "@/lib/ui/types";

type AlertCount = {
  unread_count: number;
};

export default async function AlertsPage() {
  const user = await requirePageSession();
  const [alerts, watchlist, alertCount] = await Promise.all([
    fetchInternalApi<AlertRow[]>("/api/alerts?limit=100"),
    fetchInternalApi<WatchlistItemView[]>("/api/watchlist?limit=200"),
    fetchInternalApi<AlertCount>("/api/alerts/unread-count"),
  ]);

  return (
    <AppShell
      breadcrumb={[{ href: "/", label: "Dashboard" }, { label: "Alerts" }]}
      unreadCount={alertCount.unread_count}
      user={user}
    >
      <div className="mx-auto grid max-w-7xl gap-4">
        <section className="border border-border bg-panel p-3">
          <p className="font-mono text-[10px] uppercase text-amber">
            Alerts and watchlist
          </p>
          <h1 className="mt-1 text-lg font-semibold">Monitor state changes</h1>
          <p className="mt-1 text-sm text-secondary">
            Stored alerts are created by the backend state-history engine and
            remain available for audit after they are read or dismissed.
          </p>
        </section>

        <section className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border border-border bg-panel p-3">
            <h2 className="text-sm font-semibold text-amber">Watchlist</h2>
            <div className="mt-3 grid gap-2">
              {watchlist.map((item) => (
                <div
                  className="border border-border-subtle p-2 text-sm"
                  key={item.watchlist_item_id}
                >
                  <p className="font-mono text-xs text-secondary">
                    {item.watch_type}
                  </p>
                  <p>
                    {item.theme ? (
                      <Link
                        className="text-cyan hover:text-amber"
                        href={`/themes/${item.theme.theme_slug}`}
                      >
                        {item.theme.theme_name}
                      </Link>
                    ) : null}
                    {item.security ? (
                      <span>
                        {" "}
                        <Link
                          className="font-mono text-amber hover:text-cyan"
                          href={`/tickers/${item.security.ticker}`}
                        >
                          {item.security.ticker}
                        </Link>
                      </span>
                    ) : null}
                  </p>
                </div>
              ))}
              {watchlist.length === 0 ? (
                <p className="border border-border-subtle p-3 text-sm text-secondary">
                  No monitored themes or tickers yet.
                </p>
              ) : null}
            </div>
          </div>

          <div className="border border-border bg-panel p-3">
            <h2 className="text-sm font-semibold text-amber">Stored alerts</h2>
            <div className="mt-3 grid gap-2">
              {alerts.map((alert) => (
                <article
                  className="border border-border-subtle p-2 text-sm"
                  key={alert.alert_id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{alert.title}</p>
                      <p className="text-secondary">{alert.message}</p>
                      <p className="mt-1 font-mono text-[10px] uppercase text-muted">
                        {alert.severity} / {alert.alert_type}
                        {alert.read_at ? " / read" : " / unread"}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-muted">
                      {compactDateTime(alert.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {alert.reason_codes.map((code) => (
                      <ReasonChip
                        code={code}
                        key={code}
                        securityId={alert.security?.security_id}
                        themeId={alert.theme?.theme_id}
                      />
                    ))}
                  </div>
                  <div className="mt-2">
                    <AlertActions
                      alertId={alert.alert_id}
                      dismissedAt={alert.dismissed_at}
                      readAt={alert.read_at}
                    />
                  </div>
                </article>
              ))}
              {alerts.length === 0 ? (
                <p className="border border-border-subtle p-3 text-sm text-secondary">
                  No state-change alerts have been generated yet.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
