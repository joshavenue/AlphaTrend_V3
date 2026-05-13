import type { DemandDbClient } from "@/lib/demand/types";
import { T2_DEMAND_DETAIL_METRIC } from "@/lib/demand/constants";
import { isUuid } from "@/lib/util/uuid";

function themeWhere(themeRef?: string) {
  if (!themeRef) {
    return undefined;
  }

  return {
    OR: [
      ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
      { sourceThemeCode: themeRef },
      { themeSlug: themeRef },
    ],
  };
}

function safeJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function buildDemandReport(
  prisma: DemandDbClient,
  themeRef?: string,
) {
  const themes = await prisma.themeDefinition.findMany({
    include: {
      economicMappings: {
        orderBy: {
          feedId: "asc",
        },
      },
    },
    orderBy: [
      {
        sourceThemeCode: "asc",
      },
      {
        themeName: "asc",
      },
    ],
    where: themeWhere(themeRef),
  });
  const evidenceRows = await prisma.evidenceLedger.findMany({
    orderBy: {
      fetchedAt: "desc",
    },
    select: {
      evidenceId: true,
      fetchedAt: true,
      metricValueNum: true,
      metricValueText: true,
      reasonCode: true,
      themeId: true,
    },
    where: {
      metricName: T2_DEMAND_DETAIL_METRIC,
      themeId: {
        in: themes.map((theme) => theme.themeId),
      },
    },
  });

  return {
    generated_at: new Date().toISOString(),
    themes: themes.map((theme) => {
      const latestScore = evidenceRows.find(
        (row) => row.themeId === theme.themeId,
      );

      return {
        demand_detail: safeJson(latestScore?.metricValueText ?? null),
        economic_mappings: theme.economicMappings.map((mapping) => ({
          enabled: mapping.enabled,
          feed_id: mapping.feedId,
          maps_to_security: mapping.mapsToSecurity,
          provider: mapping.provider,
          series_or_query_id: mapping.seriesOrQueryId,
        })),
        latest_score: latestScore
          ? {
              evidence_id: latestScore.evidenceId,
              fetched_at: latestScore.fetchedAt.toISOString(),
              reason_code: latestScore.reasonCode,
              score: Number(latestScore.metricValueNum),
            }
          : null,
        source_theme_code: theme.sourceThemeCode,
        theme_id: theme.themeId,
        theme_name: theme.themeName,
        theme_slug: theme.themeSlug,
      };
    }),
  };
}
