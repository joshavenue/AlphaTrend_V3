import { T4_SIGNAL_LAYER } from "@/lib/price/constants";
import type { PriceDbClient } from "@/lib/price/types";
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

function priceDetail(source: unknown) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  return source as {
    metrics?: {
      averageDollarVolume20d?: number;
      close?: number;
      date?: string;
      distanceFrom50dAtr?: number;
      drawdownFrom52wHigh?: number;
      return1m?: number;
      return3m?: number;
    };
    relative_strength?: {
      vsQqq3m?: number;
      vsSpy3m?: number;
      vsTheme1m?: number;
      vsTheme3m?: number;
    };
    valuation?: {
      state?: string;
    };
  };
}

export async function buildPriceReport(
  prisma: PriceDbClient,
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
          signalLayer: T4_SIGNAL_LAYER,
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        take: 1,
        where: {
          signalLayer: T4_SIGNAL_LAYER,
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
      price_score:
        score?.score === null || score?.score === undefined
          ? null
          : Number(score.score),
      price_state: state?.state ?? null,
      reason_codes: reasonCodes,
      source_of_inclusion: candidate.sourceOfInclusion,
      theme: candidate.theme.sourceThemeCode,
      theme_name: candidate.theme.themeName,
      ticker: candidate.security.canonicalTicker,
      universe_bucket: candidate.security.universeBucket,
    };
  });
  const detailRows = await prisma.evidenceLedger.findMany({
    select: {
      entityId: true,
      metricValueText: true,
    },
    where: {
      entityId: {
        in: candidates.map((candidate) => candidate.themeCandidateId),
      },
      metricName: "t4.price_score_detail",
    },
    orderBy: {
      fetchedAt: "desc",
    },
  });
  const detailByCandidate = new Map<string, ReturnType<typeof priceDetail>>();

  for (const row of detailRows) {
    if (
      !row.entityId ||
      !row.metricValueText ||
      detailByCandidate.has(row.entityId)
    ) {
      continue;
    }

    try {
      detailByCandidate.set(
        row.entityId,
        priceDetail(JSON.parse(row.metricValueText)),
      );
    } catch {
      // Ignore malformed historical evidence previews in the report surface.
    }
  }

  return {
    state_counts: groupCounts(rows.map((row) => row.price_state ?? "UNSCORED")),
    status_counts: groupCounts(rows.map((row) => row.candidate_status)),
    theme_filter: themeRef ?? "all",
    total_candidates: rows.length,
    total_scored: rows.filter((row) => row.price_score !== null).length,
    candidates: rows.map((row, index) => {
      const candidate = candidates[index];
      const detail = detailByCandidate.get(candidate.themeCandidateId);

      return {
        ...row,
        average_dollar_volume_20d:
          detail?.metrics?.averageDollarVolume20d ?? null,
        close: detail?.metrics?.close ?? null,
        distance_from_50d_atr: detail?.metrics?.distanceFrom50dAtr ?? null,
        drawdown_from_52w_high: detail?.metrics?.drawdownFrom52wHigh ?? null,
        price_date: detail?.metrics?.date ?? null,
        return_1m: detail?.metrics?.return1m ?? null,
        return_3m: detail?.metrics?.return3m ?? null,
        valuation_state: detail?.valuation?.state ?? null,
        vs_theme_1m: detail?.relative_strength?.vsTheme1m ?? null,
        vs_theme_3m: detail?.relative_strength?.vsTheme3m ?? null,
      };
    }),
  };
}
