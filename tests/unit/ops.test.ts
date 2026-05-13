import { describe, expect, it } from "vitest";

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
      ]),
    ).toMatchObject({
      candidateIncludeFmp: false,
      demandProvider: "EIA",
      exposureIncludeFmp: false,
      exposureIncludeSec: false,
      fundamentalsIncludeFmp: false,
      fundamentalsIncludeSec: false,
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
});
