"use client";

import { useState } from "react";

type AlertActionsProps = {
  alertId: string;
  dismissedAt?: string | null;
  readAt?: string | null;
};

async function postAlertAction(alertId: string, action: "dismiss" | "read") {
  const response = await fetch(`/api/alerts/${alertId}/${action}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Alert ${action} failed.`);
  }
}

export function AlertActions({
  alertId,
  dismissedAt,
  readAt,
}: AlertActionsProps) {
  const [busyAction, setBusyAction] = useState<"dismiss" | "read" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "dismiss" | "read") {
    setBusyAction(action);
    setError(null);

    try {
      await postAlertAction(alertId, action);
      window.location.reload();
    } catch {
      setError("Unable to update alert.");
      setBusyAction(null);
    }
  }

  if (dismissedAt) {
    return (
      <span className="font-mono text-[10px] uppercase text-muted">
        Dismissed
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!readAt ? (
        <button
          className="border border-border px-2 py-1 font-mono text-[10px] uppercase text-secondary hover:border-amber hover:text-amber disabled:opacity-60"
          disabled={busyAction !== null}
          onClick={() => void handleAction("read")}
          type="button"
        >
          {busyAction === "read" ? "Marking" : "Mark read"}
        </button>
      ) : null}
      <button
        className="border border-border px-2 py-1 font-mono text-[10px] uppercase text-secondary hover:border-amber hover:text-amber disabled:opacity-60"
        disabled={busyAction !== null}
        onClick={() => void handleAction("dismiss")}
        type="button"
      >
        {busyAction === "dismiss" ? "Dismissing" : "Dismiss"}
      </button>
      {error ? <span className="text-xs text-negative">{error}</span> : null}
    </div>
  );
}
