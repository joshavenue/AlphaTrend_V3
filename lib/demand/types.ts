import type {
  EvidenceGrade,
  Prisma,
  PrismaClient,
  ProviderName,
} from "@/generated/prisma/client";
import type { DEMAND_STATES } from "@/lib/demand/constants";

export type DemandState = (typeof DEMAND_STATES)[keyof typeof DEMAND_STATES];

export type DemandFeedKind =
  | "bea_dataset_list"
  | "bls_cpi"
  | "eia_electricity_retail_sales"
  | "eia_routes"
  | "fred_observations"
  | "missing_provider_gap"
  | "usaspending_awards"
  | "uspto_placeholder";

export type DemandProofCategory =
  | "capacity"
  | "customer_demand"
  | "government_awards"
  | "macro_context"
  | "missing_data"
  | "pricing"
  | "weak_rnd";

export type DemandFeedDefinition = {
  description: string;
  enabled: boolean;
  endpoint: string;
  evidenceGradeCeiling: EvidenceGrade;
  feedId: string;
  frequency?: string;
  freshnessThresholdDays: number;
  kind: DemandFeedKind;
  mappingMethod: string;
  mapsToSecurity: boolean;
  mapsToTheme: boolean;
  positiveReasonCode?: string;
  proofCategory: DemandProofCategory;
  provider: ProviderName;
  seriesOrQueryId: string;
  themeCode: string;
};

export type DemandDbClient = Pick<
  PrismaClient,
  | "apiObservability"
  | "economicObservation"
  | "economicSeries"
  | "evidenceLedger"
  | "governmentAward"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "providerPayload"
  | "recipientSecurityMapping"
  | "themeDefinition"
  | "themeEconomicMapping"
>;

export type DemandWarning = {
  code: string;
  feedId?: string;
  message: string;
  severity: "INFO" | "WARNING" | "BLOCKER";
  themeCode?: string | null;
};

export type DemandFetchOptions = {
  provider?: ProviderName;
  themeRef?: string;
};

export type DemandScoreOptions = {
  themeRef?: string;
};

export type DemandThemeSummary = {
  demandState?: DemandState;
  providerCoverage?: number;
  score?: number;
  sourceThemeCode?: string | null;
  themeId: string;
  themeName: string;
};

export type DemandFetchSummary = {
  evidenceWritten: number;
  feedsFetched: number;
  jobRunId: string;
  observationsWritten: number;
  providerCalls: number;
  rowsRead: number;
  rowsWritten: number;
  themes: DemandThemeSummary[];
  warnings: DemandWarning[];
};

export type DemandScoreSummary = {
  evidenceWritten: number;
  jobRunId: string;
  rowsRead: number;
  rowsWritten: number;
  themes: DemandThemeSummary[];
  warnings: DemandWarning[];
};

export type DemandScoreDetail = {
  algorithm_version: string;
  caps_applied: string[];
  components: {
    contract_backlog_proof: number;
    customer_demand_proof: number;
    data_freshness_adjustment: number;
    industry_macro_confirmation: number;
    pricing_capacity_proof: number;
    provider_coverage: number;
    weak_evidence_adjustment: number;
  };
  demand_state: DemandState;
  evidence_grade_ceiling?: EvidenceGrade;
  evidence_ids: string[];
  final_score: number;
  positive_reason_codes: string[];
  caution_reason_codes: string[];
  threshold_version: string;
};

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
