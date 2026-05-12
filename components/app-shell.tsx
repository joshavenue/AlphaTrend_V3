import { Bell, BriefcaseBusiness, ChevronDown } from "lucide-react";
import Link from "next/link";

import type { AuthUser } from "@/lib/auth/session";
import { TickerSearch } from "@/components/ticker-search";

type AppShellProps = {
  breadcrumb?: {
    href?: string;
    label: string;
  }[];
  children: React.ReactNode;
  unreadCount?: number;
  user: AuthUser;
};

export function AppShell({
  breadcrumb = [{ href: "/", label: "Dashboard" }],
  children,
  unreadCount = 0,
  user,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:border focus:border-amber focus:bg-panel focus:px-3 focus:py-2"
        href="#main"
      >
        Skip to main
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="flex min-h-10 flex-wrap items-center gap-3 px-4 py-1">
          <Link className="font-mono text-sm font-semibold text-amber" href="/">
            ALPHATREND V3
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              className="px-2 py-1 text-secondary hover:text-amber"
              href="/"
            >
              Dashboard
            </Link>
            <Link
              className="inline-flex items-center gap-1 px-2 py-1 text-secondary hover:text-amber"
              href="/alerts"
            >
              <Bell aria-hidden="true" className="h-4 w-4" />
              Alerts
              {unreadCount > 0 ? (
                <span className="bg-amber px-1 font-mono text-[10px] text-inverse">
                  {unreadCount}
                </span>
              ) : null}
            </Link>
            <Link
              className="px-2 py-1 text-secondary hover:text-amber"
              href="/evidence"
            >
              Evidence
            </Link>
          </nav>
          <div className="min-w-56 flex-1 md:flex-none">
            <TickerSearch />
          </div>
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1 text-sm text-secondary hover:text-amber">
              <BriefcaseBusiness aria-hidden="true" className="h-4 w-4" />
              Admin
              <ChevronDown aria-hidden="true" className="h-3 w-3" />
            </summary>
            <div className="absolute right-0 mt-2 grid w-44 border border-border bg-panel text-sm">
              <Link
                className="px-3 py-2 hover:bg-row-hover"
                href="/admin/providers"
              >
                Provider health
              </Link>
              <Link className="px-3 py-2 hover:bg-row-hover" href="/admin/jobs">
                Job runs
              </Link>
            </div>
          </details>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-44 truncate text-xs text-muted md:inline">
              {user.email}
            </span>
            <form action="/api/auth/sign-out" method="post">
              <button
                className="border border-border px-2 py-1 text-xs text-secondary hover:border-amber hover:text-amber"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-border-subtle px-4 py-1 font-mono text-[10px] text-muted">
          {breadcrumb.map((item, index) => (
            <span key={`${item.label}-${index}`}>
              {index > 0 ? " / " : ""}
              {item.href ? (
                <Link className="hover:text-amber" href={item.href}>
                  {item.label}
                </Link>
              ) : (
                item.label
              )}
            </span>
          ))}
        </div>
      </header>
      <main className="px-4 py-4" id="main">
        {children}
      </main>
    </div>
  );
}
