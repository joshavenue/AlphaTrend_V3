import type { ExposureDbClient } from "@/lib/exposure/types";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
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

export async function buildExposureReport(
  prisma: ExposureDbClient,
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
          signalLayer: T1_SIGNAL_LAYER,
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        take: 1,
        where: {
          signalLayer: T1_SIGNAL_LAYER,
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

    return {
      beneficiary_type: candidate.beneficiaryType,
      candidate_status: candidate.candidateStatus,
      company_name: candidate.security.companyName,
      computed_at: score?.computedAt?.toISOString() ?? null,
      dashboard_visible: candidate.dashboardVisible,
      display_group: candidate.displayGroup,
      exchange: candidate.security.exchange,
      exposure_purity_score:
        score?.score === null || score?.score === undefined
          ? null
          : Number(score.score),
      reason_codes: score?.reasonCodes ?? state?.reasonCodes ?? [],
      signal_state: state?.state ?? null,
      source_of_inclusion: candidate.sourceOfInclusion,
      theme: candidate.theme.sourceThemeCode,
      theme_name: candidate.theme.themeName,
      ticker: candidate.security.canonicalTicker,
      universe_bucket: candidate.security.universeBucket,
    };
  });

  return {
    display_group_counts: groupCounts(
      rows.map((row) => row.display_group ?? "Ungrouped"),
    ),
    state_counts: groupCounts(
      rows.map((row) => row.signal_state ?? "UNSCORED"),
    ),
    status_counts: groupCounts(rows.map((row) => row.candidate_status)),
    theme_filter: themeRef ?? "all",
    total_candidates: rows.length,
    total_scored: rows.filter((row) => row.exposure_purity_score !== null)
      .length,
    candidates: rows,
  };
}
