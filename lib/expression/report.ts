import { T8_SIGNAL_LAYER } from "@/lib/expression/constants";
import type {
  ExpressionDbClient,
  ExpressionDecisionDetail,
} from "@/lib/expression/types";
import { isUuid } from "@/lib/util/uuid";

function groupCounts<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function themeWhere(themeRef?: string) {
  return themeRef
    ? {
        OR: [
          ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
          { sourceThemeCode: themeRef },
          { themeSlug: themeRef },
        ],
      }
    : undefined;
}

function evidenceIdsFromJson(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "string" && entry.length > 0 ? [entry] : [],
  );
}

function reasonCodesFromJson(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "string" && entry.length > 0 ? [entry] : [],
  );
}

function decisionDetail(source: unknown) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  return source as ExpressionDecisionDetail;
}

export async function buildExpressionReport(
  prisma: ExpressionDbClient,
  themeRef?: string,
) {
  const candidates = await prisma.themeCandidate.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          exchange: true,
          universeBucket: true,
        },
      },
      signalScores: {
        orderBy: {
          computedAt: "desc",
        },
        take: 1,
        where: {
          signalLayer: T8_SIGNAL_LAYER,
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        take: 1,
        where: {
          signalLayer: T8_SIGNAL_LAYER,
        },
      },
      theme: {
        select: {
          sourceThemeCode: true,
          themeName: true,
          themeSlug: true,
        },
      },
    },
    orderBy: [
      {
        theme: {
          sourceThemeCode: "asc",
        },
      },
      {
        tickerReviewPriorityScore: "desc",
      },
      {
        security: {
          canonicalTicker: "asc",
        },
      },
    ],
    where: {
      theme: themeWhere(themeRef),
    },
  });
  const rows = candidates.map((candidate) => {
    const score = candidate.signalScores[0];
    const state = candidate.signalStates[0];
    const reasonCodes = [
      ...new Set([
        ...reasonCodesFromJson(score?.reasonCodes),
        ...reasonCodesFromJson(state?.reasonCodes),
      ]),
    ];
    const detailEvidenceId =
      evidenceIdsFromJson(score?.evidenceIds).find(Boolean) ??
      evidenceIdsFromJson(state?.evidenceIds).find(Boolean);

    return {
      beneficiary_type: candidate.beneficiaryType,
      candidate_status: candidate.candidateStatus,
      company_name: candidate.security.companyName,
      computed_at: score?.computedAt?.toISOString() ?? null,
      dashboard_visible: candidate.dashboardVisible,
      detail_evidence_id: detailEvidenceId,
      display_group: candidate.displayGroup,
      exchange: candidate.security.exchange,
      final_state: candidate.finalState,
      reason_codes: reasonCodes,
      rejection_reason_codes: evidenceIdsFromJson(
        candidate.rejectionReasonCodes,
      ),
      review_priority_score:
        candidate.tickerReviewPriorityScore === null ||
        candidate.tickerReviewPriorityScore === undefined
          ? null
          : Number(candidate.tickerReviewPriorityScore),
      signal_state: state?.state ?? null,
      source_of_inclusion: candidate.sourceOfInclusion,
      theme: candidate.theme.sourceThemeCode,
      theme_name: candidate.theme.themeName,
      ticker: candidate.security.canonicalTicker,
      top_fail_reason: candidate.topFailReason,
      top_pass_reason: candidate.topPassReason,
      universe_bucket: candidate.security.universeBucket,
    };
  });
  const detailEvidenceIds = rows.flatMap((row) =>
    row.detail_evidence_id ? [row.detail_evidence_id] : [],
  );
  const detailRows =
    detailEvidenceIds.length === 0
      ? []
      : await prisma.evidenceLedger.findMany({
          select: {
            evidenceId: true,
            metricValueText: true,
          },
          where: {
            evidenceId: {
              in: detailEvidenceIds,
            },
            metricName: "t8.expression_decision_detail",
          },
        });
  const detailByEvidenceId = new Map<string, ExpressionDecisionDetail>();

  for (const row of detailRows) {
    if (!row.metricValueText) {
      continue;
    }

    try {
      const detail = decisionDetail(JSON.parse(row.metricValueText));

      if (detail) {
        detailByEvidenceId.set(row.evidenceId, detail);
      }
    } catch {
      // Ignore malformed historical evidence previews in report output.
    }
  }

  return {
    final_state_counts: groupCounts(
      rows.map((row) => row.final_state ?? "UNSCORED"),
    ),
    status_counts: groupCounts(rows.map((row) => row.candidate_status)),
    theme_filter: themeRef ?? "all",
    total_candidates: rows.length,
    total_scored: rows.filter((row) => row.review_priority_score !== null)
      .length,
    candidates: rows.map((row) => {
      const detail = row.detail_evidence_id
        ? detailByEvidenceId.get(row.detail_evidence_id)
        : undefined;

      return {
        ...row,
        blocking_reason_codes: detail?.blocking_reason_codes ?? [],
        data_freshness_warning: detail?.data_freshness_warning ?? null,
        evidence_count: detail?.evidence_count ?? null,
        expression: detail?.expression ?? null,
        next_state_to_watch: detail?.next_state_to_watch ?? null,
        primary_reason: detail?.primary_reason ?? null,
        supporting_reason_codes: detail?.supporting_reason_codes ?? [],
        theme_dispersion_risk_score:
          detail?.theme_dispersion_risk?.total_score ?? null,
        theme_dispersion_risk_state:
          detail?.theme_dispersion_risk?.state ?? null,
      };
    }),
  };
}
