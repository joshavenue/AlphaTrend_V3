import { describe, expect, it } from "vitest";

import { evaluateProviderSmokeGate } from "@/lib/ops/provider-smoke-gate";
import { parseDemandJobArgs } from "@/scripts/demand-job";
import { parseThemeScanArgs } from "@/scripts/theme-scan";

describe("Phase 16 operational command parsing", () => {
  it("parses a bounded full theme scan with provider overrides", () => {
    expect(
      parseThemeScanArgs([
        "--theme",
        "T001",
        "--fmp=off",
        "--massive=off",
        "--sec=off",
        "--include-demand",
        "--demand-provider=EIA",
        "--advanced=off",
      ]),
    ).toMatchObject({
      candidateIncludeFmp: false,
      demandProvider: "EIA",
      exposureIncludeFmp: false,
      exposureIncludeSec: false,
      fundamentalsIncludeFmp: false,
      fundamentalsIncludeSec: false,
      includeAdvanced: false,
      includeDemand: true,
      liquidityIncludeFmp: false,
      liquidityIncludeMassive: false,
      liquidityIncludeSec: false,
      priceIncludeFmp: false,
      priceIncludeMassive: false,
      themeRef: "T001",
    });
  });

  it("keeps layer-specific overrides narrower than global toggles", () => {
    expect(
      parseThemeScanArgs([
        "--all",
        "--price-massive=off",
        "--liquidity-sec=off",
        "--manual-seeds=off",
        "--demand=off",
      ]),
    ).toMatchObject({
      candidateIncludeManualSeeds: false,
      includeDemand: false,
      liquidityIncludeSec: false,
      priceIncludeMassive: false,
      themeRef: undefined,
    });
  });

  it("parses demand refresh with snapshot and alert follow-up controls", () => {
    expect(
      parseDemandJobArgs([
        "--theme=T004",
        "--provider",
        "EIA",
        "--snapshots=off",
        "--alerts=off",
      ]),
    ).toMatchObject({
      includeAlerts: false,
      includeSnapshots: false,
      provider: "EIA",
      themeRef: "T004",
    });
  });

  it("requires a fresh successful provider smoke before scheduled scans", () => {
    const now = new Date("2026-05-14T00:00:00.000Z");

    expect(
      evaluateProviderSmokeGate(
        {
          errorSummary: null,
          finishedAt: new Date("2026-05-13T21:30:00.000Z"),
          jobRunId: "smoke-green",
          startedAt: new Date("2026-05-13T21:29:00.000Z"),
          status: "SUCCEEDED",
        },
        now,
        { maxAgeMinutes: 180 },
      ),
    ).toMatchObject({
      ok: true,
    });

    expect(
      evaluateProviderSmokeGate(
        {
          errorSummary: "1 provider calls failed",
          finishedAt: new Date("2026-05-13T21:30:00.000Z"),
          jobRunId: "smoke-partial",
          startedAt: new Date("2026-05-13T21:29:00.000Z"),
          status: "PARTIAL",
        },
        now,
        { maxAgeMinutes: 180 },
      ),
    ).toMatchObject({
      ok: false,
      reasonCode: "PROVIDER_SMOKE_NOT_GREEN",
    });

    expect(
      evaluateProviderSmokeGate(
        {
          errorSummary: null,
          finishedAt: new Date("2026-05-13T20:00:00.000Z"),
          jobRunId: "smoke-stale",
          startedAt: new Date("2026-05-13T19:59:00.000Z"),
          status: "SUCCEEDED",
        },
        now,
        { maxAgeMinutes: 180 },
      ),
    ).toMatchObject({
      ok: false,
      reasonCode: "PROVIDER_SMOKE_STALE",
    });
  });
});
