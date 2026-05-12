import type { DashboardState, FinalState } from "@/generated/prisma/client";
import {
  SNAPSHOT_REASON_CODES,
  T11_SNAPSHOT_ALGORITHM_VERSION,
  T11_SNAPSHOT_THRESHOLD_VERSION,
} from "@/lib/snapshots/constants";
import type {
  SnapshotCandidateInput,
  SnapshotEvidenceInput,
  SnapshotThemeInput,
  SnapshotTopTicker,
  ThemeRealityScoreDetail,
  ThemeSnapshotComputation,
  ThemeSnapshotDetail,
} from "@/lib/snapshots/types";

const INVESTABLE_FINAL_STATES = new Set<FinalState>([
  "SINGLE_STOCK_RESEARCH_JUSTIFIED",
  "BASKET_PREFERRED",
  "ETF_PREFERRED",
  "LEADER_BUT_EXTENDED",
  "DELAYED_CATCH_UP_CANDIDATE",
]);

const DIRECT_BENEFICIARY_TYPES = new Set([
  "DIRECT_BENEFICIARY",
  "MAJOR_BENEFICIARY",
]);

const ACTIVE_THEME_STATUSES = new Set([
  "ACTIVE_UNSCANNED",
  "ACTIVE_SCANNED",
  "ACTIVE",
]);

function bounded(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : value ? 1 : 0;
}

function textLength(value: unknown): number {
  if (!value) {
    return 0;
  }

  if (typeof value === "string") {
    return value.trim().length;
  }

  return JSON.stringify(value).length;
}

function signalHasState(
  candidate: SnapshotCandidateInput,
  layer: "t3" | "t4" | "t6" | "t8",
  states: string[],
) {
  const state = candidate[layer]?.state;

  return state ? states.includes(state) : false;
}

function finalStateCounts(candidates: SnapshotCandidateInput[]) {
  return candidates.reduce<Record<string, number>>((counts, candidate) => {
    const key = candidate.finalState ?? "UNSCORED";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function byPriorityThenTicker(
  left: SnapshotCandidateInput,
  right: SnapshotCandidateInput,
) {
  return (
    (right.reviewPriorityScore ?? -1) - (left.reviewPriorityScore ?? -1) ||
    left.ticker.localeCompare(right.ticker)
  );
}

function tickerRow(candidate: SnapshotCandidateInput): SnapshotTopTicker {
  return {
    beneficiary_type: candidate.beneficiaryType,
    company_name: candidate.companyName,
    final_state: candidate.finalState,
    reason_codes: unique([
      ...candidate.rejectionReasonCodes,
      ...(candidate.t8?.reasonCodes ?? []),
      ...(candidate.t8Detail?.reason_codes ?? []),
    ]),
    review_priority_score: candidate.reviewPriorityScore ?? null,
    ticker: candidate.ticker,
    top_fail_reason: candidate.topFailReason,
    top_pass_reason: candidate.topPassReason,
  };
}

function dataFreshnessScore(candidates: SnapshotCandidateInput[]) {
  if (candidates.length === 0) {
    return 0;
  }

  const perCandidate = candidates.map((candidate) => {
    if (!candidate.t8) {
      return 20;
    }

    if (candidate.t8Detail?.data_freshness_warning) {
      return 60;
    }

    return 100;
  });

  return bounded(
    perCandidate.reduce((sum, score) => sum + score, 0) /
      Math.max(perCandidate.length, 1),
  );
}

function highestEvidenceGrade(evidenceRows: SnapshotEvidenceInput[]) {
  const grades = evidenceRows.flatMap((row) =>
    row.evidenceGrade ? [row.evidenceGrade] : [],
  );

  if (grades.includes("A")) {
    return "A";
  }

  if (grades.includes("B")) {
    return "B";
  }

  if (grades.includes("C")) {
    return "C";
  }

  if (grades.includes("D")) {
    return "D";
  }

  return undefined;
}

function mechanismSpecificity(theme: SnapshotThemeInput) {
  const mechanismLength = textLength(theme.economicMechanism);
  const hasDirect = arrayLength(theme.directBeneficiaryCategories) > 0;
  const hasExclusions = arrayLength(theme.excludedCategories) > 0;
  const hasProof = arrayLength(theme.requiredEconomicProof) > 0;
  const hasInvalidation = arrayLength(theme.invalidationRules) > 0;
  const supportCount = [
    hasDirect,
    hasExclusions,
    hasProof,
    hasInvalidation,
  ].filter(Boolean).length;

  if (mechanismLength >= 120 && supportCount >= 4) {
    return 20;
  }

  if (mechanismLength >= 80 && supportCount >= 3) {
    return 15;
  }

  if (mechanismLength >= 30 && supportCount >= 2) {
    return 10;
  }

  if (mechanismLength > 0) {
    return 5;
  }

  return 0;
}

function measurableEvidenceRows(evidenceRows: SnapshotEvidenceInput[]) {
  return evidenceRows.filter(
    (row) =>
      !row.metricName.startsWith("t8.") &&
      !row.metricName.startsWith("t11.") &&
      row.metricName !== "theme_definition_load_summary",
  );
}

function requiredProofCoverage(evidenceRows: SnapshotEvidenceInput[]) {
  const measurableRows = measurableEvidenceRows(evidenceRows);
  const metricCount = new Set(measurableRows.map((row) => row.metricName)).size;

  if (metricCount >= 6) {
    return 20;
  }

  if (metricCount >= 3) {
    return 15;
  }

  if (metricCount >= 1) {
    return 10;
  }

  if (evidenceRows.length > 0) {
    return 5;
  }

  return 0;
}

function companyLevelEvidenceBreadth(candidates: SnapshotCandidateInput[]) {
  const supportedCandidates = candidates.filter(
    (candidate) =>
      signalHasState(candidate, "t3", ["VALIDATED", "IMPROVING"]) ||
      signalHasState(candidate, "t4", [
        "PARTICIPANT",
        "LEADER",
        "LEADER_BUT_EXTENDED",
        "DELAYED_CATCH_UP_CANDIDATE",
      ]) ||
      signalHasState(candidate, "t6", ["CORE_ELIGIBLE", "EXPANDED_ELIGIBLE"]),
  ).length;

  if (supportedCandidates >= 3) {
    return 20;
  }

  if (supportedCandidates >= 2) {
    return 15;
  }

  if (supportedCandidates === 1) {
    return 10;
  }

  if (candidates.length > 0) {
    return 5;
  }

  return 0;
}

function directBeneficiaryValidation(candidates: SnapshotCandidateInput[]) {
  const direct = candidates.filter((candidate) =>
    DIRECT_BENEFICIARY_TYPES.has(candidate.beneficiaryType ?? ""),
  );
  const validated = direct.filter((candidate) =>
    signalHasState(candidate, "t3", ["VALIDATED", "IMPROVING"]),
  ).length;

  if (validated >= 2) {
    return 15;
  }

  if (validated === 1) {
    return 10;
  }

  if (direct.length > 0) {
    return 5;
  }

  return 0;
}

function themeBasketParticipation(candidates: SnapshotCandidateInput[]) {
  const participating = candidates.filter((candidate) =>
    signalHasState(candidate, "t4", [
      "PARTICIPANT",
      "LEADER",
      "LEADER_BUT_EXTENDED",
      "DELAYED_CATCH_UP_CANDIDATE",
    ]),
  );
  const hasThemeRs = candidates.some((candidate) =>
    candidate.t4?.reasonCodes.some(
      (code) =>
        code === SNAPSHOT_REASON_CODES.PRICE_RS_VS_THEME_POSITIVE ||
        code === SNAPSHOT_REASON_CODES.PRICE_THEME_BASKET_PROXY_USED,
    ),
  );

  if (participating.length >= 3 && hasThemeRs) {
    return 10;
  }

  if (participating.length >= 2) {
    return 7;
  }

  if (participating.length >= 1) {
    return 4;
  }

  return 0;
}

function calculateThemeRealityScore(input: {
  candidates: SnapshotCandidateInput[];
  dataQualityScore: number;
  evidenceRows: SnapshotEvidenceInput[];
  theme: SnapshotThemeInput;
}): ThemeRealityScoreDetail {
  const mechanism = mechanismSpecificity(input.theme);
  const proof = requiredProofCoverage(input.evidenceRows);
  const breadth = companyLevelEvidenceBreadth(input.candidates);
  const directValidation = directBeneficiaryValidation(input.candidates);
  const basket = themeBasketParticipation(input.candidates);
  const freshness = Math.round(input.dataQualityScore / 10);
  const measurableRows = measurableEvidenceRows(input.evidenceRows);
  const highestGrade = highestEvidenceGrade(measurableRows);
  const positiveReasonCodes: string[] = [];
  const cautionReasonCodes: string[] = [];
  const capsApplied: string[] = [];

  if (mechanism > 0) {
    positiveReasonCodes.push(
      SNAPSHOT_REASON_CODES.DEMAND_MECHANISM_SPECIFIC,
      SNAPSHOT_REASON_CODES.THEME_MECHANISM_SPECIFIC,
    );
  }

  if (arrayLength(input.theme.requiredEconomicProof) > 0) {
    positiveReasonCodes.push(
      SNAPSHOT_REASON_CODES.DEMAND_REQUIRED_PROOF_PRESENT,
      SNAPSHOT_REASON_CODES.THEME_REQUIRED_PROOF_PRESENT,
    );
  }

  if (directValidation >= 15) {
    positiveReasonCodes.push(
      SNAPSHOT_REASON_CODES.DEMAND_MULTIPLE_BENEFICIARIES_VALIDATE,
    );
  }

  if (basket >= 7) {
    positiveReasonCodes.push(SNAPSHOT_REASON_CODES.PRICE_RS_VS_THEME_POSITIVE);
  }

  if (measurableRows.length === 0) {
    cautionReasonCodes.push(SNAPSHOT_REASON_CODES.DEMAND_PROOF_MISSING);
    capsApplied.push("NO_MEASURABLE_PROOF_CAP_40");
  }

  if (highestGrade === "D") {
    cautionReasonCodes.push(SNAPSHOT_REASON_CODES.DEMAND_ONLY_D_GRADE_EVIDENCE);
    capsApplied.push("ONLY_D_GRADE_EVIDENCE_CAP_35");
  } else if (highestGrade === "C") {
    cautionReasonCodes.push(SNAPSHOT_REASON_CODES.DEMAND_ONLY_C_GRADE_EVIDENCE);
    capsApplied.push("ONLY_C_GRADE_EVIDENCE_CAP_55");
  }

  if (freshness <= 4 && input.candidates.length > 0) {
    cautionReasonCodes.push(SNAPSHOT_REASON_CODES.DEMAND_EVIDENCE_STALE);
  }

  let score =
    mechanism + proof + breadth + directValidation + basket + freshness;

  if (measurableRows.length === 0) {
    score = Math.min(score, 40);
  }

  if (highestGrade === "D") {
    score = Math.min(score, 35);
  } else if (highestGrade === "C") {
    score = Math.min(score, 55);
  }

  return {
    caps_applied: capsApplied,
    caution_reason_codes: unique(cautionReasonCodes),
    components: {
      company_level_evidence_breadth: breadth,
      direct_beneficiary_validation: directValidation,
      evidence_freshness_quality: freshness,
      mechanism_specificity: mechanism,
      required_proof_coverage: proof,
      theme_basket_participation: basket,
    },
    final_score: Math.round(bounded(score)),
    positive_reason_codes: unique(positiveReasonCodes),
  };
}

function severeDataWarning(candidates: SnapshotCandidateInput[]) {
  return candidates.some(
    (candidate) =>
      !candidate.t8 ||
      candidate.t8Detail?.data_freshness_warning ||
      candidate.t8?.reasonCodes.includes(
        SNAPSHOT_REASON_CODES.DECISION_INSUFFICIENT_DATA,
      ),
  );
}

function classifyDashboardState(input: {
  candidates: SnapshotCandidateInput[];
  directBeneficiaryCount: number;
  investableCandidateCount: number;
  leaderButExtendedCount: number;
  noTradeCount: number;
  theme: SnapshotThemeInput;
  themeRealityScore: number;
  wrongTickerCount: number;
}): DashboardState {
  const scoredCandidates = input.candidates.filter(
    (candidate) => candidate.finalState,
  );
  const severeData = severeDataWarning(input.candidates);
  const cleanFailureCount = input.noTradeCount + input.wrongTickerCount;

  if (!ACTIVE_THEME_STATUSES.has(input.theme.status)) {
    return "REJECTED_INACTIVE";
  }

  if (
    input.theme.previousThemeRealityScore !== undefined &&
    input.theme.previousThemeRealityScore - input.themeRealityScore >= 20
  ) {
    return "FADING";
  }

  if (
    input.themeRealityScore >= 60 &&
    scoredCandidates.length > 0 &&
    (input.investableCandidateCount === 0 ||
      cleanFailureCount === scoredCandidates.length)
  ) {
    return "NO_CLEAN_EXPRESSION";
  }

  if (
    input.themeRealityScore >= 60 &&
    input.investableCandidateCount > 0 &&
    input.leaderButExtendedCount >=
      Math.max(1, Math.ceil(input.investableCandidateCount * 0.5))
  ) {
    return "CONFIRMED_BUT_EXTENDED";
  }

  if (
    input.themeRealityScore >= 60 &&
    input.directBeneficiaryCount >= 1 &&
    input.investableCandidateCount >= 1 &&
    input.leaderButExtendedCount < input.investableCandidateCount &&
    !severeData
  ) {
    return "WORTH_CHECKING_OUT";
  }

  if (
    input.themeRealityScore >= 40 ||
    input.directBeneficiaryCount > 0 ||
    input.candidates.some((candidate) =>
      signalHasState(candidate, "t4", ["IMPROVING", "PARTICIPANT"]),
    )
  ) {
    return "EARLY_WATCHLIST";
  }

  return "INSUFFICIENT_EVIDENCE";
}

function reviewPriority(input: {
  candidates: SnapshotCandidateInput[];
  dataQualityScore: number;
  directBeneficiaryCount: number;
  investableCandidateCount: number;
  leaderButExtendedCount: number;
  noTradeCount: number;
  themeRealityScore: number;
  wrongTickerCount: number;
}) {
  const candidateCount = Math.max(input.candidates.length, 1);
  const directBreadth = bounded((input.directBeneficiaryCount / 3) * 100);
  const fundamentalBreadth = bounded(
    (input.candidates.filter((candidate) =>
      signalHasState(candidate, "t3", ["VALIDATED", "IMPROVING"]),
    ).length /
      candidateCount) *
      100,
  );
  const priceBreadth = bounded(
    (input.candidates.filter((candidate) =>
      signalHasState(candidate, "t4", [
        "PARTICIPANT",
        "LEADER",
        "DELAYED_CATCH_UP_CANDIDATE",
      ]),
    ).length /
      candidateCount) *
      100,
  );
  const extensionRatio =
    input.investableCandidateCount === 0
      ? 0
      : input.leaderButExtendedCount / input.investableCandidateCount;
  const valuationRoom = bounded(100 - extensionRatio * 80);
  const liquidityQuality = bounded(
    (input.candidates.filter((candidate) =>
      signalHasState(candidate, "t6", ["CORE_ELIGIBLE", "EXPANDED_ELIGIBLE"]),
    ).length /
      candidateCount) *
      100,
  );
  const severeFailureRatio =
    (input.noTradeCount + input.wrongTickerCount) / candidateCount;
  const riskPenalty = severeFailureRatio * 15 + extensionRatio * 8;

  return Number(
    bounded(
      input.themeRealityScore * 0.2 +
        directBreadth * 0.1 +
        fundamentalBreadth * 0.2 +
        priceBreadth * 0.15 +
        valuationRoom * 0.15 +
        liquidityQuality * 0.1 +
        0 +
        input.dataQualityScore * 0.05 -
        riskPenalty,
    ).toFixed(2),
  );
}

export function computeThemeSnapshot(input: {
  candidates: SnapshotCandidateInput[];
  evidenceRows: SnapshotEvidenceInput[];
  theme: SnapshotThemeInput;
}): ThemeSnapshotComputation {
  const candidates = input.candidates;
  const directBeneficiaryCount = candidates.filter(
    (candidate) =>
      candidate.dashboardVisible &&
      DIRECT_BENEFICIARY_TYPES.has(candidate.beneficiaryType ?? ""),
  ).length;
  const investableCandidateCount = candidates.filter(
    (candidate) =>
      candidate.finalState && INVESTABLE_FINAL_STATES.has(candidate.finalState),
  ).length;
  const leaderCount = candidates.filter((candidate) =>
    signalHasState(candidate, "t4", ["LEADER"]),
  ).length;
  const leaderButExtendedCount = candidates.filter(
    (candidate) => candidate.finalState === "LEADER_BUT_EXTENDED",
  ).length;
  const delayedCatchupCount = candidates.filter(
    (candidate) => candidate.finalState === "DELAYED_CATCH_UP_CANDIDATE",
  ).length;
  const watchlistOnlyCount = candidates.filter(
    (candidate) => candidate.finalState === "WATCHLIST_ONLY",
  ).length;
  const wrongTickerCount = candidates.filter(
    (candidate) => candidate.finalState === "WRONG_TICKER",
  ).length;
  const noTradeCount = candidates.filter(
    (candidate) => candidate.finalState === "NO_TRADE",
  ).length;
  const basketPreferred = candidates.some(
    (candidate) => candidate.finalState === "BASKET_PREFERRED",
  );
  const etfPreferred = candidates.some(
    (candidate) => candidate.finalState === "ETF_PREFERRED",
  );
  const dataQualityScore = dataFreshnessScore(candidates);
  const themeReality = calculateThemeRealityScore({
    candidates,
    dataQualityScore,
    evidenceRows: input.evidenceRows,
    theme: input.theme,
  });
  const dashboardState = classifyDashboardState({
    candidates,
    directBeneficiaryCount,
    investableCandidateCount,
    leaderButExtendedCount,
    noTradeCount,
    theme: input.theme,
    themeRealityScore: themeReality.final_score,
    wrongTickerCount,
  });
  const reviewPriorityScore = reviewPriority({
    candidates,
    dataQualityScore,
    directBeneficiaryCount,
    investableCandidateCount,
    leaderButExtendedCount,
    noTradeCount,
    themeRealityScore: themeReality.final_score,
    wrongTickerCount,
  });
  const lastScannedAt =
    candidates
      .flatMap((candidate) =>
        candidate.lastScannedAt ? [candidate.lastScannedAt] : [],
      )
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const topDirectBeneficiaries = candidates
    .filter((candidate) =>
      DIRECT_BENEFICIARY_TYPES.has(candidate.beneficiaryType ?? ""),
    )
    .sort(byPriorityThenTicker)
    .slice(0, 5)
    .map(tickerRow);
  const topRejectedTickers = candidates
    .filter((candidate) =>
      [
        "WRONG_TICKER",
        "NO_TRADE",
        "REJECTED",
        "NON_PARTICIPANT",
        "INSUFFICIENT_DATA",
      ].includes(candidate.finalState ?? ""),
    )
    .sort(byPriorityThenTicker)
    .slice(0, 10)
    .map(tickerRow);
  const highlightReasonCodes = unique([
    ...themeReality.positive_reason_codes,
    ...(basketPreferred
      ? [SNAPSHOT_REASON_CODES.DECISION_BASKET_PREFERRED]
      : []),
    ...(etfPreferred ? [SNAPSHOT_REASON_CODES.DECISION_ETF_PREFERRED] : []),
    ...(investableCandidateCount > 0
      ? [SNAPSHOT_REASON_CODES.DECISION_SINGLE_STOCK_RESEARCH_JUSTIFIED]
      : []),
    ...(leaderButExtendedCount > 0
      ? [SNAPSHOT_REASON_CODES.DECISION_LEADER_BUT_EXTENDED]
      : []),
    ...(delayedCatchupCount > 0
      ? [SNAPSHOT_REASON_CODES.DECISION_DELAYED_CATCHUP_CANDIDATE]
      : []),
  ]);
  const cautionReasonCodes = unique([
    ...themeReality.caution_reason_codes,
    ...(wrongTickerCount > 0
      ? [SNAPSHOT_REASON_CODES.DECISION_WRONG_TICKER]
      : []),
    ...(noTradeCount > 0 ? [SNAPSHOT_REASON_CODES.DECISION_NO_TRADE] : []),
    ...(watchlistOnlyCount > 0
      ? [SNAPSHOT_REASON_CODES.DECISION_WATCHLIST_ONLY]
      : []),
    ...(severeDataWarning(candidates)
      ? [SNAPSHOT_REASON_CODES.DECISION_INSUFFICIENT_DATA]
      : []),
  ]);

  return {
    basketPreferred,
    cautionReasonCodes,
    dashboardState,
    dataQualityScore: Number(dataQualityScore.toFixed(2)),
    delayedCatchupCount,
    directBeneficiaryCount,
    etfPreferred,
    highlightReasonCodes,
    investableCandidateCount,
    leaderButExtendedCount,
    leaderCount,
    lastScannedAt,
    noTradeCount,
    reviewPriorityScore,
    themeReality,
    topDirectBeneficiaries,
    topRejectedTickers,
    watchlistOnlyCount,
    wrongTickerCount,
  };
}

export function buildSnapshotDetail(input: {
  candidates: SnapshotCandidateInput[];
  computation: ThemeSnapshotComputation;
  theme: SnapshotThemeInput;
}): ThemeSnapshotDetail {
  return {
    algorithm_version: T11_SNAPSHOT_ALGORITHM_VERSION,
    basket_preferred: input.computation.basketPreferred,
    candidate_count: input.candidates.length,
    caution_reason_codes: input.computation.cautionReasonCodes,
    dashboard_state: input.computation.dashboardState,
    data_quality_score: input.computation.dataQualityScore,
    etf_preferred: input.computation.etfPreferred,
    final_state_counts: finalStateCounts(input.candidates),
    highlight_reason_codes: input.computation.highlightReasonCodes,
    previous_dashboard_state: input.theme.previousDashboardState,
    previous_theme_reality_score: input.theme.previousThemeRealityScore,
    review_priority_score: input.computation.reviewPriorityScore,
    theme_reality: input.computation.themeReality,
    threshold_version: T11_SNAPSHOT_THRESHOLD_VERSION,
    top_direct_beneficiaries: input.computation.topDirectBeneficiaries,
    top_rejected_tickers: input.computation.topRejectedTickers,
  };
}
