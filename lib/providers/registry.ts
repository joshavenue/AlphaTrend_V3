import type { ProviderName } from "@/lib/domain/types";

import { providerEnvKeys } from "@/lib/config/env";

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
