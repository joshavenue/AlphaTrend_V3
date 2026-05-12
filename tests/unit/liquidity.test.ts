import { describe, expect, it } from "vitest";

import {
  detectRecentOfferingForms,
  scoreLiquidityDilutionFragility,
} from "@/lib/liquidity/scoring";
import type { LiquidityScoringInput } from "@/lib/liquidity/types";
import type { FundamentalPeriod } from "@/lib/fundamentals/types";

function quarter(
  periodEnd: string,
  input: Partial<FundamentalPeriod>,
): FundamentalPeriod {
  return {
    fiscalPeriod: "Q1",
    periodEnd,
    periodType: "quarter",
    source: "MERGED",
    ...input,
  };
}

function input(
  overrides: Partial<LiquidityScoringInput> = {},
): LiquidityScoringInput {
  return {
    asOfDate: new Date("2026-05-12T00:00:00.000Z"),
    averageDollarVolume20d: 50_000_000,
    averageVolume20d: 2_000_000,
    financialPeriods: [
      quarter("2026-03-31", {
        cashAndEquivalents: 500_000_000,
        dilutedShares: 100_000_000,
        freeCashFlow: 50_000_000,
        operatingCashFlow: 60_000_000,
        totalDebt: 100_000_000,
      }),
      quarter("2025-03-31", {
        dilutedShares: 100_000_000,
      }),
    ],
    marketCap: 5_000_000_000,
    metricDate: "2026-05-11",
    priceDataStale: false,
    submissions: [],
    ...overrides,
  };
}

describe("Phase 9 T6 liquidity, dilution, and fragility scoring", () => {
  it("core_liquid_low_dilution_name_has_normal_risk", () => {
    const result = scoreLiquidityDilutionFragility(input());

    expect(result.liquidityState).toBe("CORE_ELIGIBLE");
    expect(result.dilutionRiskState).toBe("LOW");
    expect(result.fragilityState).toBe("NORMAL_RISK");
    expect(result.score).toBe(0);
    expect(result.scoreDetail.reason_codes).toContain(
      "LIQUIDITY_CORE_ELIGIBLE",
    );
    expect(result.scoreDetail.reason_codes).toContain("DILUTION_LOW_RISK");
  });

  it("strong_liquidity_does_not_rescue_severe_share_dilution", () => {
    const result = scoreLiquidityDilutionFragility(
      input({
        financialPeriods: [
          quarter("2026-03-31", {
            cashAndEquivalents: 500_000_000,
            dilutedShares: 130_000_000,
            freeCashFlow: 50_000_000,
            totalDebt: 100_000_000,
          }),
          quarter("2025-03-31", {
            dilutedShares: 100_000_000,
          }),
        ],
      }),
    );

    expect(result.liquidityState).toBe("CORE_ELIGIBLE");
    expect(result.dilutionRiskState).toBe("SEVERE");
    expect(result.fragilityState).toBe("SEVERE_FRAGILITY");
    expect(result.scoreDetail.veto_flags).toContain("SEVERE_DILUTION");
    expect(result.scoreDetail.reason_codes).toContain("DILUTION_SEVERE");
  });

  it("recent_offering_form_creates_material_offering_veto", () => {
    const result = scoreLiquidityDilutionFragility(
      input({
        submissions: [
          {
            accessionNumber: "0000000000-26-000001",
            filingDate: "2026-04-15",
            form: "424B5",
          },
        ],
      }),
    );

    expect(result.dilutionRiskState).toBe("HIGH");
    expect(result.scoreDetail.veto_flags).toContain("RECENT_MATERIAL_OFFERING");
    expect(result.scoreDetail.reason_codes).toContain(
      "DILUTION_RECENT_OFFERING",
    );
  });

  it("illiquid_average_dollar_volume_gets_illiquid_veto", () => {
    const result = scoreLiquidityDilutionFragility(
      input({
        averageDollarVolume20d: 750_000,
        marketCap: 2_000_000_000,
      }),
    );

    expect(result.liquidityState).toBe("ILLIQUID");
    expect(result.fragilityState).toBe("SEVERE_FRAGILITY");
    expect(result.scoreDetail.veto_flags).toContain("ILLIQUID");
    expect(result.scoreDetail.reason_codes).toContain("LIQUIDITY_ILLIQUID");
  });

  it("cash_runway_under_warning_threshold_flags_fragility", () => {
    const result = scoreLiquidityDilutionFragility(
      input({
        financialPeriods: [
          quarter("2026-03-31", {
            cashAndEquivalents: 100_000_000,
            dilutedShares: 100_000_000,
            freeCashFlow: -35_000_000,
            totalDebt: 150_000_000,
          }),
          quarter("2025-03-31", {
            dilutedShares: 100_000_000,
          }),
        ],
      }),
    );

    expect(result.scoreDetail.metrics.cashRunwayMonths).toBeCloseTo(8.57, 1);
    expect(result.scoreDetail.reason_codes).toContain(
      "FRAGILITY_CASH_RUNWAY_LOW",
    );
    expect(result.score).toBeGreaterThan(0);
  });

  it("missing_market_cap_or_dollar_volume_is_insufficient_data", () => {
    const result = scoreLiquidityDilutionFragility(
      input({
        averageDollarVolume20d: undefined,
        marketCap: undefined,
      }),
    );

    expect(result.liquidityState).toBe("INSUFFICIENT_DATA");
    expect(result.scoreDetail.reason_codes).toContain("DATA_MISSING");
    expect(result.evidenceDetails).toContainEqual(
      expect.objectContaining({
        metricName: "t6.required_data_coverage",
      }),
    );
  });

  it("offering_detector_ignores_old_offering_forms", () => {
    const offerings = detectRecentOfferingForms(
      [
        {
          filingDate: "2025-01-01",
          form: "S-3",
        },
        {
          filingDate: "2026-04-01",
          form: "10-Q",
        },
      ],
      new Date("2026-05-12T00:00:00.000Z"),
    );

    expect(offerings).toHaveLength(0);
  });
});
