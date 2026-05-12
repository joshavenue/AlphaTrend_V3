import { AppShell } from "@/components/app-shell";
import { JobTriggerButton } from "@/components/job-trigger-button";
import { StateBadge } from "@/components/state-badge";
import { requirePageSession } from "@/lib/auth/server";
import { compactDateTime } from "@/lib/ui/format";
import { fetchInternalApi } from "@/lib/ui/api-client";
import type { JobRunRow } from "@/lib/ui/types";

type AlertCount = {
  unread_count: number;
};

export default async function JobsPage() {
  const user = await requirePageSession();
  const [jobs, alertCount] = await Promise.all([
    fetchInternalApi<JobRunRow[]>("/api/admin/jobs?limit=100"),
    fetchInternalApi<AlertCount>("/api/alerts/unread-count"),
  ]);

  return (
    <AppShell
      breadcrumb={[{ href: "/", label: "Dashboard" }, { label: "Job runs" }]}
      unreadCount={alertCount.unread_count}
      user={user}
    >
      <div className="mx-auto grid max-w-7xl gap-4">
        <section className="flex flex-col gap-3 border border-border bg-panel p-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase text-amber">Admin</p>
            <h1 className="mt-1 text-lg font-semibold">Job runs</h1>
            <p className="mt-1 text-sm text-secondary">
              Worker history, partial runs, and manual dashboard snapshot
              refresh.
            </p>
          </div>
          <JobTriggerButton label="Run snapshot refresh" />
        </section>
        <section className="overflow-x-auto border border-border bg-panel">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="font-mono text-[10px] uppercase text-muted">
              <tr className="border-b border-border-subtle">
                <th className="px-2 py-2 text-left">Job type</th>
                <th className="px-2 py-2 text-left">Scope</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-left">Started</th>
                <th className="px-2 py-2 text-left">Finished</th>
                <th className="px-2 py-2 text-right">Read</th>
                <th className="px-2 py-2 text-right">Written</th>
                <th className="px-2 py-2 text-right">Calls</th>
                <th className="px-2 py-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  className="border-b border-border-subtle"
                  key={job.job_run_id}
                >
                  <td className="px-2 py-1.5 font-mono">{job.job_type}</td>
                  <td className="px-2 py-1.5 font-mono text-xs text-muted">
                    {job.scope_type ?? "-"} {job.scope_id ?? ""}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <StateBadge
                      state={
                        job.status === "SUCCEEDED"
                          ? "VALIDATED"
                          : job.status === "PARTIAL"
                            ? "INSUFFICIENT_DATA"
                            : job.status === "FAILED"
                              ? "REJECTED"
                              : "IMPROVING"
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {compactDateTime(job.started_at)}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {compactDateTime(job.finished_at)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {job.rows_read}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {job.rows_written}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {job.provider_calls}
                  </td>
                  <td className="max-w-72 truncate px-2 py-1.5 text-secondary">
                    {job.error_summary ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
