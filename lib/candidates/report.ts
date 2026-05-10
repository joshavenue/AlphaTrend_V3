import type { CandidateDbClient } from "@/lib/candidates/types";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function sourceTypes(sourceDetail: unknown) {
  if (
    sourceDetail &&
    typeof sourceDetail === "object" &&
    !Array.isArray(sourceDetail) &&
    "source_types" in sourceDetail &&
    Array.isArray(sourceDetail.source_types)
  ) {
    return sourceDetail.source_types.map(String);
  }

  return [];
}

function groupCounts<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export async function buildCandidateReport(
  prisma: CandidateDbClient,
  themeRef?: string,
) {
  const themeWhere = themeRef
    ? {
        OR: [
          ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
          { sourceThemeCode: themeRef },
          { themeSlug: themeRef },
        ],
      }
    : undefined;

  const candidates = await prisma.themeCandidate.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          exchange: true,
          securityType: true,
          universeBucket: true,
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
      theme: themeWhere,
    },
  });

  const sourceCounts = groupCounts(
    candidates.flatMap((candidate) => sourceTypes(candidate.sourceDetail)),
  );
  const statusCounts = groupCounts(
    candidates.map((candidate) => candidate.candidateStatus),
  );
  const dashboardCounts = groupCounts(
    candidates.map((candidate) =>
      candidate.dashboardVisible ? "dashboard_visible" : "review_only",
    ),
  );

  return {
    candidates: candidates.map((candidate) => ({
      candidate_status: candidate.candidateStatus,
      company_name: candidate.security.companyName,
      dashboard_visible: candidate.dashboardVisible,
      display_group: candidate.displayGroup,
      exchange: candidate.security.exchange,
      final_state: candidate.finalState,
      security_type: candidate.security.securityType,
      source_of_inclusion: candidate.sourceOfInclusion,
      source_types: sourceTypes(candidate.sourceDetail),
      theme: candidate.theme.sourceThemeCode,
      theme_name: candidate.theme.themeName,
      ticker: candidate.security.canonicalTicker,
      universe_bucket: candidate.security.universeBucket,
    })),
    dashboard_counts: dashboardCounts,
    source_counts: sourceCounts,
    status_counts: statusCounts,
    theme_filter: themeRef ?? "all",
    total_candidates: candidates.length,
  };
}
