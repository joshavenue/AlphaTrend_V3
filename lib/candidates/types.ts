import type { PrismaClient, ProviderName } from "@/generated/prisma/client";

export const CANDIDATE_GENERATOR_VERSION =
  "phase5_candidate_generator_2026_05_10";

export const CANDIDATE_SOURCE_TYPES = {
  FMP_SCREENER_INDUSTRY_MATCH: "FMP_SCREENER_INDUSTRY_MATCH",
  FMP_SCREENER_SECTOR_MATCH: "FMP_SCREENER_SECTOR_MATCH",
  MANUAL_SEED_FOR_API_VALIDATION: "MANUAL_SEED_FOR_API_VALIDATION",
  SEED_ETF_HOLDING: "SEED_ETF_HOLDING",
} as const;

export type CandidateSourceType =
  (typeof CANDIDATE_SOURCE_TYPES)[keyof typeof CANDIDATE_SOURCE_TYPES];

export type CandidateDbClient = Pick<
  PrismaClient,
  | "apiObservability"
  | "evidenceLedger"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "providerPayload"
  | "security"
  | "themeCandidate"
  | "themeDefinition"
>;

export type CandidateWarning = {
  code: string;
  message: string;
  severity: "INFO" | "WARNING" | "BLOCKER";
  source?: string;
  themeCode?: string;
  ticker?: string;
};

export type CandidateSourceInput = {
  asOfDate?: string;
  companyName?: string;
  details?: Record<string, unknown>;
  payloadId?: string;
  provider?: ProviderName;
  responseHash?: string;
  sourceKey: string;
  sourceType: CandidateSourceType;
  sourceUrlOrEndpoint?: string;
  sourceWeight?: number;
  themeCode: string;
  themeId: string;
  ticker: string;
};

export type CandidateSourceRecord = CandidateSourceInput & {
  securityId: string;
};

export type CandidatePersistResult = {
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesTouched: number;
  evidenceWritten: number;
  jobItemsWritten: number;
  skipped: CandidateWarning[];
};

export type CandidateGenerationThemeSummary = {
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesTouched: number;
  evidenceWritten: number;
  fmpScreenerSources: number;
  manualSeedSources: number;
  seedEtfSources: number;
  skippedSources: number;
  sourceThemeCode: string;
  themeId: string;
  themeName: string;
};

export type CandidateGenerationSummary = {
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesTouched: number;
  evidenceWritten: number;
  fmpConfigured: boolean;
  jobRunId: string;
  providerCalls: number;
  rowsRead: number;
  rowsWritten: number;
  themes: CandidateGenerationThemeSummary[];
  warnings: CandidateWarning[];
};
