import { AppShell } from "@/components/app-shell";
import { TickerReport } from "@/components/ticker-report";
import { requirePageSession } from "@/lib/auth/server";
import { fetchInternalApi } from "@/lib/ui/api-client";
import type { TickerReportView, WatchlistItemView } from "@/lib/ui/types";

type AlertCount = {
  unread_count: number;
};

type ScopedTickerPageProps = {
  params: Promise<{
    themeSlug: string;
    ticker: string;
  }>;
};

export default async function ScopedTickerPage({
  params,
}: ScopedTickerPageProps) {
  const { themeSlug, ticker } = await params;
  const user = await requirePageSession();
  const [report, alertCount, watchlist] = await Promise.all([
    fetchInternalApi<TickerReportView>(
      `/api/tickers/${ticker}/report?themeSlug=${themeSlug}`,
    ),
    fetchInternalApi<AlertCount>("/api/alerts/unread-count"),
    fetchInternalApi<WatchlistItemView[]>("/api/watchlist?limit=200"),
  ]);

  return (
    <AppShell
      breadcrumb={[
        { href: "/", label: "Dashboard" },
        { href: `/themes/${themeSlug}`, label: themeSlug },
        { label: report.security.ticker },
      ]}
      unreadCount={alertCount.unread_count}
      user={user}
    >
      <div className="mx-auto max-w-7xl">
        <TickerReport
          report={report}
          scopedThemeSlug={themeSlug}
          watchlist={watchlist}
        />
      </div>
    </AppShell>
  );
}
