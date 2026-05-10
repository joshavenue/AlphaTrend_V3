export type ProviderName =
  | "SEC"
  | "NASDAQ_TRADER"
  | "MASSIVE"
  | "FMP"
  | "OPENFIGI"
  | "ALPHA_VANTAGE"
  | "FRED"
  | "BEA"
  | "BLS"
  | "EIA"
  | "USA_SPENDING"
  | "USPTO";

export type ProviderEndpoint = string;

export type EvidenceGrade = "A" | "B" | "C" | "D";

export type EvidenceReliability = EvidenceGrade;

export type UniverseBucket =
  | "US_COMMON_ALL"
  | "US_COMMON_LIQUID"
  | "US_COMMON_CORE"
  | "US_MICROCAP_SPECULATIVE"
  | "US_ETF_ALL"
  | "US_ADR_ALL"
  | "US_DELISTED_HISTORY"
  | "REVIEW_REQUIRED";

export type CandidateStatus =
  | "ACTIVE"
  | "REJECTED"
  | "WATCH_ONLY"
  | "NO_TRADE"
  | "INACTIVE"
  | "REVIEW_REQUIRED";

export type BeneficiaryType =
  | "DIRECT_BENEFICIARY"
  | "MAJOR_BENEFICIARY"
  | "PARTIAL_BENEFICIARY"
  | "INDIRECT_BENEFICIARY"
  | "NARRATIVE_ADJACENT"
  | "SAME_SECTOR_ONLY"
  | "UNRELATED"
  | "UNKNOWN";

export type FundamentalState =
  | "VALIDATED"
  | "IMPROVING"
  | "NOT_YET_VALIDATED"
  | "DETERIORATING"
  | "CONTRADICTED"
  | "INSUFFICIENT_DATA";

export type PriceState =
  | "NEUTRAL"
  | "IMPROVING"
  | "PARTICIPANT"
  | "LEADER"
  | "LEADER_BUT_EXTENDED"
  | "DELAYED_CATCH_UP_CANDIDATE"
  | "NON_PARTICIPANT"
  | "PRICE_OUTRAN_EVIDENCE"
  | "NEEDS_CONSOLIDATION"
  | "BROKEN"
  | "INSUFFICIENT_DATA";

export type LiquidityState =
  | "CORE_ELIGIBLE"
  | "EXPANDED_ELIGIBLE"
  | "SPECULATIVE_ONLY"
  | "ILLIQUID"
  | "INSUFFICIENT_DATA";

export type DilutionRiskState =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "SEVERE"
  | "INSUFFICIENT_DATA";

export type FlowState =
  | "NOT_BUILT_MVP_PLACEHOLDER"
  | "ETF_FLOW_ELIGIBLE"
  | "BROADENING_OWNERSHIP"
  | "INSTITUTIONAL_ACCUMULATION"
  | "CROWDED_OWNERSHIP"
  | "DISTRIBUTION_OR_TRIMMING"
  | "NO_MEANINGFUL_FLOW_ACCESS"
  | "INSUFFICIENT_DATA";

export type BaseRateState =
  | "NOT_BUILT_MVP_PLACEHOLDER"
  | "SUPPORTIVE"
  | "MIXED"
  | "UNFAVORABLE"
  | "LOW_SAMPLE_WARNING"
  | "INSUFFICIENT_DATA";

export type TickerFinalState =
  | "SINGLE_STOCK_RESEARCH_JUSTIFIED"
  | "BASKET_PREFERRED"
  | "ETF_PREFERRED"
  | "WATCHLIST_ONLY"
  | "LEADER_BUT_EXTENDED"
  | "DELAYED_CATCH_UP_CANDIDATE"
  | "NON_PARTICIPANT"
  | "WRONG_TICKER"
  | "NO_TRADE"
  | "REJECTED"
  | "INVALIDATED"
  | "INSUFFICIENT_DATA";

export type FinalState = TickerFinalState;

export type DashboardState =
  | "WORTH_CHECKING_OUT"
  | "EARLY_WATCHLIST"
  | "CONFIRMED_BUT_EXTENDED"
  | "CROWDED_LATE"
  | "FADING"
  | "INSUFFICIENT_EVIDENCE"
  | "NO_CLEAN_EXPRESSION"
  | "REJECTED_INACTIVE";

export type ThemeState = DashboardState;

export type ApiCallStatus =
  | "NOT_RUN"
  | "SUCCESS"
  | "DEGRADED"
  | "FAILED"
  | "UNCONFIGURED"
  | "LICENSE_BLOCKED";
