import { describe, expect, it } from "vitest";

import { DEMAND_REASON_CODES } from "@/lib/demand/constants";
import {
  DEMAND_FEED_REGISTRY,
  phase14RegistryCoverage,
} from "@/lib/demand/registry";
import { scoreEconomicDemand } from "@/lib/demand/scoring";

function feeds(themeCode: string) {
  return DEMAND_FEED_REGISTRY.filter((feed) => feed.themeCode === themeCode);
}

describe("Phase 14 economic demand proof", () => {
  it("registers demand feeds for every MVP theme", () => {
    expect(phase14RegistryCoverage()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeds: expect.any(Number),
          themeCode: "T001",
        }),
        expect.objectContaining({
          feeds: expect.any(Number),
          themeCode: "T002",
        }),
        expect.objectContaining({
          feeds: expect.any(Number),
          themeCode: "T004",
        }),
        expect.objectContaining({
          feeds: expect.any(Number),
          themeCode: "T007",
        }),
        expect.objectContaining({
          feeds: expect.any(Number),
          themeCode: "T017",
        }),
      ]),
    );
    expect(phase14RegistryCoverage().every((item) => item.feeds > 0)).toBe(
      true,
    );
  });

  it("macro-only evidence cannot confirm demand", () => {
    const result = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "B",
          feedId: "fred_indpro",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          provider: "FRED",
          reasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
        },
        {
          evidenceGrade: "B",
          feedId: "bea_dataset_list",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          provider: "BEA",
          reasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
        },
      ],
      feeds: feeds("T001"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(result.final_score).toBeLessThan(60);
    expect(result.caps_applied).toContain("MACRO_ONLY_CAP_59");
    expect(result.demand_state).not.toBe("DEMAND_CONFIRMED");
  });

  it("unmapped USAspending recipients stay theme-level but support demand", () => {
    const result = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "A",
          feedId: "usaspending_defense_awards",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          metricValueNum: 2_500_000,
          provider: "USA_SPENDING",
          reasonCode: DEMAND_REASON_CODES.DEMAND_GOVERNMENT_AWARD_SUPPORT,
        },
      ],
      feeds: feeds("T017"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(result.final_score).toBeGreaterThanOrEqual(40);
    expect(result.positive_reason_codes).toContain(
      "DEMAND_GOVERNMENT_AWARD_SUPPORT",
    );
    expect(result.caution_reason_codes).toContain("DEMAND_UNMAPPED_RECIPIENT");
  });

  it("patent-only or C-grade weak evidence caps the score", () => {
    const result = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "C",
          feedId: "uspto_placeholder",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          provider: "USPTO",
          reasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
        },
      ],
      feeds: [
        {
          description: "Weak patent trend fixture",
          enabled: true,
          endpoint: "patent_fixture",
          evidenceGradeCeiling: "C",
          feedId: "uspto_placeholder",
          freshnessThresholdDays: 365,
          kind: "uspto_placeholder",
          mappingMethod: "theme_context_only",
          mapsToSecurity: false,
          mapsToTheme: true,
          proofCategory: "weak_rnd",
          provider: "USPTO",
          seriesOrQueryId: "patent_fixture",
          themeCode: "T001",
        },
      ],
      now: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(result.final_score).toBeLessThanOrEqual(55);
    expect(result.caps_applied).toContain("ONLY_C_GRADE_EVIDENCE_CAP_55");
  });

  it("EIA power evidence improves power theme demand reality", () => {
    const baseline = scoreEconomicDemand({
      evidenceRows: [],
      feeds: feeds("T004"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });
    const result = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "A",
          feedId: "eia_electricity_retail_sales",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          metricValueNum: 12,
          provider: "EIA",
          reasonCode: DEMAND_REASON_CODES.DEMAND_CAPACITY_TIGHTNESS_EVIDENCE,
        },
      ],
      feeds: feeds("T004"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(result.final_score).toBeGreaterThan(baseline.final_score);
    expect(result.positive_reason_codes).toContain(
      "DEMAND_CAPACITY_TIGHTNESS_EVIDENCE",
    );
  });

  it("missing storage pricing feed creates a provider-gap warning", () => {
    const result = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "D",
          feedId: "storage_pricing_gap",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          provider: "ALPHATREND_INTERNAL",
          reasonCode: DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP,
        },
      ],
      feeds: feeds("T002"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(result.caution_reason_codes).toContain("DEMAND_PROVIDER_DATA_GAP");
    expect(result.caution_reason_codes).toContain(
      "DEMAND_ONLY_D_GRADE_EVIDENCE",
    );
    expect(result.caps_applied).toContain("ONLY_D_GRADE_EVIDENCE_CAP_35");
    expect(result.final_score).toBeLessThanOrEqual(35);
  });

  it("D-grade positive evidence cannot cross the weak-demand cap", () => {
    const result = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "D",
          feedId: "eia_electricity_retail_sales",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          metricValueNum: 12,
          provider: "EIA",
          reasonCode: DEMAND_REASON_CODES.DEMAND_CAPACITY_TIGHTNESS_EVIDENCE,
        },
        {
          evidenceGrade: "D",
          feedId: "fred_indpro",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          provider: "FRED",
          reasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
        },
      ],
      feeds: feeds("T004"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(result.final_score).toBeLessThanOrEqual(35);
    expect(result.demand_state).toBe("DEMAND_WEAK");
    expect(result.caps_applied).toContain("ONLY_D_GRADE_EVIDENCE_CAP_35");
    expect(result.caution_reason_codes).toContain(
      "DEMAND_ONLY_D_GRADE_EVIDENCE",
    );
  });

  it("contradictory demand evidence forces contradicted state and cap", () => {
    const result = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "A",
          feedId: "eia_electricity_retail_sales",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          metricValueNum: 12,
          provider: "EIA",
          reasonCode: DEMAND_REASON_CODES.DEMAND_CAPACITY_TIGHTNESS_EVIDENCE,
        },
        {
          evidenceGrade: "A",
          feedId: "eia_electricity_retail_sales",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          provider: "EIA",
          reasonCode: DEMAND_REASON_CODES.DEMAND_CONTRADICTED,
        },
      ],
      feeds: feeds("T004"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(result.final_score).toBeLessThanOrEqual(30);
    expect(result.demand_state).toBe("DEMAND_CONTRADICTED");
    expect(result.caps_applied).toContain("CONTRADICTED_REQUIRED_PROOF_CAP_30");
  });

  it("stale macro series reduces score", () => {
    const fresh = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "B",
          feedId: "fred_indpro",
          fetchedAt: new Date("2026-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          provider: "FRED",
          reasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
        },
      ],
      feeds: feeds("T001"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });
    const stale = scoreEconomicDemand({
      evidenceRows: [
        {
          evidenceGrade: "B",
          feedId: "fred_indpro",
          fetchedAt: new Date("2025-05-12T00:00:00.000Z"),
          metricName: "t2.provider_demand_feed",
          provider: "FRED",
          reasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
        },
      ],
      feeds: feeds("T001"),
      now: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(stale.final_score).toBeLessThan(fresh.final_score);
    expect(stale.caution_reason_codes).toContain("DEMAND_EVIDENCE_STALE");
  });
});
