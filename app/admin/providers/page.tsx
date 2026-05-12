import { AppShell } from "@/components/app-shell";
import { StateBadge } from "@/components/state-badge";
import { requirePageSession } from "@/lib/auth/server";
import { compactDateTime } from "@/lib/ui/format";
import { fetchInternalApi } from "@/lib/ui/api-client";
import type { ProviderHealthRow } from "@/lib/ui/types";

type AlertCount = {
  unread_count: number;
};

export default async function ProviderHealthPage() {
  const user = await requirePageSession();
  const [providers, alertCount] = await Promise.all([
    fetchInternalApi<ProviderHealthRow[]>("/api/admin/providers/health"),
    fetchInternalApi<AlertCount>("/api/alerts/unread-count"),
  ]);

  return (
    <AppShell
      breadcrumb={[
        { href: "/", label: "Dashboard" },
        { label: "Provider health" },
      ]}
      unreadCount={alertCount.unread_count}
      user={user}
    >
      <div className="mx-auto grid max-w-7xl gap-4">
        <section className="border border-border bg-panel p-3">
          <p className="font-mono text-[10px] uppercase text-amber">Admin</p>
          <h1 className="mt-1 text-lg font-semibold">Provider health</h1>
          <p className="mt-1 text-sm text-secondary">
            Latest provider calls from the observability table. Errors are
            sanitized and no request secrets are displayed.
          </p>
        </section>
        <section className="overflow-x-auto border border-border bg-panel">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="font-mono text-[10px] uppercase text-muted">
              <tr className="border-b border-border-subtle">
                <th className="px-2 py-2 text-left">Provider</th>
                <th className="px-2 py-2 text-left">Endpoint</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-left">Last success</th>
                <th className="px-2 py-2 text-left">Last failure</th>
                <th className="px-2 py-2 text-right">Latency</th>
                <th className="px-2 py-2 text-right">Rows</th>
                <th className="px-2 py-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((row) => (
                <tr
                  className="border-b border-border-subtle"
                  key={`${row.provider}:${row.endpoint}`}
                >
                  <td className="px-2 py-1.5 font-mono">{row.provider}</td>
                  <td className="px-2 py-1.5">{row.endpoint}</td>
                  <td className="px-2 py-1.5 text-center">
                    <StateBadge
                      state={
                        row.lastStatus === "HEALTHY"
                          ? "VALIDATED"
                          : row.lastStatus === "STALE"
                            ? "INSUFFICIENT_DATA"
                            : "REJECTED"
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs text-muted">
                    {compactDateTime(row.lastSuccessAt)}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs text-muted">
                    {compactDateTime(row.lastFailureAt)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {row.durationMs ?? "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {row.rowCount ?? "-"}
                  </td>
                  <td className="max-w-72 truncate px-2 py-1.5 text-secondary">
                    {row.sanitizedError ?? "-"}
                  </td>
                </tr>
              ))}
              {providers.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-secondary"
                    colSpan={8}
                  >
                    No provider calls have been recorded yet.
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
