import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { ReasonChip } from "@/components/reason-chip";
import { requirePageSession } from "@/lib/auth/server";
import { compactDateTime, formatNumber } from "@/lib/ui/format";
import { fetchInternalApi } from "@/lib/ui/api-client";
import type { EvidenceRow } from "@/lib/ui/types";

type AlertCount = {
  unread_count: number;
};

type EvidencePageProps = {
  searchParams: Promise<{
    metricName?: string;
    provider?: string;
    reasonCode?: string;
    securityId?: string;
    themeId?: string;
    ticker?: string;
  }>;
};

function evidencePath(params: Awaited<EvidencePageProps["searchParams"]>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  return `/api/evidence?${query.toString()}`;
}

export default async function EvidencePage({
  searchParams,
}: EvidencePageProps) {
  const params = await searchParams;
  const user = await requirePageSession();
  const [rows, alertCount] = await Promise.all([
    fetchInternalApi<EvidenceRow[]>(evidencePath(params)),
    fetchInternalApi<AlertCount>("/api/alerts/unread-count"),
  ]);

  return (
    <AppShell
      breadcrumb={[{ href: "/", label: "Dashboard" }, { label: "Evidence" }]}
      unreadCount={alertCount.unread_count}
      user={user}
    >
      <div className="mx-auto grid max-w-7xl gap-4">
        <section className="border border-border bg-panel p-3">
          <p className="font-mono text-[10px] uppercase text-amber">Evidence</p>
          <h1 className="mt-1 text-lg font-semibold">Evidence ledger</h1>
          <p className="mt-1 text-sm text-secondary">
            Source rows are shown with sanitized endpoint metadata and payload
            hashes. API keys and raw provider payloads are not displayed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] text-muted">
            {params.themeId ? <span>theme={params.themeId}</span> : null}
            {params.securityId ? (
              <span>security={params.securityId}</span>
            ) : null}
            {params.reasonCode ? <span>reason={params.reasonCode}</span> : null}
            {params.provider ? <span>provider={params.provider}</span> : null}
          </div>
        </section>

        <section className="overflow-x-auto border border-border bg-panel">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead className="font-mono text-[10px] uppercase text-muted">
              <tr className="border-b border-border-subtle">
                <th className="px-2 py-2 text-left">Provider</th>
                <th className="px-2 py-2 text-left">Theme</th>
                <th className="px-2 py-2 text-left">Ticker</th>
                <th className="px-2 py-2 text-left">Metric</th>
                <th className="px-2 py-2 text-left">Value</th>
                <th className="px-2 py-2 text-left">Reason</th>
                <th className="px-2 py-2 text-right">Impact</th>
                <th className="px-2 py-2 text-left">Fetched</th>
                <th className="px-2 py-2 text-left">Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className="border-b border-border-subtle hover:bg-row-hover"
                  key={row.evidence_id}
                >
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {row.provider}
                  </td>
                  <td className="px-2 py-1.5">
                    {row.theme ? (
                      <Link
                        className="text-cyan hover:text-amber"
                        href={`/themes/${row.theme.theme_slug}`}
                      >
                        {row.theme.source_theme_code ?? row.theme.theme_name}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {row.security ? (
                      <Link
                        className="text-cyan hover:text-amber"
                        href={`/tickers/${row.security.ticker}`}
                      >
                        {row.security.ticker}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-1.5">{row.metric_name}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {row.metric_value_text ??
                      (row.metric_value_num === null
                        ? "-"
                        : formatNumber(row.metric_value_num, 2))}
                    {row.metric_unit ? ` ${row.metric_unit}` : ""}
                  </td>
                  <td className="px-2 py-1.5">
                    <ReasonChip
                      code={row.reason_code}
                      securityId={row.security?.security_id}
                      themeId={row.theme?.theme_id}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {formatNumber(row.score_impact, 1)}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs text-muted">
                    {compactDateTime(row.fetched_at)}
                  </td>
                  <td className="max-w-44 truncate px-2 py-1.5 font-mono text-[10px] text-muted">
                    {row.source_payload_hash ?? "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-secondary"
                    colSpan={9}
                  >
                    No evidence rows match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
