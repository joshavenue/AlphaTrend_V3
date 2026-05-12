export type ReasonSeverity =
  | "INFO"
  | "POSITIVE"
  | "CAUTION"
  | "WARNING"
  | "BLOCKER";

export type ReasonMeta = {
  code: string;
  description: string;
  displayLabel: string;
  severity: ReasonSeverity;
};

const meta = (
  displayLabel: string,
  description: string,
  severity: ReasonSeverity,
) => ({
  description,
  displayLabel,
  severity,
});

export const REASON_METADATA: Record<string, Omit<ReasonMeta, "code">> = {
  DATA_MISSING: meta(
    "Data missing",
    "A required provider or internal data point was not available.",
    "CAUTION",
  ),
  DATA_PERIOD_MISMATCH: meta(
    "Data period mismatch",
    "Provider data did not align to the expected reporting period.",
    "CAUTION",
  ),
  DATA_STALE: meta(
    "Data stale",
    "The latest available source data is older than the freshness rule allows.",
    "CAUTION",
  ),
  DATA_VENDOR_DISAGREEMENT: meta(
    "Provider disagreement",
    "Provider values materially disagreed and require reconciliation.",
    "WARNING",
  ),
  DECISION_BASKET_PREFERRED: meta(
    "Basket preferred",
    "The theme has multiple candidates or dispersion risk that makes basket expression preferable.",
    "INFO",
  ),
  DECISION_DELAYED_CATCHUP_CANDIDATE: meta(
    "Delayed catch-up candidate",
    "The ticker has improving evidence but has not yet reached leader participation.",
    "INFO",
  ),
  DECISION_ETF_PREFERRED: meta(
    "ETF preferred",
    "ETF expression is cleaner than a single ticker for this theme state.",
    "INFO",
  ),
  DECISION_INSUFFICIENT_DATA: meta(
    "Insufficient decision data",
    "The engine could not make a final expression decision from current inputs.",
    "CAUTION",
  ),
  DECISION_INVALIDATED: meta(
    "Invalidated",
    "A blocker or invalidation rule prevents this ticker or theme from qualifying.",
    "BLOCKER",
  ),
  DECISION_LEADER_BUT_EXTENDED: meta(
    "Leader but extended",
    "The ticker is a leader, but price or valuation extension argues for watchlist treatment.",
    "WARNING",
  ),
  DECISION_NO_TRADE: meta(
    "No trade",
    "A risk or evidence blocker prevents a clean expression.",
    "BLOCKER",
  ),
  DECISION_NON_PARTICIPANT: meta(
    "Non-participant",
    "The ticker is not currently participating enough for expression.",
    "CAUTION",
  ),
  DECISION_REJECTED: meta(
    "Rejected",
    "The ticker failed one or more required AlphaTrend gates.",
    "BLOCKER",
  ),
  DECISION_SINGLE_STOCK_RESEARCH_JUSTIFIED: meta(
    "Single-stock research justified",
    "The ticker passed enough gates to justify company-specific research.",
    "POSITIVE",
  ),
  DECISION_WATCHLIST_ONLY: meta(
    "Watchlist only",
    "The ticker is useful to monitor but is not a clean expression now.",
    "INFO",
  ),
  DECISION_WRONG_TICKER: meta(
    "Wrong ticker for theme",
    "The ticker does not capture the theme's economic mechanism despite surface-level similarity.",
    "BLOCKER",
  ),
  DEMAND_EVIDENCE_STALE: meta(
    "Demand evidence stale",
    "Theme-level demand proof has not refreshed recently enough.",
    "CAUTION",
  ),
  DEMAND_MECHANISM_SPECIFIC: meta(
    "Mechanism specific",
    "The theme has a testable economic mechanism instead of generic buzzwords.",
    "POSITIVE",
  ),
  DEMAND_MULTIPLE_BENEFICIARIES_VALIDATE: meta(
    "Multiple beneficiaries validate",
    "More than one candidate supports that the theme is economically real.",
    "POSITIVE",
  ),
  DEMAND_ONLY_C_GRADE_EVIDENCE: meta(
    "Only C-grade evidence",
    "Current demand proof is present but weak.",
    "CAUTION",
  ),
  DEMAND_ONLY_D_GRADE_EVIDENCE: meta(
    "Only D-grade evidence",
    "Current demand proof is too weak to support high confidence.",
    "WARNING",
  ),
  DEMAND_PROOF_MISSING: meta(
    "Demand proof missing",
    "Theme-level economic proof is missing or not yet loaded.",
    "WARNING",
  ),
  DEMAND_PROVIDER_DATA_GAP: meta(
    "Demand provider data gap",
    "Provider data needed for theme reality is missing or blocked.",
    "CAUTION",
  ),
  DEMAND_REQUIRED_PROOF_PRESENT: meta(
    "Required proof present",
    "The required theme proof fields are present in the theme definition.",
    "POSITIVE",
  ),
  DILUTION_LOW_RISK: meta(
    "Low dilution risk",
    "Share-count and offering evidence does not show a current dilution blocker.",
    "POSITIVE",
  ),
  DILUTION_RECENT_OFFERING: meta(
    "Recent material offering",
    "Recent offering evidence plus share-count growth is material enough to affect expression.",
    "WARNING",
  ),
  DILUTION_SEVERE: meta(
    "Severe dilution",
    "Share-count growth or offering activity is high enough to block clean expression.",
    "BLOCKER",
  ),
  DILUTION_SHARE_COUNT_WARNING: meta(
    "Share count warning",
    "Share count growth is elevated and should be monitored.",
    "WARNING",
  ),
  DISPERSION_ETF_COVERAGE_GOOD: meta(
    "ETF coverage good",
    "Available ETF coverage is broad enough to express the theme.",
    "INFO",
  ),
  DISPERSION_LEADERS_EXTENDED: meta(
    "Leaders extended",
    "The cleanest leaders are price or valuation extended.",
    "WARNING",
  ),
  DISPERSION_MULTIPLE_QUALITY_CANDIDATES: meta(
    "Multiple quality candidates",
    "Several candidates qualify, reducing single-name clarity.",
    "INFO",
  ),
  DISPERSION_NO_CLEAR_SINGLE_LEADER: meta(
    "No clear single leader",
    "The theme does not have one clean dominant ticker.",
    "CAUTION",
  ),
  EXPOSURE_BUSINESS_LINE_MATCH: meta(
    "Business-line match",
    "The company business line matches a direct or indirect theme category.",
    "POSITIVE",
  ),
  EXPOSURE_DIRECT_CATEGORY_MATCH: meta(
    "Direct category match",
    "The company's reported business line directly matches a theme's direct beneficiary category.",
    "POSITIVE",
  ),
  EXPOSURE_EXCLUDED_CATEGORY_MATCH: meta(
    "Excluded category match",
    "The company matches a category that should be excluded for this theme.",
    "BLOCKER",
  ),
  EXPOSURE_INDIRECT_CATEGORY_MATCH: meta(
    "Indirect category match",
    "The company has an indirect link to the theme but is not a pure beneficiary.",
    "INFO",
  ),
  EXPOSURE_MANUAL_SEED_ONLY: meta(
    "Manual seed only",
    "The ticker came only from manual seed data and has not been provider-backed.",
    "CAUTION",
  ),
  EXPOSURE_NO_DIRECT_OR_INDIRECT_MATCH: meta(
    "No direct or indirect match",
    "The candidate lacks a validated direct or indirect category match.",
    "BLOCKER",
  ),
  EXPOSURE_NO_REVENUE_LINK: meta(
    "No revenue link",
    "No revenue or business-line evidence ties the company to the theme.",
    "BLOCKER",
  ),
  EXPOSURE_SAME_SECTOR_ONLY: meta(
    "Same sector only",
    "The company shares a sector with the theme but lacks mechanism-level exposure.",
    "BLOCKER",
  ),
  EXPOSURE_SEGMENT_DATA_MISSING: meta(
    "Segment data missing",
    "Segment disclosure was not available for stronger exposure support.",
    "CAUTION",
  ),
  EXPOSURE_SEGMENT_SUPPORT: meta(
    "Segment support",
    "Segment evidence supports the theme exposure claim.",
    "POSITIVE",
  ),
  FRAGILITY_CASH_RUNWAY_LOW: meta(
    "Low cash runway",
    "Cash runway evidence indicates financial fragility.",
    "WARNING",
  ),
  FRAGILITY_GOING_CONCERN: meta(
    "Going concern flag",
    "Filing evidence contains a going-concern or severe fragility warning.",
    "BLOCKER",
  ),
  FRAGILITY_NO_MAJOR_FLAGS: meta(
    "No major fragility flags",
    "The engine did not find major liquidity or fragility blockers.",
    "POSITIVE",
  ),
  FUNDAMENTAL_BALANCE_SHEET_HEALTHY: meta(
    "Balance sheet healthy",
    "Balance sheet evidence supports the ticker's fundamental quality.",
    "POSITIVE",
  ),
  FUNDAMENTAL_CRITICAL_DATA_MISSING: meta(
    "Critical fundamental data missing",
    "Required fundamental evidence is missing.",
    "WARNING",
  ),
  FUNDAMENTAL_FCF_POSITIVE: meta(
    "Free cash flow positive",
    "Free cash flow evidence is positive.",
    "POSITIVE",
  ),
  FUNDAMENTAL_REVENUE_ACCELERATING: meta(
    "Revenue accelerating",
    "Recent revenue growth improved versus the prior comparison period.",
    "POSITIVE",
  ),
  FUNDAMENTAL_REVENUE_GROWING: meta(
    "Revenue growing",
    "Revenue is growing over the selected comparison period.",
    "POSITIVE",
  ),
  LIQUIDITY_CORE_ELIGIBLE: meta(
    "Core liquidity eligible",
    "Liquidity is high enough for core AlphaTrend eligibility.",
    "POSITIVE",
  ),
  LIQUIDITY_DOLLAR_VOLUME_HEALTHY: meta(
    "Dollar volume healthy",
    "Average dollar volume is sufficient for clean monitoring.",
    "POSITIVE",
  ),
  LIQUIDITY_DOLLAR_VOLUME_LOW: meta(
    "Dollar volume low",
    "Average dollar volume is below the preferred liquidity threshold.",
    "WARNING",
  ),
  LIQUIDITY_ILLIQUID: meta(
    "Illiquid",
    "Liquidity is too low for clean single-stock expression.",
    "BLOCKER",
  ),
  PRICE_LEADER: meta(
    "Price leader",
    "The ticker is leading the theme on price participation.",
    "POSITIVE",
  ),
  PRICE_LEADER_EXTENDED: meta(
    "Leader but extended",
    "The ticker is participating as a leader, but price extension makes immediate expression less attractive.",
    "WARNING",
  ),
  PRICE_RS_VS_THEME_POSITIVE: meta(
    "Relative strength positive",
    "The ticker is outperforming the theme basket or proxy.",
    "POSITIVE",
  ),
  PRICE_STALE_DATA: meta(
    "Price data stale",
    "Price data freshness is insufficient for upgrades.",
    "CAUTION",
  ),
  PRICE_THEME_BASKET_PROXY_USED: meta(
    "Theme basket proxy used",
    "Theme-relative price participation used the basket proxy.",
    "INFO",
  ),
  PRICE_VOLUME_CONFIRMATION: meta(
    "Volume confirmation",
    "Volume behavior confirms participation.",
    "POSITIVE",
  ),
  THEME_MECHANISM_SPECIFIC: meta(
    "Mechanism specific",
    "The theme definition includes a testable economic mechanism.",
    "INFO",
  ),
  THEME_REQUIRED_PROOF_PRESENT: meta(
    "Required proof present",
    "The theme definition includes economic proof requirements.",
    "INFO",
  ),
  VALUATION_EXPENSIVE: meta(
    "Valuation expensive",
    "Valuation is stretched versus the threshold registry.",
    "WARNING",
  ),
  VALUATION_EXTREME: meta(
    "Valuation extreme",
    "Valuation is extreme enough to block clean expression.",
    "BLOCKER",
  ),
  VALUATION_ROOM_AVAILABLE: meta(
    "Valuation room available",
    "Valuation is not blocking the current state.",
    "POSITIVE",
  ),
};

export function getReasonMeta(code: string | null | undefined): ReasonMeta {
  if (!code) {
    return {
      code: "",
      description: "No reason code was supplied for this row.",
      displayLabel: "No reason supplied",
      severity: "INFO",
    };
  }

  const known = REASON_METADATA[code];

  if (!known) {
    return {
      code,
      description:
        "This reason code has not been registered with display metadata yet.",
      displayLabel: "Unrecognized reason",
      severity: "INFO",
    };
  }

  return {
    code,
    ...known,
  };
}

export function severityGlyph(severity: ReasonSeverity) {
  switch (severity) {
    case "POSITIVE":
      return "+";
    case "CAUTION":
      return "!";
    case "WARNING":
      return "!!";
    case "BLOCKER":
      return "x";
    case "INFO":
    default:
      return ".";
  }
}
