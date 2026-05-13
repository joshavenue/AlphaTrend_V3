import type { EvidenceGrade, ProviderName } from "@/generated/prisma/client";
import { DEMAND_REASON_CODES } from "@/lib/demand/constants";
import type { DemandDbClient, DemandFeedDefinition } from "@/lib/demand/types";
import { MVP_THEME_CODES } from "@/lib/themes/curated-mvp";

function feed(input: {
  description: string;
  endpoint: string;
  evidenceGradeCeiling?: EvidenceGrade;
  feedId: string;
  frequency?: string;
  freshnessThresholdDays?: number;
  kind: DemandFeedDefinition["kind"];
  mappingMethod?: string;
  mapsToSecurity?: boolean;
  positiveReasonCode?: string;
  proofCategory: DemandFeedDefinition["proofCategory"];
  provider: ProviderName;
  seriesOrQueryId: string;
  themeCode: string;
}): DemandFeedDefinition {
  return {
    enabled: true,
    evidenceGradeCeiling: input.evidenceGradeCeiling ?? "B",
    freshnessThresholdDays: input.freshnessThresholdDays ?? 90,
    mappingMethod: input.mappingMethod ?? "theme_context_only",
    mapsToSecurity: input.mapsToSecurity ?? false,
    mapsToTheme: true,
    ...input,
  };
}

type FeedTemplate = Omit<Parameters<typeof feed>[0], "themeCode">;

const COMMON_MACRO_FEEDS = [
  {
    description:
      "Industrial production context used as a broad demand-regime control.",
    endpoint: "series_observations",
    feedId: "fred_indpro",
    frequency: "monthly",
    kind: "fred_observations",
    positiveReasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
    proofCategory: "macro_context",
    provider: "FRED",
    seriesOrQueryId: "INDPRO",
  },
  {
    description: "BEA dataset availability for national accounts demand pools.",
    endpoint: "dataset_list",
    feedId: "bea_dataset_list",
    frequency: "metadata",
    kind: "bea_dataset_list",
    positiveReasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
    proofCategory: "macro_context",
    provider: "BEA",
    seriesOrQueryId: "GETDATASETLIST",
  },
] satisfies FeedTemplate[];

export const DEMAND_FEED_REGISTRY: DemandFeedDefinition[] = [
  ...COMMON_MACRO_FEEDS.map((item) => feed({ ...item, themeCode: "T001" })),
  feed({
    description:
      "CPI/input-cost context for semiconductor and AI infrastructure demand.",
    endpoint: "timeseries_cpi",
    feedId: "bls_cpi_t001",
    frequency: "monthly",
    kind: "bls_cpi",
    positiveReasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
    proofCategory: "macro_context",
    provider: "BLS",
    seriesOrQueryId: "CUUR0000SA0",
    themeCode: "T001",
  }),

  ...COMMON_MACRO_FEEDS.map((item) => feed({ ...item, themeCode: "T002" })),
  feed({
    description:
      "Storage/HBM pricing data is not available through approved MVP providers; preserve the explicit proof gap.",
    endpoint: "missing_external_feed",
    evidenceGradeCeiling: "D",
    feedId: "storage_pricing_gap",
    frequency: "manual_gap",
    freshnessThresholdDays: 30,
    kind: "missing_provider_gap",
    positiveReasonCode: undefined,
    proofCategory: "missing_data",
    provider: "ALPHATREND_INTERNAL",
    seriesOrQueryId: "storage_pricing_unavailable",
    themeCode: "T002",
  }),

  ...COMMON_MACRO_FEEDS.map((item) => feed({ ...item, themeCode: "T004" })),
  feed({
    description:
      "EIA electricity retail sales as power-demand context for data-center bottlenecks.",
    endpoint: "electricity_retail_sales",
    evidenceGradeCeiling: "A",
    feedId: "eia_electricity_retail_sales",
    frequency: "monthly",
    freshnessThresholdDays: 90,
    kind: "eia_electricity_retail_sales",
    positiveReasonCode: DEMAND_REASON_CODES.DEMAND_CAPACITY_TIGHTNESS_EVIDENCE,
    proofCategory: "capacity",
    provider: "EIA",
    seriesOrQueryId: "electricity/retail-sales:sales",
    themeCode: "T004",
  }),

  feed({
    description: "EIA route metadata confirms energy provider availability.",
    endpoint: "v2_root",
    evidenceGradeCeiling: "B",
    feedId: "eia_routes_t007",
    frequency: "metadata",
    kind: "eia_routes",
    positiveReasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
    proofCategory: "macro_context",
    provider: "EIA",
    seriesOrQueryId: "v2_root",
    themeCode: "T007",
  }),
  feed({
    description:
      "Uranium spot/term price feed is unavailable through approved MVP providers; preserve the explicit proof gap.",
    endpoint: "missing_external_feed",
    evidenceGradeCeiling: "D",
    feedId: "uranium_contract_price_gap",
    frequency: "manual_gap",
    freshnessThresholdDays: 30,
    kind: "missing_provider_gap",
    proofCategory: "missing_data",
    provider: "ALPHATREND_INTERNAL",
    seriesOrQueryId: "uranium_price_unavailable",
    themeCode: "T007",
  }),

  feed({
    description:
      "USAspending award search for federal contract demand context; recipients remain unmapped until reviewed.",
    endpoint: "spending_by_award",
    evidenceGradeCeiling: "A",
    feedId: "usaspending_defense_awards",
    frequency: "monthly",
    freshnessThresholdDays: 120,
    kind: "usaspending_awards",
    mappingMethod: "theme_level_unmapped_recipient",
    positiveReasonCode: DEMAND_REASON_CODES.DEMAND_GOVERNMENT_AWARD_SUPPORT,
    proofCategory: "government_awards",
    provider: "USA_SPENDING",
    seriesOrQueryId: "defense_awards_sample",
    themeCode: "T017",
  }),
  feed({
    description: "CPI/input-cost context for defense industrial demand.",
    endpoint: "timeseries_cpi",
    feedId: "bls_cpi_t017",
    frequency: "monthly",
    kind: "bls_cpi",
    positiveReasonCode: DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
    proofCategory: "macro_context",
    provider: "BLS",
    seriesOrQueryId: "CUUR0000SA0",
    themeCode: "T017",
  }),
];

export function feedsForThemeCode(themeCode: string | null | undefined) {
  return DEMAND_FEED_REGISTRY.filter((feed) => feed.themeCode === themeCode);
}

export function demandRegistryThemeCodes() {
  return [...new Set(DEMAND_FEED_REGISTRY.map((feed) => feed.themeCode))];
}

export function phase14RegistryCoverage() {
  return MVP_THEME_CODES.map((themeCode) => ({
    feeds: feedsForThemeCode(themeCode).length,
    themeCode,
  }));
}

export async function upsertThemeDemandMappings(input: {
  prisma: DemandDbClient;
  themeId: string;
  sourceThemeCode?: string | null;
}) {
  const feeds = feedsForThemeCode(input.sourceThemeCode);

  for (const item of feeds) {
    await input.prisma.themeEconomicMapping.upsert({
      create: {
        description: item.description,
        enabled: item.enabled,
        endpoint: item.endpoint,
        evidenceGradeCeiling: item.evidenceGradeCeiling,
        feedId: item.feedId,
        frequency: item.frequency,
        freshnessThresholdDays: item.freshnessThresholdDays,
        mappingMethod: item.mappingMethod,
        mapsToSecurity: item.mapsToSecurity,
        mapsToTheme: item.mapsToTheme,
        proofCategory: item.proofCategory,
        provider: item.provider,
        seriesOrQueryId: item.seriesOrQueryId,
        themeId: input.themeId,
      },
      update: {
        description: item.description,
        enabled: item.enabled,
        endpoint: item.endpoint,
        evidenceGradeCeiling: item.evidenceGradeCeiling,
        frequency: item.frequency,
        freshnessThresholdDays: item.freshnessThresholdDays,
        mappingMethod: item.mappingMethod,
        mapsToSecurity: item.mapsToSecurity,
        mapsToTheme: item.mapsToTheme,
        proofCategory: item.proofCategory,
        provider: item.provider,
        seriesOrQueryId: item.seriesOrQueryId,
      },
      where: {
        themeId_feedId: {
          feedId: item.feedId,
          themeId: input.themeId,
        },
      },
    });
  }

  return feeds;
}
