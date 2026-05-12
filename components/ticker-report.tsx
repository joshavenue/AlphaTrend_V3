import Link from "next/link";

import { ReasonChip } from "@/components/reason-chip";
import { StateBadge } from "@/components/state-badge";
import { WatchToggle } from "@/components/watch-toggle";
import { compactDateTime, formatNumber, titleCaseState } from "@/lib/ui/format";
import type { TickerReportView, WatchlistItemView } from "@/lib/ui/types";

const STACK = [
  ["T1 Exposure", "T1_EXPOSURE_PURITY"],
  ["T3 Fundamentals", "T3_FUNDAMENTALS"],
  ["T4 Price / Valuation", "T4_PRICE_VALUATION_PARTICIPATION"],
  ["T6 Liquidity / Dilution", "T6_LIQUIDITY_DILUTION_FRAGILITY"],
  ["T8 Expression", "T8_EXPRESSION_DECISION"],
] as const;

function watchItemForReport(
  watchlist: WatchlistItemView[],
  themeId: string | null,
  securityId: string,
) {
  return watchlist.find(
    (item) =>
      item.watch_type === (themeId ? "TICKER_THEME_PAIR" : "TICKER_GLOBAL") &&
      item.security?.security_id === securityId &&
      (themeId ? item.theme?.theme_id === themeId : true) &&
      item.status === "ACTIVE",
  );
}

function allReasonCodes(report: TickerReportView["theme_reports"][number]) {
  const codes = new Set<string>();

  if (report.candidate.top_pass_reason) {
    codes.add(report.candidate.top_pass_reason);
  }

  if (report.candidate.top_fail_reason) {
    codes.add(report.candidate.top_fail_reason);
  }

  for (const code of report.candidate.rejection_reason_codes) {
    codes.add(code);
  }

  for (const signal of Object.values(report.candidate.signal_states)) {
    for (const code of signal?.reason_codes ?? []) {
      codes.add(code);
    }
  }

  return [...codes].slice(0, 10);
}

export function TickerReport({
  report,
  scopedThemeSlug,
  watchlist,
}: {
  report: TickerReportView;
  scopedThemeSlug?: string;
  watchlist: WatchlistItemView[];
}) {
  if (report.theme_reports.length === 0) {
    return (
      <section className="border border-caution bg-caution-bg p-3 text-sm text-caution">
        {report.security.ticker} is in the security master, but it is not mapped
        to this theme.
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {report.theme_reports.map((themeReport) => {
        const watched = watchItemForReport(
          watchlist,
          themeReport.theme.theme_id,
          report.security.security_id,
        );

        return (
          <article
            className="grid gap-4 border border-border bg-panel p-3"
            key={themeReport.theme.theme_id}
          >
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase text-amber">
                  Ticker report
                </p>
                <h1 className="mt-1 font-mono text-xl font-semibold">
                  {report.security.ticker}
                  <span className="ml-2 font-sans text-base text-secondary">
                    {report.security.company_name}
                  </span>
                </h1>
                <p className="mt-1 text-sm text-secondary">
                  Theme:{" "}
                  <Link
                    className="text-cyan hover:text-amber"
                    href={`/themes/${themeReport.theme.theme_slug}`}
                  >
                    {themeReport.theme.theme_name}
                  </Link>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StateBadge state={themeReport.candidate.final_state} />
                <WatchToggle
                  initialWatchlistItemId={watched?.watchlist_item_id}
                  label={`${report.security.ticker} / ${themeReport.theme.theme_name}`}
                  securityId={report.security.security_id}
                  themeId={themeReport.theme.theme_id}
                  watchType="TICKER_THEME_PAIR"
                />
              </div>
            </header>

            <section className="grid gap-2 border border-border-subtle p-3">
              <h2 className="text-sm font-semibold text-amber">State stack</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="font-mono text-[10px] uppercase text-muted">
                    <tr className="border-b border-border-subtle">
                      <th className="px-2 py-2 text-left">Layer</th>
                      <th className="px-2 py-2 text-center">State</th>
                      <th className="px-2 py-2 text-right">Score</th>
                      <th className="px-2 py-2 text-left">Computed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STACK.map(([label, layer]) => {
                      const state = themeReport.candidate.signal_states[layer];
                      const score = themeReport.candidate.signal_scores[layer];

                      return (
                        <tr
                          className="border-b border-border-subtle"
                          key={layer}
                        >
                          <td className="px-2 py-1.5 text-secondary">
                            {label}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <StateBadge state={state?.state} />
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {formatNumber(score?.score, 1)}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-xs text-muted">
                            {compactDateTime(
                              state?.computed_at ?? score?.computed_at,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border border-border-subtle px-3 py-2 text-sm text-muted">
                T5 Ownership Flow and T7 Base Rate are reserved for V3.1 and
                contribute 0 points today.
              </div>
            </section>

            <section className="grid gap-2">
              <h2 className="text-sm font-semibold text-amber">Reasons</h2>
              <div className="flex flex-wrap gap-1">
                {allReasonCodes(themeReport).map((code) => (
                  <ReasonChip
                    code={code}
                    key={code}
                    securityId={report.security.security_id}
                    themeId={themeReport.theme.theme_id}
                  />
                ))}
              </div>
              <div className="font-mono text-xs text-muted">
                Final: {titleCaseState(themeReport.candidate.final_state)} /
                priority{" "}
                {formatNumber(themeReport.candidate.review_priority_score, 1)} /
                last scan{" "}
                {compactDateTime(themeReport.candidate.last_scanned_at)}
              </div>
            </section>

            <section className="grid gap-2">
              <h2 className="text-sm font-semibold text-amber">
                Invalidation rules
              </h2>
              <pre className="max-h-48 overflow-auto border border-border-subtle bg-background p-3 font-mono text-xs text-secondary">
                {JSON.stringify(themeReport.invalidation_rules, null, 2)}
              </pre>
            </section>

            <section className="grid gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-amber">
                  Evidence summary
                </h2>
                <Link
                  className="font-mono text-xs text-cyan hover:text-amber"
                  href={`/evidence?themeId=${themeReport.theme.theme_id}&securityId=${report.security.security_id}`}
                >
                  Open evidence
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] border-collapse text-sm">
                  <thead className="font-mono text-[10px] uppercase text-muted">
                    <tr className="border-b border-border-subtle">
                      <th className="px-2 py-2 text-left">Provider</th>
                      <th className="px-2 py-2 text-left">Metric</th>
                      <th className="px-2 py-2 text-left">Value</th>
                      <th className="px-2 py-2 text-left">Reason</th>
                      <th className="px-2 py-2 text-left">Fetched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.evidence_summary.slice(0, 12).map((row) => (
                      <tr
                        className="border-b border-border-subtle"
                        key={row.evidence_id}
                      >
                        <td className="px-2 py-1.5 font-mono text-xs">
                          {row.provider}
                        </td>
                        <td className="px-2 py-1.5">{row.metric_name}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">
                          {row.metric_value_text ?? row.metric_value_num ?? "-"}
                        </td>
                        <td className="px-2 py-1.5">
                          <ReasonChip
                            code={row.reason_code}
                            securityId={report.security.security_id}
                            themeId={themeReport.theme.theme_id}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-xs text-muted">
                          {compactDateTime(row.fetched_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {!scopedThemeSlug ? null : (
              <Link
                className="font-mono text-xs text-cyan hover:text-amber"
                href={`/tickers/${report.security.ticker}`}
              >
                Open cross-theme report
              </Link>
            )}
          </article>
        );
      })}
    </div>
  );
}
