import { describe, expect, it } from "vitest";

import { parseFmpEtfHoldings } from "@/lib/providers/parsers";
import {
  CANDIDATE_SOURCE_TYPES,
  type CandidateSourceInput,
} from "@/lib/candidates/types";
import {
  fmpScreenerSourcesForTheme,
  mergeCandidateSourceDetails,
  sourceOfInclusionFromDetail,
} from "@/lib/candidates/sources";

const theme = {
  directBeneficiaryCategories: [
    {
      display_label: "semiconductor equipment",
      normalized_label: "semiconductor equipment",
    },
  ],
  indirectBeneficiaryCategories: [],
  seedEtfs: [],
  sourceThemeCode: "P5U",
  themeId: "00000000-0000-0000-0000-000000000005",
};

describe("Phase 5 candidate source helpers", () => {
  it("normalizes FMP ETF holdings with weights and dates", () => {
    const rows = parseFmpEtfHoldings([
      {
        marketValue: "12345.67",
        name: "NVIDIA Corporation",
        sharesNumber: "42",
        symbol: "nvda",
        updatedAt: "2026-05-01",
        weightPercentage: "4.25",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        asOfDate: "2026-05-01",
        holdingName: "NVIDIA Corporation",
        marketValue: 12345.67,
        shares: 42,
        symbol: "NVDA",
        weight: 4.25,
      }),
    ]);
  });

  it("matches FMP screener rows against theme categories deterministically", () => {
    const sources = fmpScreenerSourcesForTheme(theme, [
      {
        companyName: "Phase Five Tools Inc.",
        exchangeShortName: "NASDAQ",
        industry: "Semiconductor Equipment & Materials",
        raw: {},
        sector: "Technology",
        symbol: "P5T",
      },
      {
        companyName: "Unrelated Software Inc.",
        exchangeShortName: "NYSE",
        industry: "Application Software",
        raw: {},
        sector: "Technology",
        symbol: "P5S",
      },
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      sourceType: CANDIDATE_SOURCE_TYPES.FMP_SCREENER_INDUSTRY_MATCH,
      ticker: "P5T",
    });
  });

  it("merges duplicate source rows without changing source identity", () => {
    const manual: CandidateSourceInput = {
      sourceKey: "manual_seed:P5U:P5T",
      sourceType: CANDIDATE_SOURCE_TYPES.MANUAL_SEED_FOR_API_VALIDATION,
      themeCode: "P5U",
      themeId: theme.themeId,
      ticker: "P5T",
    };
    const etf: CandidateSourceInput = {
      provider: "FMP",
      sourceKey: "etf_holding:SMH:P5T",
      sourceType: CANDIDATE_SOURCE_TYPES.SEED_ETF_HOLDING,
      themeCode: "P5U",
      themeId: theme.themeId,
      ticker: "P5T",
    };
    const first = mergeCandidateSourceDetails(undefined, [manual]);
    const second = mergeCandidateSourceDetails(first, [manual, etf]);

    expect(second.source_count).toBe(2);
    expect(second.source_types).toEqual([
      CANDIDATE_SOURCE_TYPES.MANUAL_SEED_FOR_API_VALIDATION,
      CANDIDATE_SOURCE_TYPES.SEED_ETF_HOLDING,
    ]);
    expect(sourceOfInclusionFromDetail(second)).toBe("MULTI_SOURCE");
  });
});
