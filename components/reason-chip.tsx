import Link from "next/link";

import { getReasonMeta, severityGlyph } from "@/lib/ui/reasons";

type ReasonChipProps = {
  code?: string | null;
  securityId?: string | null;
  themeId?: string | null;
};

function severityClass(severity: string) {
  switch (severity) {
    case "POSITIVE":
      return "border-positive text-positive";
    case "CAUTION":
      return "border-caution text-caution";
    case "WARNING":
      return "border-warning text-warning";
    case "BLOCKER":
      return "border-negative text-negative";
    default:
      return "border-border text-secondary";
  }
}

export function ReasonChip({ code, securityId, themeId }: ReasonChipProps) {
  const reason = getReasonMeta(code);
  const params = new URLSearchParams();

  if (themeId) {
    params.set("themeId", themeId);
  }

  if (securityId) {
    params.set("securityId", securityId);
  }

  if (code) {
    params.set("reasonCode", code);
  }

  return (
    <Link
      className={`inline-flex items-center gap-1 border px-2 py-1 text-xs hover:border-amber hover:text-amber ${severityClass(
        reason.severity,
      )}`}
      href={`/evidence?${params.toString()}`}
      title={reason.description}
    >
      <span className="font-mono">{severityGlyph(reason.severity)}</span>
      <span>{reason.displayLabel}</span>
    </Link>
  );
}
