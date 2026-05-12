"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

type JobTriggerButtonProps = {
  jobType?: "THEME_SCAN" | "THEME_SNAPSHOT";
  label?: string;
  scopeId?: string;
  scopeType?: "theme";
};

export function JobTriggerButton({
  jobType = "THEME_SCAN",
  label = "Refresh snapshot",
  scopeId,
  scopeType,
}: JobTriggerButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function trigger() {
    if (pending) {
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/jobs/${jobType}`, {
        body: JSON.stringify({
          scopeId,
          scopeType,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const envelope = await response.json();

      if (!envelope.ok) {
        setMessage(envelope.error.code);
        return;
      }

      setMessage(
        `${envelope.data.status}: ${envelope.data.snapshots_built} snapshot(s)`,
      );
    } catch {
      setMessage("INTERNAL_ERROR");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="inline-flex h-8 items-center gap-2 border border-border px-2 text-xs text-secondary hover:border-amber hover:text-amber disabled:opacity-50"
        disabled={pending}
        onClick={trigger}
        type="button"
      >
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        {pending ? "Running..." : label}
      </button>
      {message ? (
        <span className="font-mono text-[10px] text-muted">{message}</span>
      ) : null}
    </span>
  );
}
