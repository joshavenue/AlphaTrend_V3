import { describe, expect, it } from "vitest";

import { scoreExposurePurity } from "@/lib/exposure/scoring";
import { T1_REASON_CODES } from "@/lib/exposure/constants";
import type { ExposureScoringInput } from "@/lib/exposure/types";

const baseTheme = {
  excludedCategories: [
    {
      display_label: "generic AI software",
      normalized_label: "generic ai software",
    },
  ],
  indirectBeneficiaryCategories: [],
  seedEtfs: [
    {
      symbol: "SMH",
    },
    {
      symbol: "SOXX",
    },
  ],
  sourceThemeCode: "T001",
  themeId: "00000000-0000-0000-0000-000000000001",
  themeName: "AI Semiconductor Compute",
};

function input(overrides: Partial<ExposureScoringInput>): ExposureScoringInput {
  return {
    candidate: {
      sourceDetail: {
        sources: [],
      },
      sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
      themeCandidateId: "00000000-0000-0000-0000-000000000006",
    },
    security: {
      canonicalTicker: "P6T",
      companyName: "Phase Six Test Inc.",
    },
    theme: {
      ...baseTheme,
      directBeneficiaryCategories: [
        {
          display_label: "GPU",
          normalized_label: "gpu",
        },
      ],
    },
    ...overrides,
  };
}

describe("Phase 6 T1 exposure scoring", () => {
  it("caps keyword-only AI matches at 29", () => {
    const result = scoreExposurePurity(
      input({
        fmpProfile: {
          description: "The company offers AI technology services.",
          industry: "Software",
          sector: "Technology",
          symbol: "P6T",
        },
        theme: {
          ...baseTheme,
          directBeneficiaryCategories: [
            {
              display_label: "AI",
              normalized_label: "ai",
            },
          ],
        },
      }),
    );

    expect(result.score).toBeLessThanOrEqual(29);
    expect(result.scoreDetail.reason_codes).toContain(
      T1_REASON_CODES.KEYWORD_ONLY,
    );
    expect(
      result.evidenceDetails.find(
        (detail) => detail.metricValueText === "keyword_only_cap",
      ),
    ).not.toHaveProperty("scoreImpact");
  });

  it("caps same-sector-only semiconductor matches at 39", () => {
    const result = scoreExposurePurity(
      input({
        fmpProfile: {
          industry: "Semiconductors",
          sector: "Technology",
          symbol: "P6T",
        },
        theme: {
          ...baseTheme,
          directBeneficiaryCategories: [
            {
              display_label: "semiconductor",
              normalized_label: "semiconductor",
            },
          ],
        },
      }),
    );

    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.beneficiaryType).toBe("SAME_SECTOR_ONLY");
    expect(result.candidateStatus).toBe("REJECTED");
    expect(result.scoreDetail.reason_codes).toContain(
      T1_REASON_CODES.SAME_SECTOR_ONLY,
    );
  });

  it("scores direct GPU business-line support above 70 when ETF support is present", () => {
    const result = scoreExposurePurity(
      input({
        candidate: {
          sourceDetail: {
            sources: [
              {
                details: {
                  etf_symbol: "SMH",
                },
                source_key: "etf_holding:SMH:P6T",
                source_type: "SEED_ETF_HOLDING",
                source_weight: 2.1,
                ticker: "P6T",
              },
              {
                details: {
                  etf_symbol: "SOXX",
                },
                source_key: "etf_holding:SOXX:P6T",
                source_type: "SEED_ETF_HOLDING",
                source_weight: 1.4,
                ticker: "P6T",
              },
            ],
          },
          sourceOfInclusion: "SEED_ETF_HOLDING",
          themeCandidateId: "00000000-0000-0000-0000-000000000006",
        },
        fmpProfile: {
          description:
            "A core supplier of GPU accelerators for hyperscale data center AI workloads.",
          industry: "Semiconductors",
          sector: "Technology",
          symbol: "P6T",
        },
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.beneficiaryType).toBe("DIRECT_BENEFICIARY");
    expect(result.scoreDetail.reason_codes).toContain(
      T1_REASON_CODES.DIRECT_CATEGORY_MATCH,
    );
    expect(result.scoreDetail.reason_codes).toContain(
      T1_REASON_CODES.SEGMENT_DATA_MISSING,
    );
    expect(
      result.evidenceDetails.find(
        (detail) => detail.metricName === "t1.exposure_purity_score",
      ),
    ).toMatchObject({
      metricValueText: `DIRECT_BENEFICIARY:${result.score}`,
    });
  });

  it("segment_missing_does_not_block_direct_business_line_but_caps_very_high_score", () => {
    const result = scoreExposurePurity(
      input({
        candidate: {
          sourceDetail: {
            sources: [
              {
                details: {
                  etf_symbol: "SMH",
                },
                source_key: "etf_holding:SMH:P6T",
                source_type: "SEED_ETF_HOLDING",
                source_weight: 2.1,
                ticker: "P6T",
              },
              {
                details: {
                  etf_symbol: "SOXX",
                },
                source_key: "etf_holding:SOXX:P6T",
                source_type: "SEED_ETF_HOLDING",
                source_weight: 1.4,
                ticker: "P6T",
              },
            ],
          },
          sourceOfInclusion: "SEED_ETF_HOLDING",
          themeCandidateId: "00000000-0000-0000-0000-000000000006",
        },
        fmpProfile: {
          description:
            "A core supplier of GPU accelerators for hyperscale data center AI workloads.",
          industry: "Semiconductors",
          sector: "Technology",
          symbol: "P6T",
        },
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThan(85);
    expect(result.beneficiaryType).toBe("DIRECT_BENEFICIARY");
    expect(result.scoreDetail.reason_codes).toContain(
      T1_REASON_CODES.SEGMENT_DATA_MISSING,
    );
    expect(
      result.evidenceDetails.find(
        (detail) => detail.metricName === "t1.segment_disclosure_support",
      ),
    ).not.toHaveProperty("scoreImpact");
  });

  it("does not score company-name-only direct category similarity", () => {
    const result = scoreExposurePurity(
      input({
        security: {
          canonicalTicker: "P6T",
          companyName: "GPU Holdings Inc.",
        },
      }),
    );

    expect(result.score).toBe(0);
    expect(result.beneficiaryType).toBe("UNRELATED");
    expect(result.scoreDetail.matched_categories.direct).toEqual([]);
  });

  it("rejects excluded generic AI software for the semiconductor theme", () => {
    const result = scoreExposurePurity(
      input({
        fmpProfile: {
          description: "Generic AI software with no silicon revenue.",
          industry: "Application Software",
          sector: "Technology",
          symbol: "P6T",
        },
      }),
    );

    expect(result.score).toBeLessThanOrEqual(29);
    expect(result.candidateStatus).toBe("REJECTED");
    expect(result.beneficiaryType).toBe("NARRATIVE_ADJACENT");
    expect(result.scoreDetail.reason_codes).toContain(
      T1_REASON_CODES.EXCLUDED_CATEGORY_MATCH,
    );
  });

  it("does not let seed ETF membership alone pass T1", () => {
    const result = scoreExposurePurity(
      input({
        candidate: {
          sourceDetail: {
            sources: [
              {
                details: {
                  etf_symbol: "SMH",
                },
                source_key: "etf_holding:SMH:P6T",
                source_type: "SEED_ETF_HOLDING",
                source_weight: 2.1,
                ticker: "P6T",
              },
            ],
          },
          sourceOfInclusion: "SEED_ETF_HOLDING",
          themeCandidateId: "00000000-0000-0000-0000-000000000006",
        },
      }),
    );

    expect(result.score).toBeLessThan(30);
    expect(result.candidateStatus).toBe("REJECTED");
    expect(result.scoreDetail.caps_applied).toContain("seed_etf_only_cap");
  });

  it("does not let manual reviewed mapping bypass T1", () => {
    const result = scoreExposurePurity(
      input({
        manualSeed: {
          beneficiaryType: "GPU / accelerator",
          candidateRole: "Direct beneficiary",
          notes: "Manual seed row only.",
        },
      }),
    );

    expect(result.score).toBeLessThan(50);
    expect(result.candidateStatus).toBe("REVIEW_REQUIRED");
    expect(result.beneficiaryType).not.toBe("DIRECT_BENEFICIARY");
    expect(result.scoreDetail.reason_codes).toContain(
      T1_REASON_CODES.MANUAL_SEED_ONLY,
    );
  });
});
