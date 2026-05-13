import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";

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

type AlertsPageProps = {
  searchParams: Promise<{
    alertType?: string;
    deliveryStatus?: string;
    readStatus?: string;
    securityId?: string;
    severity?: string;
    themeId?: string;
    ticker?: string;
  }>;
};

const ALERT_TYPE_OPTIONS = [
  "THEME_STATE_CHANGED",
  "EXPOSURE_CONFIRMED",
  "EXPOSURE_REJECTED",
  "FUNDAMENTALS_VALIDATED",
  "FUNDAMENTALS_DETERIORATED",
  "PRICE_STATE_CHANGED",
  "LEADER_BUT_EXTENDED",
  "DELAYED_CATCHUP_CANDIDATE",
  "DILUTION_RISK_WARNING",
  "LIQUIDITY_RISK_WARNING",
  "FINAL_STATE_CHANGED",
  "NO_TRADE_TRIGGERED",
  "INVALIDATION_TRIGGERED",
] as const;

const SEVERITY_OPTIONS = [
  "INFO",
  "POSITIVE",
  "CAUTION",
  "WARNING",
  "BLOCKER",
] as const;

const DELIVERY_STATUS_OPTIONS = [
  "STORED",
  "SENT",
  "FAILED",
  "SUPPRESSED",
] as const;

function alertsPath(params: Awaited<AlertsPageProps["searchParams"]>) {
  const query = new URLSearchParams({
    limit: "100",
  });

  for (const key of [
    "alertType",
    "deliveryStatus",
    "readStatus",
    "severity",
    "themeId",
    "ticker",
  ] as const) {
    const value = params[key];

    if (value) {
      query.set(key, value);
    }
  }

  if (!params.ticker && params.securityId) {
    query.set("securityId", params.securityId);
  }

  return `/api/alerts?${query.toString()}`;
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const params = await searchParams;
  const user = await requirePageSession();
  const [alerts, watchlist, alertCount] = await Promise.all([
    fetchInternalApi<AlertRow[]>(alertsPath(params)),
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
          <form
            className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6"
            method="get"
          >
            <label className="grid gap-1 text-xs text-secondary">
              Theme
              <input
                className="border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-amber"
                defaultValue={params.themeId ?? ""}
                name="themeId"
                placeholder="T001"
              />
            </label>
            <label className="grid gap-1 text-xs text-secondary">
              Ticker
              <input
                className="border border-border bg-background px-2 py-1 text-sm font-mono text-foreground outline-none focus:border-amber"
                defaultValue={params.ticker ?? params.securityId ?? ""}
                name="ticker"
                placeholder="NVDA"
              />
            </label>
            <label className="grid gap-1 text-xs text-secondary">
              Alert type
              <select
                className="border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-amber"
                defaultValue={params.alertType ?? ""}
                name="alertType"
              >
                <option value="">All</option>
                {ALERT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-secondary">
              Severity
              <select
                className="border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-amber"
                defaultValue={params.severity ?? ""}
                name="severity"
              >
                <option value="">All</option>
                {SEVERITY_OPTIONS.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-secondary">
              Status
              <select
                className="border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-amber"
                defaultValue={params.readStatus ?? ""}
                name="readStatus"
              >
                <option value="">All</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-secondary">
              Delivery
              <select
                className="border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-amber"
                defaultValue={params.deliveryStatus ?? ""}
                name="deliveryStatus"
              >
                <option value="">All</option>
                {DELIVERY_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2 md:col-span-3 xl:col-span-6">
              <button
                className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs uppercase text-secondary hover:border-amber hover:text-amber"
                type="submit"
              >
                <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                Apply
              </button>
              <Link
                className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs uppercase text-secondary hover:border-amber hover:text-amber"
                href="/alerts"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Clear
              </Link>
            </div>
          </form>
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
