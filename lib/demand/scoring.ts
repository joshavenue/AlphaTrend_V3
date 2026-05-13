import type { EvidenceGrade } from "@/generated/prisma/client";
import {
  DEMAND_REASON_CODES,
  DEMAND_STATES,
  T2_DEMAND_ALGORITHM_VERSION,
  T2_DEMAND_THRESHOLD_VERSION,
} from "@/lib/demand/constants";
import type {
  DemandFeedDefinition,
  DemandScoreDetail,
  DemandState,
} from "@/lib/demand/types";

export type DemandEvidenceInput = {
  evidenceGrade?: EvidenceGrade | null;
  feedId?: string | null;
  fetchedAt?: Date | null;
  metricName: string;
  metricValueNum?: number | null;
  provider?: string | null;
  reasonCode?: string | null;
};

function bounded(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function hasAny(values: string[], targets: string[]) {
  return targets.some((target) => values.includes(target));
}

function dateAgeDays(date: Date | null | undefined, now: Date) {
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function stateForScore(score: number, contradicted: boolean): DemandState {
  if (contradicted) {
    return DEMAND_STATES.DEMAND_CONTRADICTED;
  }

  if (score >= 80) {
    return DEMAND_STATES.DEMAND_CONFIRMED;
  }

  if (score >= 60) {
    return DEMAND_STATES.DEMAND_IMPROVING;
  }

  if (score >= 40) {
    return DEMAND_STATES.DEMAND_PLAUSIBLE_BUT_UNPROVEN;
  }

  if (score >= 20) {
    return DEMAND_STATES.DEMAND_WEAK;
  }

  return DEMAND_STATES.INSUFFICIENT_DATA;
}

function highestGrade(rows: DemandEvidenceInput[]): EvidenceGrade | undefined {
  const grades = rows.flatMap((row) =>
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

function evidenceRowsForFeeds(
  evidenceRows: DemandEvidenceInput[],
  feeds: DemandFeedDefinition[],
) {
  const feedIds = new Set(feeds.map((feed) => feed.feedId));

  return evidenceRows.filter((row) => row.feedId && feedIds.has(row.feedId));
}

function providerCoverage(input: {
  evidenceRows: DemandEvidenceInput[];
  feeds: DemandFeedDefinition[];
}) {
  const requiredFeeds = input.feeds.filter(
    (feed) => feed.enabled && feed.kind !== "missing_provider_gap",
  );

  if (requiredFeeds.length === 0) {
    return 0;
  }

  const coveredFeedIds = new Set(
    input.evidenceRows.flatMap((row) =>
      row.feedId &&
      row.reasonCode !== DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP
        ? [row.feedId]
        : [],
    ),
  );

  return Math.round(
    (coveredFeedIds.size / Math.max(requiredFeeds.length, 1)) * 10,
  );
}

export function scoreEconomicDemand(input: {
  evidenceIds?: string[];
  evidenceRows: DemandEvidenceInput[];
  feeds: DemandFeedDefinition[];
  now?: Date;
}): DemandScoreDetail {
  const now = input.now ?? new Date();
  const rows = evidenceRowsForFeeds(input.evidenceRows, input.feeds);
  const reasonCodes = unique(rows.flatMap((row) => row.reasonCode ?? []));
  const positiveReasonCodes: string[] = [];
  const cautionReasonCodes: string[] = [];
  const capsApplied: string[] = [];
  const activeFeeds = input.feeds.filter((feed) => feed.enabled);
  const missingGapRows = rows.filter(
    (row) => row.reasonCode === DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP,
  );
  const nonGapRows = rows.filter(
    (row) => row.reasonCode !== DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP,
  );
  const grade =
    highestGrade(nonGapRows) ??
    (missingGapRows.length > 0 ? ("D" as const) : undefined);
  const coverage = providerCoverage({
    evidenceRows: rows,
    feeds: activeFeeds,
  });
  const hasGovernmentAward = hasAny(reasonCodes, [
    DEMAND_REASON_CODES.DEMAND_GOVERNMENT_AWARD_SUPPORT,
  ]);
  const hasCapacity = hasAny(reasonCodes, [
    DEMAND_REASON_CODES.DEMAND_CAPACITY_TIGHTNESS_EVIDENCE,
    DEMAND_REASON_CODES.DEMAND_PRICING_POWER_EVIDENCE,
  ]);
  const hasMacro = hasAny(reasonCodes, [
    DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
  ]);
  const hasOnlyMacro =
    nonGapRows.length > 0 && hasMacro && !hasGovernmentAward && !hasCapacity;
  const hasOnlyWeak =
    nonGapRows.length > 0 &&
    nonGapRows.every((row) => row.evidenceGrade === "C");
  const hasContradiction = hasAny(reasonCodes, [
    DEMAND_REASON_CODES.DEMAND_CONTRADICTED,
  ]);
  const maxAge = Math.max(
    0,
    ...nonGapRows.map((row) => dateAgeDays(row.fetchedAt, now)),
  );

  let contractBacklogProof = 0;
  let pricingCapacityProof = 0;
  let customerDemandProof = 0;
  let industryMacroConfirmation = 0;
  let weakEvidenceAdjustment = 0;
  let dataFreshnessAdjustment = 0;

  if (hasGovernmentAward) {
    const totalAwardAmount = rows
      .filter(
        (row) =>
          row.reasonCode ===
          DEMAND_REASON_CODES.DEMAND_GOVERNMENT_AWARD_SUPPORT,
      )
      .reduce((sum, row) => sum + (row.metricValueNum ?? 0), 0);
    contractBacklogProof = totalAwardAmount >= 1_000_000 ? 30 : 20;
    customerDemandProof = 12;
    positiveReasonCodes.push(
      DEMAND_REASON_CODES.DEMAND_GOVERNMENT_AWARD_SUPPORT,
    );
    cautionReasonCodes.push(DEMAND_REASON_CODES.DEMAND_UNMAPPED_RECIPIENT);
  }

  if (hasCapacity) {
    pricingCapacityProof = 20;
    customerDemandProof = Math.max(customerDemandProof, 14);
    positiveReasonCodes.push(
      DEMAND_REASON_CODES.DEMAND_CAPACITY_TIGHTNESS_EVIDENCE,
    );
  }

  if (hasMacro) {
    industryMacroConfirmation = Math.min(
      15,
      5 *
        new Set(
          rows
            .filter(
              (row) =>
                row.reasonCode ===
                DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT,
            )
            .map((row) => row.provider ?? row.feedId ?? row.metricName),
        ).size,
    );
    positiveReasonCodes.push(DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT);
  }

  if (nonGapRows.length === 0) {
    cautionReasonCodes.push(DEMAND_REASON_CODES.DEMAND_PROOF_MISSING);
    capsApplied.push("NO_MEASURABLE_PROOF_CAP_40");
  }

  if (missingGapRows.length > 0) {
    cautionReasonCodes.push(DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP);
    weakEvidenceAdjustment -= Math.min(20, missingGapRows.length * 8);
  }

  if (grade === "D") {
    cautionReasonCodes.push(DEMAND_REASON_CODES.DEMAND_ONLY_D_GRADE_EVIDENCE);
    capsApplied.push("ONLY_D_GRADE_EVIDENCE_CAP_35");
  } else if (grade === "C" || hasOnlyWeak) {
    cautionReasonCodes.push(DEMAND_REASON_CODES.DEMAND_ONLY_C_GRADE_EVIDENCE);
    capsApplied.push("ONLY_C_GRADE_EVIDENCE_CAP_55");
    weakEvidenceAdjustment -= 10;
  }

  if (maxAge > 120) {
    cautionReasonCodes.push(DEMAND_REASON_CODES.DEMAND_EVIDENCE_STALE);
    dataFreshnessAdjustment -= 10;
  } else if (maxAge > 90) {
    cautionReasonCodes.push(DEMAND_REASON_CODES.DEMAND_EVIDENCE_STALE);
    dataFreshnessAdjustment -= 5;
  }

  let score =
    contractBacklogProof +
    pricingCapacityProof +
    customerDemandProof +
    industryMacroConfirmation +
    weakEvidenceAdjustment +
    dataFreshnessAdjustment;

  if (coverage >= 7) {
    score += 5;
  }

  if (hasOnlyMacro) {
    capsApplied.push("MACRO_ONLY_CAP_59");
    score = Math.min(score, 59);
  }

  if (nonGapRows.length === 0) {
    score = Math.min(score, 40);
  }

  if (grade === "D") {
    score = Math.min(score, 35);
  } else if (grade === "C" || hasOnlyWeak) {
    score = Math.min(score, 55);
  }

  if (hasContradiction) {
    cautionReasonCodes.push(DEMAND_REASON_CODES.DEMAND_CONTRADICTED);
    capsApplied.push("CONTRADICTED_REQUIRED_PROOF_CAP_30");
    score = Math.min(score, 30);
  }

  const finalScore = Math.round(bounded(score));

  return {
    algorithm_version: T2_DEMAND_ALGORITHM_VERSION,
    caps_applied: unique(capsApplied),
    caution_reason_codes: unique(cautionReasonCodes),
    components: {
      contract_backlog_proof: contractBacklogProof,
      customer_demand_proof: customerDemandProof,
      data_freshness_adjustment: dataFreshnessAdjustment,
      industry_macro_confirmation: industryMacroConfirmation,
      pricing_capacity_proof: pricingCapacityProof,
      provider_coverage: coverage,
      weak_evidence_adjustment: weakEvidenceAdjustment,
    },
    demand_state: stateForScore(finalScore, hasContradiction),
    evidence_grade_ceiling: grade,
    evidence_ids: input.evidenceIds ?? [],
    final_score: finalScore,
    positive_reason_codes: unique(positiveReasonCodes),
    threshold_version: T2_DEMAND_THRESHOLD_VERSION,
  };
}
