import { describe, expect, it } from "vitest";

import {
  classifySmokeRun,
  type SmokeResult,
} from "@/lib/providers/smoke-summary";

function smokeResult(input: Partial<SmokeResult> = {}): SmokeResult {
  return {
    durationMs: 1,
    endpoint: "test_endpoint",
    evidenceWritten: 0,
    fetchedAt: new Date(0).toISOString(),
    ok: false,
    provider: "SEC",
    requestHash: "request-hash",
    status: "UNCONFIGURED",
    ...input,
  } as SmokeResult;
}

describe("provider smoke classification", () => {
  it("does not fail the CLI for unconfigured providers", () => {
    const summary = classifySmokeRun([
      smokeResult({ provider: "FMP", status: "UNCONFIGURED" }),
    ]);

    expect(summary.exitCode).toBe(0);
    expect(summary.jobStatus).toBe("SUCCEEDED");
    expect(summary.providerCalls).toBe(0);
    expect(summary.errorSummary).toBeUndefined();
  });

  it("fails the CLI and marks the job partial for license-blocked providers", () => {
    const summary = classifySmokeRun([
      smokeResult({
        httpStatus: 403,
        provider: "FMP",
        status: "LICENSE_BLOCKED",
      }),
    ]);

    expect(summary.exitCode).toBe(1);
    expect(summary.jobStatus).toBe("PARTIAL");
    expect(summary.providerCalls).toBe(1);
    expect(summary.errorSummary).toBe("1 provider calls license-blocked");
  });

  it("fails the CLI for configured provider failures", () => {
    const summary = classifySmokeRun([
      smokeResult({
        provider: "SEC",
        sanitizedError: "HTTP 500 Internal Server Error",
        status: "FAILED",
      }),
    ]);

    expect(summary.exitCode).toBe(1);
    expect(summary.jobStatus).toBe("PARTIAL");
    expect(summary.errorSummary).toBe("1 provider calls failed");
  });
});
