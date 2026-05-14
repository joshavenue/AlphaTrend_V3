import { describe, expect, it } from "vitest";

import { T5_REASON_CODES, T7_REASON_CODES } from "@/lib/advanced/constants";
import { scoreBaseRate, scoreOwnershipFlow } from "@/lib/advanced/scoring";
import type { PriceBarForBaseRate } from "@/lib/advanced/types";
import { getReasonMeta } from "@/lib/ui/reasons";

function bars(count: number, dailyReturn: number): PriceBarForBaseRate[] {
  let close = 100;

  return Array.from({ length: count }, (_, index) => {
    close *= 1 + dailyReturn;

    return {
      close,
      date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
      high: close * 1.01,
      low: close * 0.99,
    };
  });
}

describe("Phase 17 advanced-layer scoring", () => {
  it("scores institutional accumulation without implying final-decision contribution", () => {
    const result = scoreOwnershipFlow({
      delayedData: true,
      etfFlowEligible: true,
      etfWeight: 2.5,
      holderCount: 72,
      ownershipTrend: "INCREASING",
      reportDate: "2026-03-31",
    });

    expect(result.flowState).toBe("INSTITUTIONAL_ACCUMULATION");
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.reasonCodes).toContain(
      T5_REASON_CODES.FLOW_INSTITUTIONAL_ACCUMULATION,
    );
    expect(result.reasonCodes).toContain(T5_REASON_CODES.FLOW_13F_DELAYED_DATA);
  });

  it("keeps license-blocked ownership or flow context insufficient", () => {
    const result = scoreOwnershipFlow({
      delayedData: true,
      licenseRestricted: true,
    });

    expect(result.flowState).toBe("INSUFFICIENT_DATA");
    expect(result.score).toBe(0);
    expect(result.reasonCodes).toContain(T5_REASON_CODES.FLOW_LICENSE_REQUIRED);
  });

  it("returns low-sample warning before base-rate context can look supportive", () => {
    const result = scoreBaseRate(bars(180, 0.002));

    expect(result.baseRateState).toBe("LOW_SAMPLE_WARNING");
    expect(result.score).toBe(0);
    expect(result.reasonCodes).toContain(
      T7_REASON_CODES.BASE_RATE_LOW_SAMPLE_WARNING,
    );
  });

  it("scores supportive base-rate context only with enough analog samples", () => {
    const result = scoreBaseRate(bars(500, 0.0013));

    expect(result.baseRateState).toBe("SUPPORTIVE");
    expect(result.sampleSize).toBeGreaterThanOrEqual(30);
    expect(result.reasonCodes).toContain(T7_REASON_CODES.BASE_RATE_SUPPORTIVE);
    expect(result.reasonCodes).toContain(
      T7_REASON_CODES.BASE_RATE_SURVIVORSHIP_WARNING,
    );
  });

  it("has UI metadata for emitted T5 and T7 reason codes", () => {
    for (const code of [
      T5_REASON_CODES.FLOW_ETF_ELIGIBLE,
      T5_REASON_CODES.FLOW_LICENSE_REQUIRED,
      T7_REASON_CODES.BASE_RATE_LOW_SAMPLE_WARNING,
      T7_REASON_CODES.BASE_RATE_SURVIVORSHIP_WARNING,
    ]) {
      expect(getReasonMeta(code).displayLabel).not.toBe("Unrecognized reason");
    }
  });
});
