import { AppShell } from "@/components/app-shell";
import { TickerReport } from "@/components/ticker-report";
import { requirePageSession } from "@/lib/auth/server";
import { fetchInternalApi } from "@/lib/ui/api-client";
import type { TickerReportView, WatchlistItemView } from "@/lib/ui/types";

type AlertCount = {
  unread_count: number;
};

type CrossThemeTickerPageProps = {
  params: Promise<{
    ticker: string;
  }>;
};

export default async function CrossThemeTickerPage({
  params,
}: CrossThemeTickerPageProps) {
  const { ticker } = await params;
  const user = await requirePageSession();
  const [report, alertCount, watchlist] = await Promise.all([
    fetchInternalApi<TickerReportView>(`/api/tickers/${ticker}/report`),
    fetchInternalApi<AlertCount>("/api/alerts/unread-count"),
    fetchInternalApi<WatchlistItemView[]>("/api/watchlist?limit=200"),
  ]);

  return (
    <AppShell
      breadcrumb={[
        { href: "/", label: "Dashboard" },
        { label: report.security.ticker },
      ]}
      unreadCount={alertCount.unread_count}
      user={user}
    >
      <div className="mx-auto max-w-7xl">
        <TickerReport report={report} watchlist={watchlist} />
      </div>
    </AppShell>
  );
}
