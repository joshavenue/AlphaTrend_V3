import {
  T8_EXPRESSION_ALGORITHM_VERSION,
  T8_EXPRESSION_THRESHOLD_VERSION,
  T8_REASON_CODES,
  T8_REVIEW_PRIORITY_WEIGHTS,
} from "@/lib/expression/constants";
import type {
  ExpressionCandidateForDispersion,
  ExpressionCandidateInput,
  ExpressionDecisionResult,
  ThemeDispersionRiskDetail,
  ThemeDispersionRiskState,
  ValuationState,
} from "@/lib/expression/types";

const STRONG_T1_STATES = new Set([
  "MAJOR_BENEFICIARY",
  "DIRECT_BENEFICIARY",
  "PARTIAL_BENEFICIARY",
]);
const WEAK_T1_STATES = new Set([
  "NARRATIVE_ADJACENT",
  "SAME_SECTOR_ONLY",
  "UNRELATED",
]);
const VALID_T3_STATES = new Set(["VALIDATED", "IMPROVING"]);
const WEAK_T3_STATES = new Set([
  "CONTRADICTED",
  "DETERIORATING",
  "INSUFFICIENT_DATA",
  "NOT_YET_VALIDATED",
]);
const POSITIVE_PRICE_STATES = new Set(["LEADER", "PARTICIPANT"]);
const CLEAN_LIQUIDITY_STATES = new Set(["CORE_ELIGIBLE", "EXPANDED_ELIGIBLE"]);
const T6_BLOCKING_REASON_CODES = new Set([
  "DILUTION_RECENT_OFFERING",
  "DILUTION_SEVERE",
  "FRAGILITY_GOING_CONCERN",
  "LIQUIDITY_ILLIQUID",
]);
function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value: number) {
  return Math.round(clamp(value) * 100) / 100;
}

function numericScore(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? clamp(Number(value)) : fallback;
}

function fundamentalStateScore(state: string | undefined) {
  if (state === "VALIDATED") {
    return 100;
  }

  if (state === "IMPROVING") {
    return 80;
  }

  if (state === "NOT_YET_VALIDATED") {
    return 45;
  }

  if (state === "INSUFFICIENT_DATA") {
    return 25;
  }

  return 0;
}

function priceStateScore(state: string | undefined) {
  if (state === "LEADER") {
    return 90;
  }

  if (state === "PARTICIPANT") {
    return 78;
  }

  if (state === "DELAYED_CATCH_UP_CANDIDATE") {
    return 65;
  }

  if (state === "IMPROVING") {
    return 55;
  }

  if (state === "LEADER_BUT_EXTENDED") {
    return 50;
  }

  if (state === "NEEDS_CONSOLIDATION" || state === "PRICE_OUTRAN_EVIDENCE") {
    return 35;
  }

  if (state === "NON_PARTICIPANT" || state === "INSUFFICIENT_DATA") {
    return 20;
  }

  return 0;
}

function valuationState(input: ExpressionCandidateInput): ValuationState {
  const state = input.priceDetail?.valuation.state;

  if (
    state === "VALUATION_ROOM_AVAILABLE" ||
    state === "FAIR" ||
    state === "EXPENSIVE" ||
    state === "EXTREME" ||
    state === "INSUFFICIENT_DATA"
  ) {
    return state;
  }

  return "INSUFFICIENT_DATA";
}

function valuationStateScore(state: ValuationState) {
  if (state === "VALUATION_ROOM_AVAILABLE") {
    return 100;
  }

  if (state === "FAIR") {
    return 75;
  }

  if (state === "INSUFFICIENT_DATA") {
    return 45;
  }

  if (state === "EXPENSIVE") {
    return 25;
  }

  return 0;
}

function liquidityStateScore(state: string | undefined) {
  if (state === "CORE_ELIGIBLE") {
    return 100;
  }

  if (state === "EXPANDED_ELIGIBLE") {
    return 75;
  }

  if (state === "SPECULATIVE_ONLY") {
    return 35;
  }

  if (state === "INSUFFICIENT_DATA") {
    return 25;
  }

  return 0;
}

function dataQualityScore(input: ExpressionCandidateInput) {
  const requiredLayers = [input.t1, input.t3, input.t4, input.t6];
  const presentLayers = requiredLayers.filter((layer) => layer.state).length;
  const staleOrMissing = requiredLayers.some((layer) =>
    layer.reasonCodes.some(
      (code) => code === "DATA_MISSING" || code === "DATA_STALE",
    ),
  );

  if (presentLayers === requiredLayers.length && !staleOrMissing) {
    return 100;
  }

  return presentLayers * 20;
}

export function calculateReviewPriorityScore(input: ExpressionCandidateInput) {
  const t3Basis =
    input.t3.score !== undefined
      ? numericScore(input.t3.score)
      : fundamentalStateScore(input.t3.state);
  const t4Basis =
    input.t4.score !== undefined
      ? numericScore(input.t4.score)
      : priceStateScore(input.t4.state);

  const score =
    numericScore(input.t1.score) * T8_REVIEW_PRIORITY_WEIGHTS.exposurePurity +
    t3Basis * T8_REVIEW_PRIORITY_WEIGHTS.fundamentalValidation +
    t4Basis * T8_REVIEW_PRIORITY_WEIGHTS.priceParticipation +
    valuationStateScore(valuationState(input)) *
      T8_REVIEW_PRIORITY_WEIGHTS.valuationRoom +
    liquidityStateScore(input.t6.state) *
      T8_REVIEW_PRIORITY_WEIGHTS.liquidityQuality +
    dataQualityScore(input) * T8_REVIEW_PRIORITY_WEIGHTS.dataQualityFreshness;

  return roundScore(score);
}

function hasT6Veto(input: ExpressionCandidateInput, veto: string) {
  const flags = input.t6Detail?.veto_flags ?? [];

  return flags.some((flag) => flag === veto);
}

function hasGoingConcernWithWeakFundamentals(input: ExpressionCandidateInput) {
  const hasGoingConcern =
    (input.t6Detail?.metrics.goingConcernFilingCount ?? 0) > 0 ||
    input.t6.reasonCodes.includes("FRAGILITY_GOING_CONCERN") ||
    hasT6Veto(input, "GOING_CONCERN_AND_WEAK_FUNDAMENTALS");

  return hasGoingConcern && WEAK_T3_STATES.has(input.t3.state ?? "");
}

function isQualityCandidate(input: ExpressionCandidateInput) {
  return (
    numericScore(input.t1.score) >= 50 &&
    STRONG_T1_STATES.has(input.t1.state ?? "") &&
    VALID_T3_STATES.has(input.t3.state ?? "") &&
    CLEAN_LIQUIDITY_STATES.has(input.t6.state ?? "") &&
    input.t6Detail?.dilution_risk_state !== "SEVERE" &&
    !hasT6Veto(input, "SEVERE_DILUTION") &&
    !hasT6Veto(input, "ILLIQUID") &&
    !hasT6Veto(input, "RECENT_MATERIAL_OFFERING")
  );
}

function hasSingleNameRisk(input: ExpressionCandidateInput) {
  return (
    input.t4.state === "LEADER_BUT_EXTENDED" ||
    valuationState(input) === "EXTREME" ||
    input.t6Detail?.dilution_risk_state === "HIGH" ||
    input.t6Detail?.dilution_risk_state === "SEVERE" ||
    input.t6.state === "EXPANDED_ELIGIBLE" ||
    input.t6.state === "SPECULATIVE_ONLY" ||
    input.t3.state === "NOT_YET_VALIDATED"
  );
}

function missingCriticalLayer(input: ExpressionCandidateInput) {
  return (
    !input.t1.state || !input.t3.state || !input.t4.state || !input.t6.state
  );
}

function detail(
  input: {
    blocking: string[];
    displayGroup: string;
    expression: string;
    finalState: ExpressionDecisionResult["finalState"];
    primaryReason: string;
    reasonCodes: string[];
    reviewPriorityScore: number;
    supporting?: string[];
    themeDispersionRisk?: ThemeDispersionRiskDetail;
  },
  candidate: ExpressionCandidateInput,
) {
  const evidenceIds = uniqueEvidenceIds(candidate);
  const blockingReasonCodes = [...new Set(input.blocking)];
  const reasonCodes = [...new Set(input.reasonCodes)];
  const supportingReasonCodes = [
    ...new Set(
      input.supporting ??
        reasonCodes.filter((code) => !blockingReasonCodes.includes(code)),
    ),
  ];

  return {
    algorithm_version: T8_EXPRESSION_ALGORITHM_VERSION,
    blocking_reason_codes: blockingReasonCodes,
    data_freshness_warning: reasonCodes.includes("DATA_STALE"),
    display_group: input.displayGroup,
    evidence_count: evidenceIds.length,
    expression: input.expression,
    final_state: input.finalState,
    next_state_to_watch: nextStateToWatch(input.finalState),
    primary_reason: input.primaryReason,
    reason_codes: reasonCodes,
    review_priority_score: input.reviewPriorityScore,
    supporting_reason_codes: supportingReasonCodes,
    theme_dispersion_risk: input.themeDispersionRisk,
    threshold_version: T8_EXPRESSION_THRESHOLD_VERSION,
  };
}

function uniqueEvidenceIds(input: ExpressionCandidateInput) {
  return [
    ...new Set([
      ...input.t1.evidenceIds,
      ...input.t3.evidenceIds,
      ...input.t4.evidenceIds,
      ...input.t6.evidenceIds,
    ]),
  ];
}

function nextStateToWatch(finalState: ExpressionDecisionResult["finalState"]) {
  if (finalState === "WATCHLIST_ONLY") {
    return "fundamentals validation, price participation, and T6 risk cleanup";
  }

  if (finalState === "LEADER_BUT_EXTENDED") {
    return "consolidation or valuation reset";
  }

  if (finalState === "DELAYED_CATCH_UP_CANDIDATE") {
    return "continued relative-strength improvement";
  }

  if (finalState === "NO_TRADE") {
    return "risk veto removed by new filings and fundamentals";
  }

  if (finalState === "WRONG_TICKER" || finalState === "REJECTED") {
    return "new exposure evidence";
  }

  if (finalState === "BASKET_PREFERRED" || finalState === "ETF_PREFERRED") {
    return "dispersion risk and clean single-name candidate emergence";
  }

  return "state change in T1, T3, T4, or T6";
}

function statusForFinalState(
  finalState: ExpressionDecisionResult["finalState"],
): ExpressionDecisionResult["candidateStatus"] {
  if (finalState === "SINGLE_STOCK_RESEARCH_JUSTIFIED") {
    return "ACTIVE";
  }

  if (finalState === "NO_TRADE") {
    return "NO_TRADE";
  }

  if (
    finalState === "WRONG_TICKER" ||
    finalState === "REJECTED" ||
    finalState === "INVALIDATED"
  ) {
    return "REJECTED";
  }

  if (finalState === "INSUFFICIENT_DATA") {
    return "REVIEW_REQUIRED";
  }

  return "WATCH_ONLY";
}

function result(
  candidate: ExpressionCandidateInput,
  input: {
    blocking?: string[];
    displayGroup: string;
    expression: string;
    finalState: ExpressionDecisionResult["finalState"];
    primaryReason: string;
    reasonCodes: string[];
    reviewPriorityScore: number;
    supporting?: string[];
    themeDispersionRisk?: ThemeDispersionRiskDetail;
    topFailReason?: string;
    topPassReason?: string;
  },
): ExpressionDecisionResult {
  const blocking = input.blocking ?? [];
  const outputDetail = detail(
    {
      blocking,
      displayGroup: input.displayGroup,
      expression: input.expression,
      finalState: input.finalState,
      primaryReason: input.primaryReason,
      reasonCodes: input.reasonCodes,
      reviewPriorityScore: input.reviewPriorityScore,
      supporting: input.supporting,
      themeDispersionRisk: input.themeDispersionRisk,
    },
    candidate,
  );

  return {
    candidateStatus: statusForFinalState(input.finalState),
    dashboardVisible: input.finalState !== "INSUFFICIENT_DATA",
    detail: outputDetail,
    evidenceIds: uniqueEvidenceIds(candidate),
    finalState: input.finalState,
    primaryReasonCode: input.reasonCodes[0] ?? T8_REASON_CODES.DATA_MISSING,
    rejectionReasonCodes: blocking,
    reviewPriorityScore: input.reviewPriorityScore,
    topFailReason: input.topFailReason,
    topPassReason: input.topPassReason,
  };
}

export function calculateThemeDispersionRisk(
  candidates: ExpressionCandidateForDispersion[],
  options: {
    seedEtfCount?: number;
  } = {},
): ThemeDispersionRiskDetail {
  const qualityCandidates = candidates.filter(isQualityCandidate);
  const sortedScores = [...qualityCandidates]
    .map((candidate) => candidate.provisionalPriorityScore)
    .sort((a, b) => b - a);
  const topScore = sortedScores[0];
  const thirdScore = sortedScores[2];
  const extendedOrExpensive = qualityCandidates.filter(
    (candidate) =>
      candidate.t4.state === "LEADER_BUT_EXTENDED" ||
      valuationState(candidate) === "EXPENSIVE" ||
      valuationState(candidate) === "EXTREME",
  ).length;
  const uncertain = candidates.filter(
    (candidate) =>
      missingCriticalLayer(candidate) ||
      candidate.t3.state === "INSUFFICIENT_DATA" ||
      candidate.t4.state === "INSUFFICIENT_DATA" ||
      candidate.t6.state === "INSUFFICIENT_DATA",
  ).length;
  const seedEtfCount = options.seedEtfCount ?? 0;
  const components = {
    etf_or_basket_coverage_quality:
      seedEtfCount > 0 && qualityCandidates.length >= 5
        ? 10
        : seedEtfCount > 0 && qualityCandidates.length >= 3
          ? 6
          : seedEtfCount > 0
            ? 3
            : 0,
    evidence_uncertainty: uncertain >= 3 ? 10 : uncertain >= 1 ? 5 : 0,
    extension_or_valuation_spread:
      qualityCandidates.length >= 2 &&
      extendedOrExpensive >= Math.ceil(qualityCandidates.length / 2)
        ? 15
        : qualityCandidates.length >= 2 && extendedOrExpensive > 0
          ? 10
          : extendedOrExpensive === 1
            ? 5
            : 0,
    quality_candidate_breadth:
      qualityCandidates.length > 5
        ? 25
        : qualityCandidates.length >= 3
          ? 18
          : qualityCandidates.length === 2
            ? 10
            : 0,
    single_name_risk:
      qualityCandidates.length === 1 && hasSingleNameRisk(qualityCandidates[0])
        ? 20
        : qualityCandidates.length === 1
          ? 12
          : qualityCandidates.some(hasSingleNameRisk)
            ? 6
            : 0,
    top_candidate_score_closeness:
      topScore !== undefined &&
      thirdScore !== undefined &&
      topScore - thirdScore <= 10
        ? 20
        : topScore !== undefined &&
            thirdScore !== undefined &&
            topScore - thirdScore <= 20
          ? 12
          : sortedScores.length >= 2 && sortedScores[0] - sortedScores[1] <= 15
            ? 6
            : 0,
  };
  const totalScore = Object.values(components).reduce(
    (sum, value) => sum + value,
    0,
  );
  const state: ThemeDispersionRiskState =
    totalScore >= 60 ? "HIGH" : totalScore >= 35 ? "MODERATE" : "LOW";
  const reasonCodes = new Set<string>();

  if (qualityCandidates.length >= 2) {
    reasonCodes.add(T8_REASON_CODES.DISPERSION_MULTIPLE_QUALITY_CANDIDATES);
  } else {
    reasonCodes.add(T8_REASON_CODES.DISPERSION_INSUFFICIENT_CANDIDATES);
  }

  if (components.top_candidate_score_closeness > 0) {
    reasonCodes.add(T8_REASON_CODES.DISPERSION_NO_CLEAR_SINGLE_LEADER);
  }

  if (components.extension_or_valuation_spread > 0) {
    reasonCodes.add(T8_REASON_CODES.DISPERSION_LEADERS_EXTENDED);
  }

  if (components.single_name_risk > 0) {
    reasonCodes.add(T8_REASON_CODES.DISPERSION_SINGLE_NAME_RISK);
  }

  if (components.etf_or_basket_coverage_quality >= 6) {
    reasonCodes.add(T8_REASON_CODES.DISPERSION_ETF_COVERAGE_GOOD);
  } else if (seedEtfCount > 0) {
    reasonCodes.add(T8_REASON_CODES.DISPERSION_ETF_TOO_BROAD);
  }

  return {
    algorithm_version: T8_EXPRESSION_ALGORITHM_VERSION,
    basket_candidate_count: qualityCandidates.length,
    components,
    eligible_candidate_count: qualityCandidates.length,
    etf_coverage_quality: components.etf_or_basket_coverage_quality,
    reason_codes: [...reasonCodes],
    state,
    third_candidate_score: thirdScore,
    threshold_version: T8_EXPRESSION_THRESHOLD_VERSION,
    top_candidate_score: topScore,
    total_score: totalScore,
  };
}

export function scoreExpressionDecision(
  candidate: ExpressionCandidateInput,
  themeDispersionRisk?: ThemeDispersionRiskDetail,
): ExpressionDecisionResult {
  const reviewPriorityScore = calculateReviewPriorityScore(candidate);
  const baseReasons = [
    ...candidate.t1.reasonCodes,
    ...candidate.t3.reasonCodes,
    ...candidate.t4.reasonCodes,
    ...candidate.t6.reasonCodes,
  ];
  const decide = (input: Parameters<typeof result>[1]) =>
    result(candidate, {
      themeDispersionRisk,
      ...input,
    });

  if (!candidate.t1.state || candidate.t1.score === undefined) {
    return decide({
      blocking: [T8_REASON_CODES.DATA_MISSING],
      displayGroup: "Insufficient data",
      expression: "Research pending",
      finalState: "INSUFFICIENT_DATA",
      primaryReason:
        "T1 exposure purity is missing, so no final expression can be assigned.",
      reasonCodes: [
        T8_REASON_CODES.DECISION_INSUFFICIENT_DATA,
        T8_REASON_CODES.DATA_MISSING,
      ],
      reviewPriorityScore,
      topFailReason: "Missing T1 exposure purity",
    });
  }

  if (
    numericScore(candidate.t1.score) < 30 ||
    WEAK_T1_STATES.has(candidate.t1.state)
  ) {
    return decide({
      blocking: [
        T8_REASON_CODES.DECISION_WRONG_TICKER,
        ...baseReasons.filter((code) => code.startsWith("EXPOSURE_")),
      ],
      displayGroup: "Wrong ticker / rejected",
      expression: "No clean theme expression",
      finalState: "WRONG_TICKER",
      primaryReason: "Exposure purity failed the T1 wrong-ticker gate.",
      reasonCodes: [T8_REASON_CODES.DECISION_WRONG_TICKER, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "Exposure purity below threshold",
    });
  }

  if (missingCriticalLayer(candidate)) {
    return decide({
      blocking: [T8_REASON_CODES.DATA_MISSING],
      displayGroup: "Insufficient data",
      expression: "Research pending",
      finalState: "INSUFFICIENT_DATA",
      primaryReason: "One or more required prior signal layers are missing.",
      reasonCodes: [
        T8_REASON_CODES.DECISION_INSUFFICIENT_DATA,
        T8_REASON_CODES.DATA_MISSING,
        ...baseReasons,
      ],
      reviewPriorityScore,
      topFailReason: "Missing required prior signal",
    });
  }

  if (
    hasT6Veto(candidate, "SEVERE_DILUTION") ||
    hasT6Veto(candidate, "ILLIQUID") ||
    hasT6Veto(candidate, "RECENT_MATERIAL_OFFERING") ||
    candidate.t6Detail?.dilution_risk_state === "SEVERE" ||
    candidate.t6.state === "ILLIQUID"
  ) {
    return decide({
      blocking: [
        T8_REASON_CODES.DECISION_NO_TRADE,
        ...baseReasons.filter((code) => T6_BLOCKING_REASON_CODES.has(code)),
      ],
      displayGroup: "No trade / research only",
      expression: "Research only",
      finalState: "NO_TRADE",
      primaryReason:
        "T6 liquidity, dilution, or fragility produced a hard risk veto.",
      reasonCodes: [T8_REASON_CODES.DECISION_NO_TRADE, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "T6 risk veto",
    });
  }

  if (hasGoingConcernWithWeakFundamentals(candidate)) {
    return decide({
      blocking: [T8_REASON_CODES.DECISION_NO_TRADE, "FRAGILITY_GOING_CONCERN"],
      displayGroup: "No trade / research only",
      expression: "Research only",
      finalState: "NO_TRADE",
      primaryReason:
        "Going-concern filing risk is paired with weak or unvalidated fundamentals.",
      reasonCodes: [
        T8_REASON_CODES.DECISION_NO_TRADE,
        "FRAGILITY_GOING_CONCERN",
        ...baseReasons,
      ],
      reviewPriorityScore,
      topFailReason: "Going concern plus weak fundamentals",
    });
  }

  if (candidate.t3.state === "CONTRADICTED") {
    return decide({
      blocking: [T8_REASON_CODES.DECISION_INVALIDATED, ...baseReasons],
      displayGroup: "Wrong ticker / rejected",
      expression: "No clean theme expression",
      finalState: "INVALIDATED",
      primaryReason: "Fundamental evidence contradicts the theme claim.",
      reasonCodes: [T8_REASON_CODES.DECISION_INVALIDATED, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "Fundamentals contradicted",
    });
  }

  if (candidate.t3.state === "DETERIORATING") {
    return decide({
      blocking: [T8_REASON_CODES.DECISION_NO_TRADE, ...baseReasons],
      displayGroup: "No trade / research only",
      expression: "Research only",
      finalState: "NO_TRADE",
      primaryReason:
        "Fundamentals are deteriorating, so the ticker cannot clear the final gate.",
      reasonCodes: [T8_REASON_CODES.DECISION_NO_TRADE, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "Fundamentals deteriorating",
    });
  }

  if (
    candidate.t3.state === "NOT_YET_VALIDATED" ||
    candidate.t3.state === "INSUFFICIENT_DATA"
  ) {
    return decide({
      blocking: [],
      displayGroup: "Watchlist only",
      expression: "Watchlist",
      finalState: "WATCHLIST_ONLY",
      primaryReason: "Fundamentals have not yet validated the exposure.",
      reasonCodes: [T8_REASON_CODES.DECISION_WATCHLIST_ONLY, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "Fundamentals not yet validated",
    });
  }

  if (candidate.t4.state === "BROKEN") {
    return decide({
      blocking: [T8_REASON_CODES.DECISION_NO_TRADE, ...baseReasons],
      displayGroup: "No trade / research only",
      expression: "Research only",
      finalState: "NO_TRADE",
      primaryReason: "Price structure is broken.",
      reasonCodes: [T8_REASON_CODES.DECISION_NO_TRADE, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "Price structure broken",
    });
  }

  if (
    candidate.t4.state === "NON_PARTICIPANT" &&
    numericScore(candidate.t1.score) < 50
  ) {
    return decide({
      blocking: [T8_REASON_CODES.DECISION_WRONG_TICKER, ...baseReasons],
      displayGroup: "Wrong ticker / rejected",
      expression: "No clean theme expression",
      finalState: "WRONG_TICKER",
      primaryReason:
        "The ticker has weak exposure and is not participating in the theme.",
      reasonCodes: [T8_REASON_CODES.DECISION_WRONG_TICKER, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "Weak exposure and non-participation",
    });
  }

  if (candidate.t4.state === "NON_PARTICIPANT") {
    return decide({
      displayGroup: "Non-participants",
      expression: "Watchlist",
      finalState: "NON_PARTICIPANT",
      primaryReason:
        "Exposure exists, but price participation is not confirmed.",
      reasonCodes: [T8_REASON_CODES.DECISION_NON_PARTICIPANT, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "Price non-participant",
    });
  }

  if (candidate.t4.state === "LEADER_BUT_EXTENDED") {
    return decide({
      displayGroup: "Leader but extended",
      expression: "Watchlist / basket component",
      finalState: "LEADER_BUT_EXTENDED",
      primaryReason:
        "The ticker leads the theme, but price or valuation extension reduces fresh-expression quality.",
      reasonCodes: [
        T8_REASON_CODES.DECISION_LEADER_BUT_EXTENDED,
        ...baseReasons,
      ],
      reviewPriorityScore,
      topFailReason: "Leader but extended",
      topPassReason: "Exposure, fundamentals, and participation pass",
    });
  }

  if (
    candidate.t4.state === "PRICE_OUTRAN_EVIDENCE" ||
    candidate.t4.state === "NEEDS_CONSOLIDATION" ||
    valuationState(candidate) === "EXTREME"
  ) {
    return decide({
      displayGroup: "Watchlist only",
      expression: "Watchlist",
      finalState: "WATCHLIST_ONLY",
      primaryReason: "Entry quality is constrained by price or valuation risk.",
      reasonCodes: [T8_REASON_CODES.DECISION_WATCHLIST_ONLY, ...baseReasons],
      reviewPriorityScore,
      topFailReason: "Entry risk too high",
    });
  }

  if (themeDispersionRisk?.state === "HIGH" && isQualityCandidate(candidate)) {
    const etfPreferred = themeDispersionRisk.etf_coverage_quality >= 10;

    return decide({
      displayGroup: etfPreferred ? "ETF preferred" : "Basket preferred",
      expression: etfPreferred ? "ETF preferred" : "Basket preferred",
      finalState: etfPreferred ? "ETF_PREFERRED" : "BASKET_PREFERRED",
      primaryReason:
        "Theme dispersion risk is high enough that a single ticker is not the cleanest expression.",
      reasonCodes: [
        etfPreferred
          ? T8_REASON_CODES.DECISION_ETF_PREFERRED
          : T8_REASON_CODES.DECISION_BASKET_PREFERRED,
        ...themeDispersionRisk.reason_codes,
        ...baseReasons,
      ],
      reviewPriorityScore,
      themeDispersionRisk,
      topPassReason: "Quality candidate, but expression is dispersed",
    });
  }

  if (
    candidate.t4.state === "DELAYED_CATCH_UP_CANDIDATE" &&
    isQualityCandidate(candidate)
  ) {
    return decide({
      displayGroup: "Delayed catch-up candidates",
      expression: "Watchlist",
      finalState: "DELAYED_CATCH_UP_CANDIDATE",
      primaryReason:
        "Exposure and fundamentals pass while price participation is improving from behind.",
      reasonCodes: [
        T8_REASON_CODES.DECISION_DELAYED_CATCHUP_CANDIDATE,
        ...baseReasons,
      ],
      reviewPriorityScore,
      topPassReason: "Exposure and fundamentals pass",
    });
  }

  if (
    isQualityCandidate(candidate) &&
    POSITIVE_PRICE_STATES.has(candidate.t4.state ?? "") &&
    valuationState(candidate) !== "EXTREME"
  ) {
    return decide({
      displayGroup: "Single-stock research justified",
      expression: "Single-stock research",
      finalState: "SINGLE_STOCK_RESEARCH_JUSTIFIED",
      primaryReason:
        "Exposure, fundamentals, price participation, and T6 risk gates all pass.",
      reasonCodes: [
        T8_REASON_CODES.DECISION_SINGLE_STOCK_RESEARCH_JUSTIFIED,
        ...baseReasons,
      ],
      reviewPriorityScore,
      topPassReason: "All required ticker gates pass",
    });
  }

  return decide({
    displayGroup: "Watchlist only",
    expression: "Watchlist",
    finalState: "WATCHLIST_ONLY",
    primaryReason:
      "The ticker has not cleared enough gates for a cleaner expression.",
    reasonCodes: [T8_REASON_CODES.DECISION_WATCHLIST_ONLY, ...baseReasons],
    reviewPriorityScore,
    topFailReason: "Final expression gates incomplete",
  });
}

export function assertNoAdviceLanguage(result: ExpressionDecisionResult) {
  const serialized = JSON.stringify(result.detail).toLowerCase();

  if (serialized.includes("buy") || serialized.includes("sell")) {
    throw new Error("T8 decision output contains disallowed advice wording.");
  }
}
