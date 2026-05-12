import type {
  DilutionRiskState,
  LiquidityState,
  PrismaClient,
} from "@/generated/prisma/client";
import type { FundamentalPeriod } from "@/lib/fundamentals/types";
import type {
  FmpCompanyMetric,
  FmpCompanyProfile,
  MassiveAggregateBar,
  SecCompanyFacts,
  SecCompanySubmission,
} from "@/lib/providers/parsers";

export type LiquidityDbClient = Pick<
  PrismaClient,
  | "apiObservability"
  | "candidateSignalScore"
  | "candidateSignalState"
  | "evidenceLedger"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "priceMetricDaily"
  | "providerPayload"
  | "themeCandidate"
>;

export type FragilityState =
  | "NORMAL_RISK"
  | "WATCH_RISK"
  | "FRAGILE"
  | "SEVERE_FRAGILITY"
  | "INSUFFICIENT_DATA";

export type RiskVetoFlag =
  | "SEVERE_DILUTION"
  | "ILLIQUID"
  | "GOING_CONCERN_AND_WEAK_FUNDAMENTALS"
  | "RECENT_MATERIAL_OFFERING";

export type LiquidityMetricsSnapshot = {
  averageDollarVolume20d?: number;
  averageVolume20d?: number;
  cashAndEquivalents?: number;
  cashRunwayMonths?: number;
  debtToCash?: number;
  freeCashFlow?: number;
  latestFinancialPeriodEnd?: string;
  marketCap?: number;
  metricDate?: string;
  operatingCashFlow?: number;
  priceDataStale?: boolean;
  recentOfferingCount: number;
  reverseSplitCount: number;
  shareCountGrowthYoy?: number;
  totalDebt?: number;
};

export type LiquidityScoreComponents = {
  corporate_action_risk: number;
  debt_cash_runway_risk: number;
  dilution_risk: number;
  dollar_volume_risk: number;
  float_spread_proxy_risk: number;
  going_concern_auditor_risk: number;
  market_cap_risk: number;
};

export type LiquidityScoreDetail = {
  algorithm_version: string;
  components: LiquidityScoreComponents;
  dilution_risk_state: DilutionRiskState;
  final_score: number;
  fragility_state: FragilityState;
  liquidity_state: LiquidityState;
  metrics: LiquidityMetricsSnapshot;
  reason_codes: string[];
  threshold_version: string;
  veto_flags: RiskVetoFlag[];
};

export type LiquidityScoringInput = {
  asOfDate?: Date;
  averageDollarVolume20d?: number;
  averageVolume20d?: number;
  financialPeriods: FundamentalPeriod[];
  goingConcern?: boolean;
  marketCap?: number;
  metricDate?: string;
  priceDataStale?: boolean;
  submissions?: SecCompanySubmission[];
};

export type LiquidityScoreResult = {
  dilutionRiskState: DilutionRiskState;
  evidenceDetails: Array<{
    metricName: string;
    metricUnit?: string;
    metricValueNum?: number;
    metricValueText?: string;
    periodEnd?: string;
    reasonCode: string;
    scoreImpact?: number;
  }>;
  fragilityState: FragilityState;
  liquidityState: LiquidityState;
  score: number;
  scoreDetail: LiquidityScoreDetail;
};

export type LiquidityProviderBundle = {
  fmp?: {
    balanceSheetStatements?: FmpCompanyMetric[];
    cashFlowStatements?: FmpCompanyMetric[];
    keyMetrics?: FmpCompanyMetric[];
    profiles?: FmpCompanyProfile[];
  };
  massive?: {
    bars?: MassiveAggregateBar[];
  };
  sec?: {
    companyFacts?: SecCompanyFacts;
    submissions?: SecCompanySubmission[];
  };
};

export type LiquidityScoringOptions = {
  includeFmp?: boolean;
  includeMassive?: boolean;
  includeSec?: boolean;
  providerDataByTicker?: Record<string, LiquidityProviderBundle>;
  themeRef?: string;
  ticker?: string;
};

export type LiquidityThemeSummary = {
  candidatesScored: number;
  coreEligible: number;
  expandedEligible: number;
  highDilution: number;
  illiquid: number;
  insufficientData: number;
  lowDilution: number;
  moderateDilution: number;
  severeDilution: number;
  sourceThemeCode: string;
  speculativeOnly: number;
  themeId: string;
  themeName: string;
};

export type LiquidityScoringSummary = {
  candidatesScored: number;
  evidenceWritten: number;
  fmpConfigured: boolean;
  jobRunId: string;
  massiveConfigured: boolean;
  providerCalls: number;
  rowsRead: number;
  rowsWritten: number;
  secConfigured: boolean;
  themes: LiquidityThemeSummary[];
  warnings: Array<{
    code: string;
    message: string;
    severity: "INFO" | "WARNING" | "BLOCKER";
    themeCode?: string;
    ticker?: string;
  }>;
};
