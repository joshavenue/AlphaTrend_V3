import type { ProviderName } from "@/lib/domain/types";

import { providerEnvKeys } from "@/lib/config/env";

export type ProviderEndpointDefinition = {
  provider: ProviderName;
  endpoint: string;
  envKey: string | null;
  requiredForPhase: number;
  description: string;
};

const providerEnvByName: Partial<Record<ProviderName, string>> = {
  SEC: "SEC_USER_AGENT",
  MASSIVE: "MASSIVE_API_KEY",
  FMP: "FMP_API_KEY",
  OPENFIGI: "OPENFIGI_API_KEY",
  ALPHA_VANTAGE: "ALPHA_VANTAGE_API_KEY",
  FRED: "FRED_API_KEY",
  BEA: "BEA_API_KEY",
  BLS: "BLS_API_KEY",
  EIA: "EIA_API_KEY",
};

export const providerEndpointRegistry: ProviderEndpointDefinition[] = [
  {
    description: "SEC company ticker map",
    endpoint: "company_tickers",
    envKey: "SEC_USER_AGENT",
    provider: "SEC",
    requiredForPhase: 2,
  },
  {
    description: "SEC company facts for a CIK",
    endpoint: "companyfacts",
    envKey: "SEC_USER_AGENT",
    provider: "SEC",
    requiredForPhase: 2,
  },
  {
    description: "SEC company submissions and recent filing timeline",
    endpoint: "submissions",
    envKey: "SEC_USER_AGENT",
    provider: "SEC",
    requiredForPhase: 7,
  },
  {
    description: "Nasdaq Trader Nasdaq-listed symbol directory",
    endpoint: "nasdaqlisted",
    envKey: null,
    provider: "NASDAQ_TRADER",
    requiredForPhase: 2,
  },
  {
    description: "Nasdaq Trader other-listed symbol directory",
    endpoint: "otherlisted",
    envKey: null,
    provider: "NASDAQ_TRADER",
    requiredForPhase: 2,
  },
  {
    description: "Massive reference ticker lookup",
    endpoint: "reference_tickers",
    envKey: "MASSIVE_API_KEY",
    provider: "MASSIVE",
    requiredForPhase: 2,
  },
  {
    description: "Massive daily aggregate bars",
    endpoint: "daily_aggregate_bars",
    envKey: "MASSIVE_API_KEY",
    provider: "MASSIVE",
    requiredForPhase: 2,
  },
  {
    description: "OpenFIGI ticker mapping",
    endpoint: "mapping",
    envKey: "OPENFIGI_API_KEY",
    provider: "OPENFIGI",
    requiredForPhase: 2,
  },
  {
    description: "FMP key metrics",
    endpoint: "key_metrics",
    envKey: "FMP_API_KEY",
    provider: "FMP",
    requiredForPhase: 2,
  },
  {
    description: "FMP income statement",
    endpoint: "income_statement",
    envKey: "FMP_API_KEY",
    provider: "FMP",
    requiredForPhase: 2,
  },
  {
    description: "FMP balance sheet statement",
    endpoint: "balance_sheet_statement",
    envKey: "FMP_API_KEY",
    provider: "FMP",
    requiredForPhase: 7,
  },
  {
    description: "FMP cash flow statement",
    endpoint: "cash_flow_statement",
    envKey: "FMP_API_KEY",
    provider: "FMP",
    requiredForPhase: 7,
  },
  {
    description: "FMP financial ratios",
    endpoint: "ratios",
    envKey: "FMP_API_KEY",
    provider: "FMP",
    requiredForPhase: 7,
  },
  {
    description: "FMP ETF holdings",
    endpoint: "etf_holdings",
    envKey: "FMP_API_KEY",
    provider: "FMP",
    requiredForPhase: 2,
  },
  {
    description: "Alpha Vantage active listing CSV",
    endpoint: "listing_status_active",
    envKey: "ALPHA_VANTAGE_API_KEY",
    provider: "ALPHA_VANTAGE",
    requiredForPhase: 2,
  },
  {
    description: "FRED series observations",
    endpoint: "series_observations",
    envKey: "FRED_API_KEY",
    provider: "FRED",
    requiredForPhase: 2,
  },
  {
    description: "BEA dataset list",
    endpoint: "dataset_list",
    envKey: "BEA_API_KEY",
    provider: "BEA",
    requiredForPhase: 2,
  },
  {
    description: "BLS CPI time series",
    endpoint: "timeseries_cpi",
    envKey: "BLS_API_KEY",
    provider: "BLS",
    requiredForPhase: 2,
  },
  {
    description: "EIA v2 route root",
    endpoint: "v2_root",
    envKey: "EIA_API_KEY",
    provider: "EIA",
    requiredForPhase: 2,
  },
  {
    description: "USAspending bounded award search",
    endpoint: "spending_by_award",
    envKey: null,
    provider: "USA_SPENDING",
    requiredForPhase: 2,
  },
];

export function providerConfigurationPresence(
  source: Record<string, string | undefined> = process.env,
) {
  return providerEnvKeys.map((envKey) => ({
    envKey,
    configured: Boolean(source[envKey]),
  }));
}

export function providerRequiredEnv(providerName: ProviderName) {
  return providerEnvByName[providerName] ?? null;
}
