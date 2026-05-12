import type {
  CandidateStatus,
  FinalState,
  PrismaClient,
} from "@/generated/prisma/client";
import type { PriceScoreDetail } from "@/lib/price/types";
import type { LiquidityScoreDetail } from "@/lib/liquidity/types";

export type ExpressionDbClient = Pick<
  PrismaClient,
  | "candidateSignalScore"
  | "candidateSignalState"
  | "evidenceLedger"
  | "jobItem"
  | "jobLock"
  | "jobRun"
  | "themeCandidate"
>;

export type ValuationState =
  | "VALUATION_ROOM_AVAILABLE"
  | "FAIR"
  | "EXPENSIVE"
  | "EXTREME"
  | "INSUFFICIENT_DATA";

export type ThemeDispersionRiskState = "LOW" | "MODERATE" | "HIGH";

export type ThemeDispersionRiskDetail = {
  algorithm_version: string;
  basket_candidate_count: number;
  components: {
    etf_or_basket_coverage_quality: number;
    evidence_uncertainty: number;
    extension_or_valuation_spread: number;
    quality_candidate_breadth: number;
    single_name_risk: number;
    top_candidate_score_closeness: number;
  };
  eligible_candidate_count: number;
  etf_coverage_quality: number;
  reason_codes: string[];
  state: ThemeDispersionRiskState;
  third_candidate_score?: number;
  threshold_version: string;
  top_candidate_score?: number;
  total_score: number;
};

export type ExpressionSignalSnapshot = {
  evidenceIds: string[];
  reasonCodes: string[];
  score?: number;
  state?: string;
};

export type ExpressionCandidateInput = {
  beneficiaryType?: string | null;
  candidateStatus?: string;
  priceDetail?: PriceScoreDetail;
  securityId?: string;
  sourceOfInclusion?: string;
  t1: ExpressionSignalSnapshot;
  themeRealityScore?: number;
  t3: ExpressionSignalSnapshot;
  t4: ExpressionSignalSnapshot;
  t6: ExpressionSignalSnapshot;
  t6Detail?: LiquidityScoreDetail;
  themeCandidateId?: string;
  ticker?: string;
};

export type ExpressionDecisionDetail = {
  algorithm_version: string;
  blocking_reason_codes: string[];
  data_freshness_warning: boolean;
  display_group: string;
  evidence_count: number;
  expression: string;
  final_state: FinalState;
  next_state_to_watch: string;
  primary_reason: string;
  reason_codes: string[];
  review_priority_score: number;
  supporting_reason_codes: string[];
  theme_dispersion_risk?: ThemeDispersionRiskDetail;
  threshold_version: string;
};

export type ExpressionDecisionResult = {
  candidateStatus: CandidateStatus;
  dashboardVisible: boolean;
  detail: ExpressionDecisionDetail;
  evidenceIds: string[];
  finalState: FinalState;
  primaryReasonCode: string;
  rejectionReasonCodes: string[];
  reviewPriorityScore: number;
  topFailReason?: string;
  topPassReason?: string;
};

export type ExpressionCandidateForDispersion = ExpressionCandidateInput & {
  provisionalPriorityScore: number;
};

export type ExpressionScoringOptions = {
  themeRef?: string;
  ticker?: string;
};

export type ExpressionThemeSummary = {
  basketPreferred: number;
  candidatesScored: number;
  delayedCatchUp: number;
  etfPreferred: number;
  insufficientData: number;
  leaderButExtended: number;
  noTrade: number;
  nonParticipant: number;
  rejected: number;
  singleStockResearchJustified: number;
  sourceThemeCode: string;
  themeDispersionRiskScore: number;
  themeDispersionRiskState: ThemeDispersionRiskState;
  themeId: string;
  themeName: string;
  watchlistOnly: number;
  wrongTicker: number;
};

export type ExpressionScoringSummary = {
  candidatesScored: number;
  evidenceWritten: number;
  jobRunId: string;
  rowsRead: number;
  rowsWritten: number;
  themes: ExpressionThemeSummary[];
  warnings: Array<{
    code: string;
    message: string;
    severity: "INFO" | "WARNING" | "BLOCKER";
    themeCode?: string;
    ticker?: string;
  }>;
};
