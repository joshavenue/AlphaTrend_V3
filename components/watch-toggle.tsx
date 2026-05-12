"use client";

import { Bookmark } from "lucide-react";
import { useState } from "react";

type WatchToggleProps = {
  initialWatchlistItemId?: string | null;
  label: string;
  securityId?: string | null;
  themeCandidateId?: string | null;
  themeId?: string | null;
  watchType: "THEME" | "TICKER_THEME_PAIR" | "TICKER_GLOBAL";
};

export function WatchToggle({
  initialWatchlistItemId,
  label,
  securityId,
  themeCandidateId,
  themeId,
  watchType,
}: WatchToggleProps) {
  const [watchlistItemId, setWatchlistItemId] = useState(
    initialWatchlistItemId ?? null,
  );
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      if (watchlistItemId) {
        const response = await fetch(`/api/watchlist/${watchlistItemId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          setWatchlistItemId(null);
        }
      } else {
        const response = await fetch("/api/watchlist", {
          body: JSON.stringify({
            securityId,
            themeCandidateId,
            themeId,
            watchType,
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        });
        const envelope = await response.json();

        if (envelope.ok) {
          setWatchlistItemId(envelope.data.watchlistItemId);
        }
      }
    } finally {
      setPending(false);
    }
  }

  const watched = Boolean(watchlistItemId);

  return (
    <button
      aria-label={watched ? `Remove ${label} from watchlist` : `Watch ${label}`}
      className={`inline-flex h-7 w-7 items-center justify-center border ${
        watched
          ? "border-amber text-amber"
          : "border-border text-secondary hover:border-amber hover:text-amber"
      } disabled:opacity-50`}
      disabled={pending}
      onClick={toggle}
      title={watched ? "Watching" : "Add to monitor list"}
      type="button"
    >
      <Bookmark
        aria-hidden="true"
        className={watched ? "h-4 w-4 fill-current" : "h-4 w-4"}
      />
    </button>
  );
}
