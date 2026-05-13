import type { EvidenceGrade, ProviderName } from "@/generated/prisma/client";
import {
  DEMAND_REASON_CODES,
  T2_DEMAND_DETAIL_METRIC,
  T2_DEMAND_LOCK_TTL_MS,
  T2_PROVIDER_FEED_METRIC,
} from "@/lib/demand/constants";
import {
  DEMAND_FEED_REGISTRY,
  feedsForThemeCode,
  upsertThemeDemandMappings,
} from "@/lib/demand/registry";
import { scoreEconomicDemand } from "@/lib/demand/scoring";
import type {
  DemandDbClient,
  DemandFeedDefinition,
  DemandFetchOptions,
  DemandFetchSummary,
  DemandScoreOptions,
  DemandScoreSummary,
  DemandWarning,
} from "@/lib/demand/types";
import { toJsonValue } from "@/lib/demand/types";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import {
  fetchBeaDatasets,
  fetchBlsCpiSeries,
  fetchEiaElectricityRetailSales,
  fetchEiaRoutes,
  fetchFredObservations,
  fetchUsaSpendingAwards,
} from "@/lib/providers/clients";
import type {
  BlsObservation,
  EiaDataPoint,
  FredObservation,
  UsaSpendingAward,
} from "@/lib/providers/parsers";
import type { ProviderResult } from "@/lib/providers/types";
import { ACTIVE_THEME_STATUSES } from "@/lib/snapshots/constants";
import { isUuid } from "@/lib/util/uuid";

type ThemeForDemand = Awaited<ReturnType<typeof loadThemesForDemand>>[number];

function themeWhere(themeRef?: string) {
  if (!themeRef) {
    return {
      status: {
        in: [...ACTIVE_THEME_STATUSES],
      },
    };
  }

  return {
    OR: [
      ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
      { sourceThemeCode: themeRef },
      { themeSlug: themeRef },
    ],
  };
}

function scopeFromOptions(options: {
  provider?: ProviderName;
  themeRef?: string;
}) {
  return `${options.themeRef ?? "all-active"}:${options.provider ?? "all-providers"}`;
}

function shortError(error: string | undefined) {
  if (!error) {
    return undefined;
  }

  return error.length > 180 ? `${error.slice(0, 177)}...` : error;
}

function resultWarning(
  theme: ThemeForDemand,
  feed: DemandFeedDefinition,
  result: ProviderResult<unknown>,
): DemandWarning | undefined {
  if (result.ok) {
    return undefined;
  }

  return {
    code: DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP,
    feedId: feed.feedId,
    message: `${result.provider}:${result.endpoint} ${feed.feedId} ${result.status}${
      result.sanitizedError ? ` - ${shortError(result.sanitizedError)}` : ""
    }`,
    severity: "WARNING",
    themeCode: theme.sourceThemeCode,
  };
}

function sourceHash(result: ProviderResult<unknown>) {
  return result.responseHash ?? result.requestHash;
}

function kindForEndpoint(endpoint: string): DemandFeedDefinition["kind"] {
  switch (endpoint) {
    case "series_observations":
      return "fred_observations";
    case "dataset_list":
      return "bea_dataset_list";
    case "timeseries_cpi":
      return "bls_cpi";
    case "electricity_retail_sales":
      return "eia_electricity_retail_sales";
    case "v2_root":
      return "eia_routes";
    case "spending_by_award":
      return "usaspending_awards";
    case "missing_external_feed":
      return "missing_provider_gap";
    default:
      return "missing_provider_gap";
  }
}

function feedsForTheme(theme: ThemeForDemand): DemandFeedDefinition[] {
  const registryFeeds = feedsForThemeCode(theme.sourceThemeCode);

  if (registryFeeds.length > 0) {
    return registryFeeds;
  }

  return theme.economicMappings.map((mapping) => ({
    description: mapping.description,
    enabled: mapping.enabled,
    endpoint: mapping.endpoint,
    evidenceGradeCeiling: mapping.evidenceGradeCeiling,
    feedId: mapping.feedId,
    frequency: mapping.frequency ?? undefined,
    freshnessThresholdDays: mapping.freshnessThresholdDays,
    kind: kindForEndpoint(mapping.endpoint),
    mappingMethod: mapping.mappingMethod,
    mapsToSecurity: mapping.mapsToSecurity,
    mapsToTheme: mapping.mapsToTheme,
    proofCategory:
      mapping.proofCategory as DemandFeedDefinition["proofCategory"],
    provider: mapping.provider,
    seriesOrQueryId: mapping.seriesOrQueryId,
    themeCode: theme.sourceThemeCode ?? theme.themeSlug,
  }));
}

function providerCalls(results: ProviderResult<unknown>[]) {
  return results.filter((result) => result.status !== "UNCONFIGURED").length;
}

function dateFromIso(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function dateFromBlsPeriod(row: BlsObservation) {
  if (!row.period.startsWith("M")) {
    return undefined;
  }

  const month = Number(row.period.slice(1));

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return undefined;
  }

  return new Date(
    `${row.year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`,
  );
}

function dateFromEiaPeriod(period: string) {
  if (/^\d{4}-\d{2}$/.test(period)) {
    return new Date(`${period}-01T00:00:00.000Z`);
  }

  if (/^\d{4}$/.test(period)) {
    return new Date(`${period}-01-01T00:00:00.000Z`);
  }

  return undefined;
}

async function acquireLock(
  prisma: DemandDbClient,
  jobRunId: string,
  prefix: string,
  scope: string,
) {
  const lockKey = `${prefix}:${scope}`;
  const now = new Date();

  await prisma.jobLock.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
      lockKey,
    },
  });

  try {
    await prisma.jobLock.create({
      data: {
        expiresAt: new Date(now.getTime() + T2_DEMAND_LOCK_TTL_MS),
        jobRunId,
        lockKey,
        ownerId: "economic-demand-cli",
      },
    });
  } catch {
    throw new Error(`Economic demand job is already running for ${scope}.`);
  }

  return lockKey;
}

async function releaseLock(
  prisma: DemandDbClient,
  jobRunId: string,
  lockKey: string,
) {
  await prisma.jobLock.deleteMany({
    where: {
      jobRunId,
      lockKey,
    },
  });
}

async function loadThemesForDemand(
  prisma: DemandDbClient,
  options: DemandFetchOptions | DemandScoreOptions,
) {
  return prisma.themeDefinition.findMany({
    include: {
      economicMappings: true,
    },
    orderBy: [
      {
        sourceThemeCode: "asc",
      },
      {
        themeName: "asc",
      },
    ],
    where: themeWhere(options.themeRef),
  });
}

async function ensureSeries(input: {
  feed: DemandFeedDefinition;
  prisma: DemandDbClient;
  result?: ProviderResult<unknown>;
}) {
  if (
    input.feed.kind === "missing_provider_gap" ||
    input.feed.kind === "usaspending_awards"
  ) {
    return undefined;
  }

  return input.prisma.economicSeries.upsert({
    create: {
      description: input.feed.description,
      endpoint: input.feed.endpoint,
      evidenceGradeCeiling: input.feed.evidenceGradeCeiling,
      frequency: input.feed.frequency,
      provider: input.feed.provider,
      seriesId: input.feed.seriesOrQueryId,
      sourcePayloadHash: input.result?.responseHash,
      title: input.feed.feedId,
    },
    update: {
      description: input.feed.description,
      evidenceGradeCeiling: input.feed.evidenceGradeCeiling,
      frequency: input.feed.frequency,
      sourcePayloadHash: input.result?.responseHash,
      title: input.feed.feedId,
    },
    where: {
      provider_endpoint_seriesId: {
        endpoint: input.feed.endpoint,
        provider: input.feed.provider,
        seriesId: input.feed.seriesOrQueryId,
      },
    },
  });
}

async function linkMappingSeries(input: {
  economicSeriesId?: string;
  feedId: string;
  prisma: DemandDbClient;
  themeId: string;
}) {
  if (!input.economicSeriesId) {
    return;
  }

  await input.prisma.themeEconomicMapping.update({
    data: {
      economicSeriesId: input.economicSeriesId,
    },
    where: {
      themeId_feedId: {
        feedId: input.feedId,
        themeId: input.themeId,
      },
    },
  });
}

async function writeObservation(input: {
  economicSeriesId: string;
  fetchedAt: Date;
  metricName: string;
  metricUnit?: string;
  metricValue?: number | null;
  observationDate: Date;
  payloadId?: string;
  periodLabel?: string;
  prisma: DemandDbClient;
  provider: ProviderName;
  sourcePayloadHash?: string;
}) {
  await input.prisma.economicObservation.upsert({
    create: {
      economicSeriesId: input.economicSeriesId,
      fetchedAt: input.fetchedAt,
      metricName: input.metricName,
      metricUnit: input.metricUnit,
      metricValue: input.metricValue,
      observationDate: input.observationDate,
      payloadId: input.payloadId,
      periodLabel: input.periodLabel,
      provider: input.provider,
      sourcePayloadHash: input.sourcePayloadHash,
    },
    update: {
      fetchedAt: input.fetchedAt,
      metricUnit: input.metricUnit,
      metricValue: input.metricValue,
      payloadId: input.payloadId,
      periodLabel: input.periodLabel,
      sourcePayloadHash: input.sourcePayloadHash,
    },
    where: {
      economicSeriesId_observationDate_metricName: {
        economicSeriesId: input.economicSeriesId,
        metricName: input.metricName,
        observationDate: input.observationDate,
      },
    },
  });
}

async function writeSeriesObservations(input: {
  feed: DemandFeedDefinition;
  prisma: DemandDbClient;
  result: ProviderResult<unknown>;
  seriesId: string;
}) {
  const series = await ensureSeries({
    feed: input.feed,
    prisma: input.prisma,
    result: input.result,
  });

  if (!series || !input.result.data) {
    return 0;
  }

  const fetchedAt = new Date(input.result.fetchedAt);
  let rowsWritten = 0;

  if (input.feed.kind === "fred_observations") {
    for (const row of input.result.data as FredObservation[]) {
      const date = dateFromIso(row.date);

      if (!date) {
        continue;
      }

      await writeObservation({
        economicSeriesId: series.economicSeriesId,
        fetchedAt,
        metricName: `fred.${row.seriesId}`,
        metricValue: row.value,
        observationDate: date,
        payloadId: input.result.payloadId,
        periodLabel: row.date,
        prisma: input.prisma,
        provider: input.result.provider,
        sourcePayloadHash: sourceHash(input.result),
      });
      rowsWritten += 1;
    }
  } else if (input.feed.kind === "bls_cpi") {
    for (const row of input.result.data as BlsObservation[]) {
      const date = dateFromBlsPeriod(row);

      if (!date) {
        continue;
      }

      await writeObservation({
        economicSeriesId: series.economicSeriesId,
        fetchedAt,
        metricName: `bls.${row.seriesId}`,
        metricValue: row.value,
        observationDate: date,
        payloadId: input.result.payloadId,
        periodLabel: `${row.year}-${row.period}`,
        prisma: input.prisma,
        provider: input.result.provider,
        sourcePayloadHash: sourceHash(input.result),
      });
      rowsWritten += 1;
    }
  } else if (input.feed.kind === "eia_electricity_retail_sales") {
    for (const row of input.result.data as EiaDataPoint[]) {
      const date = dateFromEiaPeriod(row.period);

      if (!date) {
        continue;
      }

      await writeObservation({
        economicSeriesId: series.economicSeriesId,
        fetchedAt,
        metricName: `eia.${row.metricName}`,
        metricUnit: row.unit,
        metricValue: row.value,
        observationDate: date,
        payloadId: input.result.payloadId,
        periodLabel: row.period,
        prisma: input.prisma,
        provider: input.result.provider,
        sourcePayloadHash: sourceHash(input.result),
      });
      rowsWritten += 1;
    }
  }

  return rowsWritten;
}

async function writeGovernmentAwards(input: {
  prisma: DemandDbClient;
  result: ProviderResult<UsaSpendingAward[]>;
  themeId: string;
}) {
  if (!input.result.data) {
    return 0;
  }

  let rowsWritten = 0;

  for (const award of input.result.data) {
    const existing = award.awardId
      ? await input.prisma.governmentAward.findFirst({
          where: {
            awardId: award.awardId,
            provider: "USA_SPENDING",
          },
        })
      : undefined;
    const data = {
      awardAmount: award.awardAmount,
      awardId: award.awardId,
      awardType: award.awardType,
      awardingAgency: award.awardingAgency,
      description: award.description,
      endDate: dateFromIso(award.endDate),
      fetchedAt: new Date(input.result.fetchedAt),
      fundingAgency: award.fundingAgency,
      mappingConfidence: "REVIEW_REQUIRED" as const,
      mappingMethod: "unmapped_theme_level",
      payloadId: input.result.payloadId,
      provider: "USA_SPENDING" as const,
      recipientDuns: award.recipientDuns,
      recipientName: award.recipientName,
      recipientUei: award.recipientUei,
      sourcePayloadHash: sourceHash(input.result),
      startDate: dateFromIso(award.startDate),
      themeId: input.themeId,
    };

    if (existing) {
      await input.prisma.governmentAward.update({
        data,
        where: {
          governmentAwardId: existing.governmentAwardId,
        },
      });
    } else {
      await input.prisma.governmentAward.create({
        data,
      });
    }

    if (award.recipientName) {
      const recipientIdentifier =
        award.recipientUei ?? award.recipientDuns ?? undefined;
      const sourceDetail = toJsonValue({
        award_id: award.awardId,
        naics: award.naics,
        psc: award.psc,
        recipient_duns: award.recipientDuns,
        recipient_uei: award.recipientUei,
        source: "usaspending",
      });
      const mapping = await input.prisma.recipientSecurityMapping.findFirst({
        where: {
          provider: "USA_SPENDING",
          recipientName: award.recipientName,
          securityId: null,
        },
      });

      if (!mapping) {
        await input.prisma.recipientSecurityMapping.create({
          data: {
            confidence: "REVIEW_REQUIRED",
            mappingMethod: "unmapped",
            notes:
              "Phase 14 preserves USAspending recipient evidence at theme level until reviewed.",
            provider: "USA_SPENDING",
            recipientIdentifier,
            recipientName: award.recipientName,
            reviewStatus: "REVIEW_REQUIRED",
            sourceDetail,
          },
        });
      } else {
        await input.prisma.recipientSecurityMapping.update({
          data: {
            recipientIdentifier:
              mapping.recipientIdentifier ?? recipientIdentifier,
            sourceDetail,
          },
          where: {
            recipientSecurityMappingId: mapping.recipientSecurityMappingId,
          },
        });
      }
    }

    rowsWritten += 1;
  }

  return rowsWritten;
}

async function writeFeedEvidence(input: {
  evidenceGrade: EvidenceGrade;
  feed: DemandFeedDefinition;
  jobRunId: string;
  metricValueNum?: number;
  metricValueText: string;
  prisma: DemandDbClient;
  reasonCode: string;
  result?: ProviderResult<unknown>;
  theme: ThemeForDemand;
}) {
  return insertEvidence(input.prisma, {
    endpoint: input.feed.endpoint,
    entityId: input.feed.feedId,
    entityType: "demand_feed",
    evidenceGrade: input.evidenceGrade,
    fetchedAt: input.result ? new Date(input.result.fetchedAt) : new Date(),
    jobRunId: input.jobRunId,
    metricName: T2_PROVIDER_FEED_METRIC,
    metricValueNum: input.metricValueNum,
    metricValueText: input.metricValueText,
    provider: input.result?.provider ?? input.feed.provider,
    reasonCode: input.reasonCode,
    sourcePayloadHash: input.result
      ? sourceHash(input.result)
      : hashPayload(input.feed),
    sourceUrlOrEndpoint: `alphatrend://demand_feed/${input.feed.feedId}`,
    themeId: input.theme.themeId,
  });
}

async function fetchFeed(input: {
  feed: DemandFeedDefinition;
  jobRunId: string;
  prisma: DemandDbClient;
}): Promise<ProviderResult<unknown> | undefined> {
  const context = {
    jobRunId: input.jobRunId,
    prisma: input.prisma,
  };

  switch (input.feed.kind) {
    case "fred_observations":
      return fetchFredObservations(context, input.feed.seriesOrQueryId);
    case "bea_dataset_list":
      return fetchBeaDatasets(context);
    case "bls_cpi":
      return fetchBlsCpiSeries(context);
    case "eia_routes":
      return fetchEiaRoutes(context);
    case "eia_electricity_retail_sales":
      return fetchEiaElectricityRetailSales(context);
    case "usaspending_awards":
      return fetchUsaSpendingAwards(context);
    case "missing_provider_gap":
    case "uspto_placeholder":
      return undefined;
  }
}

async function writeJobItem(input: {
  feed: DemandFeedDefinition;
  jobRunId: string;
  prisma: DemandDbClient;
  result?: ProviderResult<unknown>;
  status?: "FAILED" | "SKIPPED" | "SUCCEEDED";
}) {
  const now = new Date();

  await input.prisma.jobItem.create({
    data: {
      errorSummary: input.result?.sanitizedError,
      finishedAt: now,
      itemId: input.feed.feedId,
      itemType: "DEMAND_FEED",
      jobRunId: input.jobRunId,
      startedAt: now,
      status:
        input.status ?? (input.result?.ok === false ? "FAILED" : "SUCCEEDED"),
    },
  });
}

export async function fetchEconomicDemand(
  prisma: DemandDbClient,
  options: DemandFetchOptions = {},
): Promise<DemandFetchSummary> {
  const scope = scopeFromOptions(options);
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "ECONOMIC_DEMAND_FETCH",
      scopeId: scope,
      scopeType: "economic_demand",
      status: "STARTED",
    },
  });
  let lockKey: string | undefined;
  const warnings: DemandWarning[] = [];
  let themes: ThemeForDemand[] = [];
  const providerResults: ProviderResult<unknown>[] = [];
  let evidenceWritten = 0;
  let feedsFetched = 0;
  let observationsWritten = 0;
  let rowsWritten = 0;

  try {
    lockKey = await acquireLock(
      prisma,
      jobRun.jobRunId,
      "economic_demand_fetch",
      scope,
    );
    themes = await loadThemesForDemand(prisma, options);

    for (const theme of themes) {
      const feeds = await upsertThemeDemandMappings({
        prisma,
        sourceThemeCode: theme.sourceThemeCode,
        themeId: theme.themeId,
      });
      rowsWritten += feeds.length;

      for (const feed of feeds) {
        if (options.provider && feed.provider !== options.provider) {
          continue;
        }

        if (feed.kind === "missing_provider_gap") {
          await writeFeedEvidence({
            evidenceGrade: "D",
            feed,
            jobRunId: jobRun.jobRunId,
            metricValueText: JSON.stringify({
              feed_id: feed.feedId,
              gap: feed.seriesOrQueryId,
              message: feed.description,
            }),
            prisma,
            reasonCode: DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP,
            theme,
          });
          warnings.push({
            code: DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP,
            feedId: feed.feedId,
            message: feed.description,
            severity: "WARNING",
            themeCode: theme.sourceThemeCode,
          });
          await writeJobItem({
            feed,
            jobRunId: jobRun.jobRunId,
            prisma,
            status: "SKIPPED",
          });
          evidenceWritten += 1;
          rowsWritten += 2;
          continue;
        }

        const result = await fetchFeed({
          feed,
          jobRunId: jobRun.jobRunId,
          prisma,
        });

        if (!result) {
          continue;
        }

        providerResults.push(result);
        feedsFetched += 1;
        const maybeWarning = resultWarning(theme, feed, result);

        if (maybeWarning) {
          warnings.push(maybeWarning);
        }

        const series = await ensureSeries({
          feed,
          prisma,
          result,
        });
        await linkMappingSeries({
          economicSeriesId: series?.economicSeriesId,
          feedId: feed.feedId,
          prisma,
          themeId: theme.themeId,
        });

        if (result.ok) {
          if (
            feed.kind === "fred_observations" ||
            feed.kind === "bls_cpi" ||
            feed.kind === "eia_electricity_retail_sales"
          ) {
            observationsWritten += await writeSeriesObservations({
              feed,
              prisma,
              result,
              seriesId: feed.seriesOrQueryId,
            });
          } else if (feed.kind === "usaspending_awards") {
            observationsWritten += await writeGovernmentAwards({
              prisma,
              result: result as ProviderResult<UsaSpendingAward[]>,
              themeId: theme.themeId,
            });
          }
        }

        const rowCount = result.rowCount ?? 0;
        const reasonCode = result.ok
          ? (feed.positiveReasonCode ??
            DEMAND_REASON_CODES.DEMAND_MACRO_CONTEXT_SUPPORT)
          : DEMAND_REASON_CODES.DEMAND_PROVIDER_DATA_GAP;
        const evidenceGrade = result.ok ? feed.evidenceGradeCeiling : "D";

        await writeFeedEvidence({
          evidenceGrade,
          feed,
          jobRunId: jobRun.jobRunId,
          metricValueNum: rowCount,
          metricValueText: JSON.stringify({
            feed_id: feed.feedId,
            kind: feed.kind,
            provider_status: result.status,
            row_count: rowCount,
            series_or_query_id: feed.seriesOrQueryId,
          }),
          prisma,
          reasonCode,
          result,
          theme,
        });
        await writeJobItem({
          feed,
          jobRunId: jobRun.jobRunId,
          prisma,
          result,
        });
        evidenceWritten += 1;
        rowsWritten += 2;
      }
    }

    rowsWritten += observationsWritten;
    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length > 0 ? `${warnings.length} warning(s)` : undefined,
        finishedAt: new Date(),
        providerCalls: providerCalls(providerResults),
        rowsRead: providerResults.reduce(
          (sum, result) => sum + (result.rowCount ?? 0),
          0,
        ),
        rowsWritten,
        status: warnings.length > 0 ? "PARTIAL" : "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    return {
      evidenceWritten,
      feedsFetched,
      jobRunId: jobRun.jobRunId,
      observationsWritten,
      providerCalls: providerCalls(providerResults),
      rowsRead: providerResults.reduce(
        (sum, result) => sum + (result.rowCount ?? 0),
        0,
      ),
      rowsWritten,
      themes: themes.map((theme) => ({
        sourceThemeCode: theme.sourceThemeCode,
        themeId: theme.themeId,
        themeName: theme.themeName,
      })),
      warnings,
    };
  } catch (error) {
    await prisma.jobRun.update({
      data: {
        errorSummary: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
        providerCalls: providerCalls(providerResults),
        rowsWritten,
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });
    throw error;
  } finally {
    if (lockKey) {
      await releaseLock(prisma, jobRun.jobRunId, lockKey);
    }
  }
}

function feedIdFromEvidenceText(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as { feed_id?: unknown };

    return typeof parsed.feed_id === "string" ? parsed.feed_id : undefined;
  } catch {
    return undefined;
  }
}

async function loadDemandEvidence(prisma: DemandDbClient, themeIds: string[]) {
  if (themeIds.length === 0) {
    return [];
  }

  return prisma.evidenceLedger.findMany({
    orderBy: {
      fetchedAt: "desc",
    },
    select: {
      evidenceGrade: true,
      evidenceId: true,
      fetchedAt: true,
      metricName: true,
      metricValueNum: true,
      metricValueText: true,
      provider: true,
      reasonCode: true,
      themeId: true,
    },
    where: {
      metricName: T2_PROVIDER_FEED_METRIC,
      themeId: {
        in: themeIds,
      },
    },
  });
}

export async function scoreEconomicDemandThemes(
  prisma: DemandDbClient,
  options: DemandScoreOptions = {},
): Promise<DemandScoreSummary> {
  const scope = scopeFromOptions(options);
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "ECONOMIC_DEMAND_SCORE",
      scopeId: scope,
      scopeType: "economic_demand",
      status: "STARTED",
    },
  });
  let lockKey: string | undefined;
  const warnings: DemandWarning[] = [];
  let themes: ThemeForDemand[] = [];
  let evidenceRows: Awaited<ReturnType<typeof loadDemandEvidence>> = [];
  let evidenceWritten = 0;
  let rowsWritten = 0;

  try {
    lockKey = await acquireLock(
      prisma,
      jobRun.jobRunId,
      "economic_demand_score",
      scope,
    );
    themes = await loadThemesForDemand(prisma, options);
    evidenceRows = await loadDemandEvidence(
      prisma,
      themes.map((theme) => theme.themeId),
    );

    const summaries = [];

    for (const theme of themes) {
      const feeds =
        theme.economicMappings.length > 0
          ? feedsForTheme(theme)
          : await upsertThemeDemandMappings({
              prisma,
              sourceThemeCode: theme.sourceThemeCode,
              themeId: theme.themeId,
            });
      const themeEvidence = evidenceRows.filter(
        (row) => row.themeId === theme.themeId,
      );
      const detail = scoreEconomicDemand({
        evidenceIds: themeEvidence.map((row) => row.evidenceId),
        evidenceRows: themeEvidence.map((row) => ({
          evidenceGrade: row.evidenceGrade,
          feedId: feedIdFromEvidenceText(row.metricValueText),
          fetchedAt: row.fetchedAt,
          metricName: row.metricName,
          metricValueNum:
            row.metricValueNum === null || row.metricValueNum === undefined
              ? undefined
              : Number(row.metricValueNum),
          provider: row.provider,
          reasonCode: row.reasonCode,
        })),
        feeds,
      });
      await insertEvidence(prisma, {
        endpoint: "economic_demand_scorer",
        entityId: theme.themeId,
        entityType: "theme_definition",
        evidenceGrade: detail.evidence_grade_ceiling ?? "B",
        fetchedAt: new Date(),
        jobRunId: jobRun.jobRunId,
        metricName: T2_DEMAND_DETAIL_METRIC,
        metricValueNum: detail.final_score,
        metricValueText: JSON.stringify(detail),
        provider: "ALPHATREND_INTERNAL",
        reasonCode:
          detail.positive_reason_codes[0] ??
          detail.caution_reason_codes[0] ??
          DEMAND_REASON_CODES.DEMAND_PROOF_MISSING,
        sourcePayloadHash: hashPayload(detail),
        sourceUrlOrEndpoint: "alphatrend://economic_demand_scorer",
        themeId: theme.themeId,
      });

      await prisma.jobItem.create({
        data: {
          finishedAt: new Date(),
          itemId: theme.themeId,
          itemType: "ECONOMIC_DEMAND_SCORE",
          jobRunId: jobRun.jobRunId,
          startedAt: new Date(),
          status: "SUCCEEDED",
        },
      });

      if (detail.caution_reason_codes.length > 0) {
        warnings.push(
          ...detail.caution_reason_codes.map((code) => ({
            code,
            message: `${theme.sourceThemeCode ?? theme.themeSlug} economic demand score emitted ${code}.`,
            severity: "WARNING" as const,
            themeCode: theme.sourceThemeCode,
          })),
        );
      }

      evidenceWritten += 1;
      rowsWritten += 2;
      summaries.push({
        demandState: detail.demand_state,
        providerCoverage: detail.components.provider_coverage,
        score: detail.final_score,
        sourceThemeCode: theme.sourceThemeCode,
        themeId: theme.themeId,
        themeName: theme.themeName,
      });
    }

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length > 0 ? `${warnings.length} warning(s)` : undefined,
        finishedAt: new Date(),
        rowsRead: evidenceRows.length,
        rowsWritten,
        status: warnings.length > 0 ? "PARTIAL" : "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    return {
      evidenceWritten,
      jobRunId: jobRun.jobRunId,
      rowsRead: evidenceRows.length,
      rowsWritten,
      themes: summaries,
      warnings,
    };
  } catch (error) {
    await prisma.jobRun.update({
      data: {
        errorSummary: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
        rowsRead: evidenceRows.length,
        rowsWritten,
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });
    throw error;
  } finally {
    if (lockKey) {
      await releaseLock(prisma, jobRun.jobRunId, lockKey);
    }
  }
}

export function demandRegistrySummary() {
  return DEMAND_FEED_REGISTRY.reduce<Record<string, number>>(
    (summary, feed) => {
      summary[feed.themeCode] = (summary[feed.themeCode] ?? 0) + 1;
      return summary;
    },
    {},
  );
}
