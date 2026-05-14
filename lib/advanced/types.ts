import type {
  BaseRateState,
  FlowState,
  PrismaClient,
  ProviderName,
} from "@/generated/prisma/client";

export type OwnershipFlowSnapshotInput = {
  delayedData?: boolean;
  etfFlowEligible?: boolean;
  etfWeight?: number;
  holderCount?: number;
  licenseRestricted?: boolean;
  ownershipPercent?: number;
  ownershipTrend?: "INCREASING" | "DECREASING" | "STABLE" | "UNKNOWN";
  reportDate?: string;
};

export type OwnershipFlowScoreDetail = {
  algorithm_version: string;
  components: {
    crowding_penalty: number;
    etf_flow_access: number;
    holder_breadth: number;
    ownership_trend: number;
  };
  delayed_data: boolean;
  final_score: number;
  metrics: {
    etf_weight?: number;
    holder_count?: number;
    ownership_percent?: number;
    ownership_trend?: string;
    report_date?: string;
  };
  reason_codes: string[];
  threshold_version: string;
};

export type OwnershipFlowScoreResult = {
  flowState: FlowState;
  reasonCodes: string[];
  score: number;
  scoreDetail: OwnershipFlowScoreDetail;
};

export type PriceBarForBaseRate = {
  close: number;
  date: string;
  high?: number;
  low?: number;
};

export type BaseRateScoreDetail = {
  algorithm_version: string;
  metrics: {
    bars: number;
    median_drawdown?: number;
    median_return_1m?: number;
    median_return_3m?: number;
    median_return_6m?: number;
    sample_size: number;
    setup_key: string;
    win_rate_1m?: number;
    win_rate_3m?: number;
    win_rate_6m?: number;
    worst_decile_drawdown?: number;
  };
  reason_codes: string[];
  threshold_version: string;
};

export type BaseRateScoreResult = {
  baseRateState: BaseRateState;
  reasonCodes: string[];
  sampleSize: number;
  score: number;
  scoreDetail: BaseRateScoreDetail;
  setupKey: string;
};

export type AdvancedScoringOptions = {
  themeRef?: string;
  ticker?: string;
};

export type AdvancedWarning = {
  code: string;
  message: string;
  severity: "INFO" | "CAUTION" | "WARNING";
  themeCode?: string;
  ticker?: string;
};

export type AdvancedThemeSummary = {
  baseRateLowSample: number;
  baseRateScored: number;
  flowScored: number;
  flowWithAccess: number;
  sourceThemeCode: string;
  themeId: string;
  themeName: string;
};

export type AdvancedScoringSummary = {
  baseRateEvidenceWritten: number;
  baseRateJobRunId?: string;
  baseRateRowsWritten: number;
  baseRateScored: number;
  flowEvidenceWritten: number;
  flowJobRunId?: string;
  flowRowsWritten: number;
  flowScored: number;
  providerCalls: number;
  rowsRead: number;
  themes: AdvancedThemeSummary[];
  warnings: AdvancedWarning[];
};

export type AdvancedDbClient = Pick<
  PrismaClient,
  | "$transaction"
  | "baseRateResult"
  | "candidateSignalScore"
  | "candidateSignalState"
  | "etfFlowSnapshot"
  | "evidenceLedger"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "ownershipSnapshot"
  | "priceBarDaily"
  | "themeCandidate"
>;

export type LatestOwnershipSnapshot = {
  delayedData: boolean;
  holderCount: number | null;
  ownershipPercent: unknown;
  ownershipTrend: string | null;
  provider: ProviderName;
  reportDate: Date | null;
  sourcePayloadHash: string | null;
};

export type LatestEtfFlowSnapshot = {
  flowEligible: boolean;
  holdingWeight: unknown;
  licenseRestricted: boolean;
  provider: ProviderName;
  sourcePayloadHash: string | null;
};
