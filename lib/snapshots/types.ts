import type {
  CandidateStatus,
  DashboardState,
  FinalState,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import type { ExpressionDecisionDetail } from "@/lib/expression/types";

export type SnapshotDbClient = Pick<
  PrismaClient,
  | "candidateSignalScore"
  | "candidateSignalState"
  | "evidenceLedger"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "themeCandidate"
  | "themeDefinition"
  | "themeSnapshot"
>;

export type SnapshotWarning = {
  code: string;
  message: string;
  severity: "INFO" | "WARNING" | "BLOCKER";
  themeCode?: string;
};

export type SnapshotSignal = {
  computedAt?: Date;
  evidenceIds: string[];
  reasonCodes: string[];
  score?: number;
  state?: string;
};

export type SnapshotCandidateInput = {
  beneficiaryType?: string | null;
  candidateStatus: CandidateStatus;
  companyName: string;
  dashboardVisible: boolean;
  displayGroup?: string | null;
  finalState?: FinalState | null;
  lastScannedAt?: Date | null;
  rejectionReasonCodes: string[];
  reviewPriorityScore?: number;
  securityId: string;
  t1?: SnapshotSignal;
  t3?: SnapshotSignal;
  t4?: SnapshotSignal;
  t6?: SnapshotSignal;
  t8?: SnapshotSignal;
  t8Detail?: ExpressionDecisionDetail;
  ticker: string;
  topFailReason?: string | null;
  topPassReason?: string | null;
};

export type SnapshotEvidenceInput = {
  evidenceGrade?: string | null;
  fetchedAt?: Date;
  freshnessScore?: number;
  metricName: string;
  reasonCode?: string | null;
};

export type SnapshotThemeInput = {
  directBeneficiaryCategories: unknown;
  economicMechanism: unknown;
  excludedCategories: unknown;
  invalidationRules: unknown;
  previousDashboardState?: DashboardState;
  previousThemeRealityScore?: number;
  requiredEconomicProof: unknown;
  seedEtfs: unknown;
  sourceThemeCode?: string | null;
  status: string;
  themeId: string;
  themeName: string;
  themeSlug: string;
};

export type SnapshotTopTicker = {
  beneficiary_type?: string | null;
  company_name: string;
  final_state?: FinalState | null;
  reason_codes: string[];
  review_priority_score?: number | null;
  ticker: string;
  top_fail_reason?: string | null;
  top_pass_reason?: string | null;
};

export type ThemeRealityScoreDetail = {
  caps_applied: string[];
  components: {
    company_level_evidence_breadth: number;
    direct_beneficiary_validation: number;
    evidence_freshness_quality: number;
    mechanism_specificity: number;
    required_proof_coverage: number;
    theme_basket_participation: number;
  };
  final_score: number;
  positive_reason_codes: string[];
  caution_reason_codes: string[];
};

export type ThemeSnapshotComputation = {
  basketPreferred: boolean;
  cautionReasonCodes: string[];
  dashboardState: DashboardState;
  dataQualityScore: number;
  delayedCatchupCount: number;
  directBeneficiaryCount: number;
  highlightReasonCodes: string[];
  investableCandidateCount: number;
  leaderButExtendedCount: number;
  leaderCount: number;
  lastScannedAt?: Date | null;
  noTradeCount: number;
  reviewPriorityScore: number;
  themeReality: ThemeRealityScoreDetail;
  topDirectBeneficiaries: SnapshotTopTicker[];
  topRejectedTickers: SnapshotTopTicker[];
  watchlistOnlyCount: number;
  wrongTickerCount: number;
  etfPreferred: boolean;
};

export type ThemeSnapshotDetail = {
  algorithm_version: string;
  threshold_version: string;
  basket_preferred: boolean;
  candidate_count: number;
  caution_reason_codes: string[];
  dashboard_state: DashboardState;
  data_quality_score: number;
  final_state_counts: Record<string, number>;
  highlight_reason_codes: string[];
  previous_dashboard_state?: DashboardState;
  previous_theme_reality_score?: number;
  review_priority_score: number;
  theme_reality: ThemeRealityScoreDetail;
  top_direct_beneficiaries: SnapshotTopTicker[];
  top_rejected_tickers: SnapshotTopTicker[];
  etf_preferred: boolean;
};

export type SnapshotBuildOptions = {
  themeRef?: string;
};

export type SnapshotThemeSummary = {
  dashboardState: DashboardState;
  directBeneficiaryCount: number;
  investableCandidateCount: number;
  noTradeCount: number;
  reviewPriorityScore: number;
  snapshotId: string;
  sourceThemeCode?: string | null;
  themeId: string;
  themeName: string;
  themeRealityScore: number;
  wrongTickerCount: number;
};

export type SnapshotBuildSummary = {
  evidenceWritten: number;
  jobRunId: string;
  rowsRead: number;
  rowsWritten: number;
  snapshotsBuilt: number;
  themes: SnapshotThemeSummary[];
  warnings: SnapshotWarning[];
};

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
