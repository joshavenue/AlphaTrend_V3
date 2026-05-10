import type { ProviderResult } from "@/lib/providers/types";

export type SmokeResult = ProviderResult<unknown> & {
  evidenceWritten: number;
};

export type SmokeRunClassification = {
  errorSummary?: string;
  evidenceWritten: number;
  exitCode: 0 | 1;
  failedConfiguredCalls: SmokeResult[];
  jobStatus: "PARTIAL" | "SUCCEEDED";
  licenseBlockedCalls: SmokeResult[];
  providerCalls: number;
  rowsRead: number;
};

export function classifySmokeRun(
  results: SmokeResult[],
): SmokeRunClassification {
  const failedConfiguredCalls = results.filter(
    (result) =>
      !result.ok &&
      result.status !== "UNCONFIGURED" &&
      result.status !== "LICENSE_BLOCKED",
  );
  const licenseBlockedCalls = results.filter(
    (result) => result.status === "LICENSE_BLOCKED",
  );
  const rowsRead = results.reduce(
    (sum, result) => sum + (result.rowCount ?? 0),
    0,
  );
  const evidenceWritten = results.reduce(
    (sum, result) => sum + result.evidenceWritten,
    0,
  );
  const providerCalls = results.filter(
    (result) => result.status !== "UNCONFIGURED",
  ).length;
  const errorSummary =
    failedConfiguredCalls.length || licenseBlockedCalls.length
      ? [
          failedConfiguredCalls.length
            ? `${failedConfiguredCalls.length} provider calls failed`
            : undefined,
          licenseBlockedCalls.length
            ? `${licenseBlockedCalls.length} provider calls license-blocked`
            : undefined,
        ]
          .filter(Boolean)
          .join("; ")
      : undefined;

  return {
    errorSummary,
    evidenceWritten,
    exitCode:
      failedConfiguredCalls.length || licenseBlockedCalls.length ? 1 : 0,
    failedConfiguredCalls,
    jobStatus:
      failedConfiguredCalls.length || licenseBlockedCalls.length
        ? "PARTIAL"
        : "SUCCEEDED",
    licenseBlockedCalls,
    providerCalls,
    rowsRead,
  };
}
