import type { FundamentalState, PrismaClient } from "@/generated/prisma/client";
import type {
  FmpCompanyMetric,
  SecCompanyFacts,
} from "@/lib/providers/parsers";

export type FundamentalDbClient = Pick<
  PrismaClient,
  | "apiObservability"
  | "candidateSignalScore"
  | "candidateSignalState"
  | "evidenceLedger"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "providerPayload"
  | "themeCandidate"
>;

export type FundamentalPeriodType = "quarter" | "annual";

export type FundamentalPeriod = {
  capitalExpenditure?: number;
  cashAndEquivalents?: number;
  dilutedShares?: number;
  fiscalPeriod?: string;
  fiscalYear?: number;
  freeCashFlow?: number;
  grossProfit?: number;
  inventory?: number;
  netIncome?: number;
  operatingCashFlow?: number;
  operatingIncome?: number;
  periodEnd: string;
  periodStart?: string;
  periodType: FundamentalPeriodType;
  revenue?: number;
  source: "SEC" | "FMP" | "MERGED";
  sourceTags?: Record<string, string | undefined>;
  totalAssets?: number;
  totalDebt?: number;
  totalLiabilities?: number;
};

export type NormalizedFundamentalData = {
  annualPeriods: FundamentalPeriod[];
  provider: "SEC" | "FMP" | "MERGED";
  quarterlyPeriods: FundamentalPeriod[];
};

export type FundamentalMetricSnapshot = {
  cashDebtRatio?: number;
  fcfMargin?: number;
  fcfMarginDeltaYoy?: number;
  grossMargin?: number;
  grossMarginDeltaYoyBps?: number;
  latestPeriodEnd?: string;
  operatingMargin?: number;
  operatingMarginDeltaYoyBps?: number;
  revenueGrowthQoq?: number;
  revenueGrowthYoy?: number;
  revenueGrowthYoyPrior?: number;
  shareCountGrowthYoy?: number;
};

export type FundamentalScoreComponents = {
  accounting_data_quality: number;
  balance_sheet_quality: number;
  cash_flow_quality: number;
  dilution_penalty: number;
  guidance_backlog_support: number;
  margin_expansion: number;
  revenue_acceleration: number;
  segment_validation: number;
};

export type ReconciliationDiscrepancy = {
  absoluteDifference: number;
  fmpValue: number;
  material: boolean;
  metricName: string;
  percentDifference: number;
  periodEnd: string;
  preferredSource: "SEC" | "FMP";
  secValue: number;
};

export type ReconciliationSummary = {
  comparedCount: number;
  discrepancies: ReconciliationDiscrepancy[];
  materialDisagreementCount: number;
};

export type FundamentalScoreDetail = {
  algorithm_version: string;
  caps_applied: string[];
  components: FundamentalScoreComponents;
  final_score: number;
  fundamental_state: FundamentalState;
  metrics: FundamentalMetricSnapshot;
  reason_codes: string[];
  threshold_version: string;
};

export type FundamentalScoringInput = {
  financials: NormalizedFundamentalData;
  guidanceSupport?: "measurable" | "qualitative" | "generic" | "none";
  reconciliation?: ReconciliationSummary;
  segmentEvidence?:
    | "growing_reported"
    | "direct_business_line"
    | "partial"
    | "none";
  t1ExposureScore?: number;
  t1State?: string;
};

export type FundamentalScoreResult = {
  evidenceDetails: Array<{
    metricName: string;
    metricUnit?: string;
    metricValueNum?: number;
    metricValueText?: string;
    periodEnd?: string;
    reasonCode: string;
    scoreImpact?: number;
  }>;
  score: number;
  scoreDetail: FundamentalScoreDetail;
  state: FundamentalState;
};

export type FundamentalProviderBundle = {
  fmp?: {
    balanceSheetStatements?: FmpCompanyMetric[];
    cashFlowStatements?: FmpCompanyMetric[];
    incomeStatements?: FmpCompanyMetric[];
    keyMetrics?: FmpCompanyMetric[];
    ratios?: FmpCompanyMetric[];
  };
  sec?: SecCompanyFacts;
};

export type FundamentalScoringOptions = {
  includeFmp?: boolean;
  includeSec?: boolean;
  providerDataByTicker?: Record<string, FundamentalProviderBundle>;
  themeRef?: string;
  ticker?: string;
};

export type FundamentalThemeSummary = {
  candidatesScored: number;
  contradicted: number;
  deteriorating: number;
  improving: number;
  insufficientData: number;
  notYetValidated: number;
  sourceThemeCode: string;
  themeId: string;
  themeName: string;
  validated: number;
};

export type FundamentalScoringSummary = {
  candidatesScored: number;
  evidenceWritten: number;
  fmpConfigured: boolean;
  jobRunId: string;
  providerCalls: number;
  rowsRead: number;
  rowsWritten: number;
  secConfigured: boolean;
  themes: FundamentalThemeSummary[];
  warnings: Array<{
    code: string;
    message: string;
    severity: "INFO" | "WARNING" | "BLOCKER";
    themeCode?: string;
    ticker?: string;
  }>;
};
