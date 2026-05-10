import "dotenv/config";

import { z } from "zod";

export const providerEnvKeys = [
  "SEC_USER_AGENT",
  "MASSIVE_API_KEY",
  "FMP_API_KEY",
  "OPENFIGI_API_KEY",
  "ALPHA_VANTAGE_API_KEY",
  "FRED_API_KEY",
  "BEA_API_KEY",
  "BLS_API_KEY",
  "EIA_API_KEY",
] as const;

export const secretEnvKeys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "ADMIN_INITIAL_PASSWORD",
  ...providerEnvKeys,
] as const;

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const envSchema = z.object({
  APP_ENV: z.string().default("hetzner-dev"),
  APP_BASE_URL: z.string().url().default("http://100.79.23.21:420"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  DATABASE_URL: optionalUrl,
  AUTH_SECRET: optionalString,
  NEXTAUTH_SECRET: optionalString,
  ADMIN_EMAIL: optionalString,
  ADMIN_INITIAL_PASSWORD: optionalString,
  AUTH_TRUST_HOST: optionalString,
  CRON_SECRET: optionalString,
  JOB_CONCURRENCY: z.coerce.number().int().positive().default(2),
  SEC_USER_AGENT: optionalString,
  MASSIVE_API_KEY: optionalString,
  FMP_API_KEY: optionalString,
  OPENFIGI_API_KEY: optionalString,
  ALPHA_VANTAGE_API_KEY: optionalString,
  FRED_API_KEY: optionalString,
  BEA_API_KEY: optionalString,
  BLS_API_KEY: optionalString,
  EIA_API_KEY: optionalString,
});

export type AppEnv = z.infer<typeof envSchema>;

type EnvSource = Record<string, string | undefined>;

export function parseEnv(source: EnvSource = process.env): AppEnv {
  return envSchema.parse(source);
}

export function getEnv(): AppEnv {
  return parseEnv();
}

export function envPresence(source: EnvSource = process.env) {
  const keys = [
    "DATABASE_URL",
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "ADMIN_EMAIL",
    ...providerEnvKeys,
  ];

  return keys.map((name) => ({
    name,
    present: Boolean(source[name]),
  }));
}
