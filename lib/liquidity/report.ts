import { T6_SIGNAL_LAYER } from "@/lib/liquidity/constants";
import type {
  LiquidityDbClient,
  LiquidityScoreDetail,
} from "@/lib/liquidity/types";
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

function riskDetail(source: unknown) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  return source as LiquidityScoreDetail;
}

export async function buildLiquidityReport(
  prisma: LiquidityDbClient,
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
          signalLayer: T6_SIGNAL_LAYER,
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        take: 1,
        where: {
          signalLayer: T6_SIGNAL_LAYER,
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
    const reasonCodes = (score?.reasonCodes ??
      state?.reasonCodes ??
      []) as string[];
    const detailEvidenceId =
      Array.isArray(score?.evidenceIds) && score.evidenceIds.length > 0
        ? String(score.evidenceIds[0])
        : undefined;

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
      fragility_score:
        score?.score === null || score?.score === undefined
          ? null
          : Number(score.score),
      liquidity_state: state?.state ?? null,
      reason_codes: reasonCodes,
      source_of_inclusion: candidate.sourceOfInclusion,
      theme: candidate.theme.sourceThemeCode,
      theme_name: candidate.theme.themeName,
      ticker: candidate.security.canonicalTicker,
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
            metricName: "t6.liquidity_fragility_score_detail",
          },
        });
  const detailByEvidenceId = new Map<
    string,
    LiquidityScoreDetail | undefined
  >();

  for (const row of detailRows) {
    if (!row.metricValueText) {
      continue;
    }

    try {
      detailByEvidenceId.set(
        row.evidenceId,
        riskDetail(JSON.parse(row.metricValueText)),
      );
    } catch {
      // Ignore malformed historical evidence previews in report output.
    }
  }

  return {
    liquidity_state_counts: groupCounts(
      rows.map((row) => row.liquidity_state ?? "UNSCORED"),
    ),
    status_counts: groupCounts(rows.map((row) => row.candidate_status)),
    theme_filter: themeRef ?? "all",
    total_candidates: rows.length,
    total_scored: rows.filter((row) => row.fragility_score !== null).length,
    candidates: rows.map((row) => {
      const detail = row.detail_evidence_id
        ? detailByEvidenceId.get(row.detail_evidence_id)
        : undefined;

      return {
        ...row,
        average_dollar_volume_20d:
          detail?.metrics.averageDollarVolume20d ?? null,
        cash_runway_months: detail?.metrics.cashRunwayMonths ?? null,
        convertible_financing_count:
          detail?.metrics.convertibleFinancingCount ?? null,
        dilution_risk_state: detail?.dilution_risk_state ?? null,
        fragility_state: detail?.fragility_state ?? null,
        going_concern_filing_count:
          detail?.metrics.goingConcernFilingCount ?? null,
        market_cap: detail?.metrics.marketCap ?? null,
        metric_date: detail?.metrics.metricDate ?? null,
        recent_offering_count: detail?.metrics.recentOfferingCount ?? null,
        reverse_split_count: detail?.metrics.reverseSplitCount ?? null,
        share_count_growth_yoy: detail?.metrics.shareCountGrowthYoy ?? null,
        veto_flags: detail?.veto_flags ?? [],
      };
    }),
  };
}
