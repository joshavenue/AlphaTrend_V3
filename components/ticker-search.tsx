"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SearchResult = {
  company_name: string;
  exchange: string | null;
  security_id: string;
  ticker: string;
  universe_bucket: string | null;
};

export function TickerSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();

    if (!q) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/securities/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((envelope) => {
          setResults(envelope.ok ? envelope.data : []);
          setSearched(true);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults([]);
            setSearched(true);
          }
        })
        .finally(() => setLoading(false));
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function openTicker(ticker: string) {
    setQuery("");
    setResults([]);
    router.push(`/tickers/${ticker}`);
  }

  return (
    <div className="relative w-full md:w-72">
      <div className="flex h-8 items-center gap-2 border border-border bg-input px-2 focus-within:border-border-strong">
        <Search aria-hidden="true" className="h-4 w-4 text-secondary" />
        <input
          aria-label="Search security master tickers"
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none"
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);

            if (!next.trim()) {
              setResults([]);
              setSearched(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) {
              openTicker(query.trim().toUpperCase());
            }
          }}
          placeholder="Search ticker..."
          value={query}
        />
      </div>

      {query.trim() ? (
        <div className="absolute left-0 right-0 top-9 z-50 border border-border bg-panel">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted">Searching...</div>
          ) : null}
          {!loading && results.length === 0 && searched ? (
            <div className="px-3 py-2 text-xs text-muted">
              Not in current universe
            </div>
          ) : null}
          {results.map((result) => (
            <button
              className="grid w-full grid-cols-[5rem_1fr] gap-2 border-b border-border-subtle px-3 py-2 text-left text-xs hover:bg-row-hover"
              key={result.security_id}
              onClick={() => openTicker(result.ticker)}
              type="button"
            >
              <span className="font-mono text-amber">{result.ticker}</span>
              <span className="truncate text-secondary">
                {result.company_name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
