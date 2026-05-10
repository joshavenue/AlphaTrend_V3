import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Security } from "@/generated/prisma/client";
import {
  fetchFmpCompanyScreener,
  fetchFmpEtfHoldings,
} from "@/lib/providers/clients";
import type { ProviderResult } from "@/lib/providers/types";
import { validateCompanySeedRows } from "@/lib/themes/company-seeds";
import {
  etfHoldingSourcesForTheme,
  fmpScreenerSourcesForTheme,
  manualSeedSourcesForTheme,
  normalizeTicker,
  seedEtfsFromTheme,
} from "@/lib/candidates/sources";
import { persistCandidateSources } from "@/lib/candidates/persist";
import type {
  CandidateDbClient,
  CandidateGenerationSummary,
  CandidateGenerationThemeSummary,
  CandidateSourceInput,
  CandidateSourceRecord,
  CandidateWarning,
} from "@/lib/candidates/types";

const DEFAULT_COMPANY_SEED_PATH = resolve(
  process.cwd(),
  "data/theme-seeds/AlphaTrend_V3_theme_company_seed_universe.csv",
);
const LOCK_TTL_MS = 30 * 60 * 1_000;
const MAX_WARNING_JOB_ITEMS = 1_000;
const ACTIVE_THEME_STATUSES = [
  "ACTIVE_UNSCANNED",
  "ACTIVE_SCANNED",
  "ACTIVE",
] as const;
const ELIGIBLE_UNIVERSE_BUCKETS = new Set(["US_COMMON_ALL", "US_ADR_ALL"]);

type CandidateTheme = Awaited<
  ReturnType<typeof loadThemesForGeneration>
>[number];

export type GenerateCandidatesOptions = {
  companySeedPath?: string;
  includeFmp?: boolean;
  includeManualSeeds?: boolean;
  themeRef?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function shortError(error: string | undefined) {
  if (!error) {
    return undefined;
  }

  return error.length > 180 ? `${error.slice(0, 177)}...` : error;
}

function providerCalls(results: ProviderResult<unknown>[]) {
  return results.filter((result) => result.status !== "UNCONFIGURED").length;
}

function rowsReadFromProviders(results: ProviderResult<unknown>[]) {
  return results.reduce((sum, result) => sum + (result.rowCount ?? 0), 0);
}

async function loadThemesForGeneration(
  prisma: CandidateDbClient,
  themeRef?: string,
) {
  const where = themeRef
    ? {
        OR: [
          ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
          { sourceThemeCode: themeRef },
          { themeSlug: themeRef },
        ],
      }
    : {
        status: {
          in: [...ACTIVE_THEME_STATUSES],
        },
      };

  const themes = await prisma.themeDefinition.findMany({
    orderBy: {
      sourceThemeCode: "asc",
    },
    select: {
      directBeneficiaryCategories: true,
      indirectBeneficiaryCategories: true,
      seedEtfs: true,
      sourceThemeCode: true,
      themeId: true,
      themeName: true,
      themeSlug: true,
    },
    where,
  });

  if (themes.length === 0) {
    throw new Error(
      themeRef
        ? `No theme found for ${themeRef}.`
        : "No active themes found for candidate generation.",
    );
  }

  return themes;
}

async function acquireLock(
  prisma: CandidateDbClient,
  jobRunId: string,
  scope: string,
) {
  const lockKey = `theme_candidate_generation:${scope}`;
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
        expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
        jobRunId,
        lockKey,
        ownerId: "candidate-generation-cli",
      },
    });
  } catch {
    throw new Error(
      `THEME_CANDIDATE_GENERATION is already running for ${scope}.`,
    );
  }

  return lockKey;
}

async function releaseLock(
  prisma: CandidateDbClient,
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

function warning(input: CandidateWarning): CandidateWarning {
  return input;
}

function securityEligibility(
  source: CandidateSourceInput,
  matches: Security[],
): { security?: Security; warnings: CandidateWarning[] } {
  if (matches.length === 0) {
    return {
      warnings: [
        warning({
          code: "CANDIDATE_SOURCE_TICKER_NOT_IN_SECURITY_MASTER",
          message: `${source.ticker} could not be mapped to the Phase 3 security master.`,
          severity: "WARNING",
          source: source.sourceType,
          themeCode: source.themeCode,
          ticker: source.ticker,
        }),
      ],
    };
  }

  const eligible = matches
    .filter(
      (security) =>
        security.isActive &&
        !security.isDelisted &&
        !security.isEtf &&
        !security.isTestIssue &&
        security.universeBucket !== null &&
        ELIGIBLE_UNIVERSE_BUCKETS.has(security.universeBucket),
    )
    .sort((left, right) => {
      const bucketRank =
        (left.universeBucket === "US_COMMON_ALL" ? 0 : 1) -
        (right.universeBucket === "US_COMMON_ALL" ? 0 : 1);

      if (bucketRank !== 0) {
        return bucketRank;
      }

      return (left.exchange ?? "").localeCompare(right.exchange ?? "");
    });

  if (eligible.length === 0) {
    const reason = matches.some((security) => security.isEtf)
      ? "ETF securities are expression options, not stock candidates."
      : `No active common/ADR security is in an eligible universe bucket. Buckets: ${[
          ...new Set(
            matches.map((security) => security.universeBucket ?? "null"),
          ),
        ].join(", ")}`;

    return {
      warnings: [
        warning({
          code: matches.some((security) => security.isEtf)
            ? "CANDIDATE_SOURCE_ETF_EXCLUDED_FROM_STOCK_CANDIDATES"
            : "CANDIDATE_SOURCE_SECURITY_NOT_ELIGIBLE",
          message: `${source.ticker} skipped. ${reason}`,
          severity: "WARNING",
          source: source.sourceType,
          themeCode: source.themeCode,
          ticker: source.ticker,
        }),
      ],
    };
  }

  const warnings: CandidateWarning[] = [];

  if (eligible.length > 1) {
    warnings.push(
      warning({
        code: "CANDIDATE_SOURCE_MULTIPLE_SECURITY_MATCHES",
        message: `${source.ticker} mapped to multiple eligible securities; selected ${eligible[0].exchange ?? "unknown exchange"}.`,
        severity: "WARNING",
        source: source.sourceType,
        themeCode: source.themeCode,
        ticker: source.ticker,
      }),
    );
  }

  return {
    security: eligible[0],
    warnings,
  };
}

async function resolveCandidateSources(
  prisma: CandidateDbClient,
  sources: CandidateSourceInput[],
) {
  const tickers = [
    ...new Set(sources.map((source) => normalizeTicker(source.ticker))),
  ];
  const securities =
    tickers.length === 0
      ? []
      : await prisma.security.findMany({
          where: {
            canonicalTicker: {
              in: tickers,
            },
          },
        });
  const securitiesByTicker = new Map<string, Security[]>();

  for (const security of securities) {
    const existing = securitiesByTicker.get(security.canonicalTicker) ?? [];

    existing.push(security);
    securitiesByTicker.set(security.canonicalTicker, existing);
  }

  const records: CandidateSourceRecord[] = [];
  const warnings: CandidateWarning[] = [];

  for (const source of sources) {
    const normalizedTicker = normalizeTicker(source.ticker);
    const matches = securitiesByTicker.get(normalizedTicker) ?? [];
    const result = securityEligibility(source, matches);

    warnings.push(...result.warnings);

    if (!result.security) {
      continue;
    }

    records.push({
      ...source,
      securityId: result.security.securityId,
      ticker: normalizedTicker,
    });
  }

  return {
    records,
    warnings,
  };
}

async function writeWarningJobItems(
  prisma: CandidateDbClient,
  jobRunId: string,
  warnings: CandidateWarning[],
) {
  const now = new Date();
  const rows = warnings.slice(0, MAX_WARNING_JOB_ITEMS).map((item, index) => ({
    errorSummary: item.message.slice(0, 250),
    finishedAt: now,
    itemId: [
      item.themeCode ?? "theme",
      item.ticker ?? "ticker",
      item.code,
      index,
    ].join(":"),
    itemType: `THEME_CANDIDATE_WARNING:${item.code}`,
    jobRunId,
    startedAt: now,
    status:
      item.severity === "BLOCKER" ? ("FAILED" as const) : ("SKIPPED" as const),
  }));

  if (rows.length === 0) {
    return 0;
  }

  const result = await prisma.jobItem.createMany({
    data: rows,
  });

  return result.count;
}

async function loadCompanySeeds(
  companySeedPath: string,
  includeManualSeeds: boolean,
) {
  if (!includeManualSeeds) {
    return [];
  }

  const source = await readFile(companySeedPath, "utf8");
  const result = validateCompanySeedRows(source);
  const errors = result.issues.filter((issue) => issue.severity === "ERROR");

  if (errors.length > 0) {
    throw new Error(
      `Company seed validation failed: ${errors
        .slice(0, 3)
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return result.rows;
}

function warningForProviderResult(
  theme: CandidateTheme | undefined,
  result: ProviderResult<unknown>,
  source: string,
  ticker?: string,
) {
  if (result.ok) {
    return undefined;
  }

  return warning({
    code:
      result.status === "UNCONFIGURED"
        ? "CANDIDATE_PROVIDER_UNCONFIGURED"
        : "CANDIDATE_PROVIDER_CALL_FAILED",
    message: `${result.provider}:${result.endpoint} ${source} ${result.status}${
      result.sanitizedError ? ` - ${shortError(result.sanitizedError)}` : ""
    }`,
    severity: "WARNING",
    source,
    themeCode: theme?.sourceThemeCode ?? undefined,
    ticker,
  });
}

function providerSourceUrl(result: ProviderResult<unknown>) {
  return result.sanitizedRequestMetadata.url;
}

function themeSourceSummary(
  theme: CandidateTheme,
  sources: CandidateSourceInput[],
  persist: Awaited<ReturnType<typeof persistCandidateSources>>,
  skipped: CandidateWarning[],
): CandidateGenerationThemeSummary {
  return {
    candidatesCreated: persist.candidatesCreated,
    candidatesTouched: persist.candidatesTouched,
    candidatesUpdated: persist.candidatesUpdated,
    evidenceWritten: persist.evidenceWritten,
    fmpScreenerSources: sources.filter((source) =>
      source.sourceType.startsWith("FMP_SCREENER_"),
    ).length,
    manualSeedSources: sources.filter(
      (source) => source.sourceType === "MANUAL_SEED_FOR_API_VALIDATION",
    ).length,
    seedEtfSources: sources.filter(
      (source) => source.sourceType === "SEED_ETF_HOLDING",
    ).length,
    skippedSources: skipped.length,
    sourceThemeCode: theme.sourceThemeCode ?? theme.themeId,
    themeId: theme.themeId,
    themeName: theme.themeName,
  };
}

export async function generateThemeCandidates(
  prisma: CandidateDbClient,
  options: GenerateCandidatesOptions = {},
): Promise<CandidateGenerationSummary> {
  const includeFmp = options.includeFmp ?? true;
  const includeManualSeeds = options.includeManualSeeds ?? true;
  const companySeedPath = resolve(
    options.companySeedPath ?? DEFAULT_COMPANY_SEED_PATH,
  );
  const scope = options.themeRef ?? "all-active";
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "THEME_CANDIDATE_GENERATION",
      scopeId: scope,
      scopeType: "theme_candidate_generation",
      status: "STARTED",
    },
  });
  const lockKey = await acquireLock(prisma, jobRun.jobRunId, scope);
  const providerResults: ProviderResult<unknown>[] = [];
  const warnings: CandidateWarning[] = [];
  const themeSummaries: CandidateGenerationThemeSummary[] = [];
  let rowsRead = 0;
  let rowsWritten = 0;
  let evidenceWritten = 0;
  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  let candidatesTouched = 0;

  try {
    const themes = await loadThemesForGeneration(prisma, options.themeRef);
    const companySeedRows = await loadCompanySeeds(
      companySeedPath,
      includeManualSeeds,
    );
    rowsRead += includeManualSeeds ? companySeedRows.length : 0;

    let screenerResult:
      | Awaited<ReturnType<typeof fetchFmpCompanyScreener>>
      | undefined;

    if (includeFmp) {
      screenerResult = await fetchFmpCompanyScreener({
        jobRunId: jobRun.jobRunId,
        prisma,
      });
      providerResults.push(screenerResult);
      const providerWarning = warningForProviderResult(
        undefined,
        screenerResult,
        "company_screener",
      );

      if (providerWarning) {
        warnings.push(providerWarning);
      }
    }

    for (const theme of themes) {
      const themeSources: CandidateSourceInput[] = [];
      const themeWarnings: CandidateWarning[] = [];

      if (includeManualSeeds) {
        themeSources.push(...manualSeedSourcesForTheme(theme, companySeedRows));
      }

      if (includeFmp) {
        for (const seedEtf of seedEtfsFromTheme(theme)) {
          const holdingsResult = await fetchFmpEtfHoldings(
            {
              jobRunId: jobRun.jobRunId,
              prisma,
            },
            seedEtf.symbol,
          );
          providerResults.push(holdingsResult);
          const providerWarning = warningForProviderResult(
            theme,
            holdingsResult,
            `seed_etf_holding:${seedEtf.symbol}`,
            seedEtf.symbol,
          );

          if (providerWarning) {
            themeWarnings.push(providerWarning);
          }

          if (holdingsResult.ok && holdingsResult.data) {
            themeSources.push(
              ...etfHoldingSourcesForTheme(
                theme,
                seedEtf.symbol,
                holdingsResult.data,
                {
                  payloadId: holdingsResult.payloadId,
                  responseHash: holdingsResult.responseHash,
                  sourceUrlOrEndpoint: providerSourceUrl(holdingsResult),
                },
              ),
            );
          }
        }

        if (screenerResult?.ok && screenerResult.data) {
          themeSources.push(
            ...fmpScreenerSourcesForTheme(theme, screenerResult.data, {
              payloadId: screenerResult.payloadId,
              responseHash: screenerResult.responseHash,
              sourceUrlOrEndpoint: providerSourceUrl(screenerResult),
            }),
          );
        }
      }

      const resolved = await resolveCandidateSources(prisma, themeSources);
      themeWarnings.push(...resolved.warnings);
      warnings.push(...themeWarnings);

      const persisted = await persistCandidateSources(
        prisma,
        jobRun.jobRunId,
        resolved.records,
      );
      const warningItemsWritten = await writeWarningJobItems(
        prisma,
        jobRun.jobRunId,
        themeWarnings,
      );

      rowsWritten += persisted.candidatesTouched;
      evidenceWritten += persisted.evidenceWritten;
      candidatesCreated += persisted.candidatesCreated;
      candidatesUpdated += persisted.candidatesUpdated;
      candidatesTouched += persisted.candidatesTouched;
      themeSummaries.push(
        themeSourceSummary(theme, themeSources, persisted, themeWarnings),
      );
      rowsWritten += warningItemsWritten === 0 ? 0 : 0;
    }

    const summary: CandidateGenerationSummary = {
      candidatesCreated,
      candidatesTouched,
      candidatesUpdated,
      evidenceWritten,
      fmpConfigured: providerResults.some(
        (result) =>
          result.provider === "FMP" && result.status !== "UNCONFIGURED",
      ),
      jobRunId: jobRun.jobRunId,
      providerCalls: providerCalls(providerResults),
      rowsRead: rowsRead + rowsReadFromProviders(providerResults),
      rowsWritten,
      themes: themeSummaries,
      warnings,
    };

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length === 0
            ? undefined
            : `${warnings.length} candidate generation warning(s); see job_items.`,
        finishedAt: new Date(),
        providerCalls: summary.providerCalls,
        rowsRead: summary.rowsRead,
        rowsWritten: summary.rowsWritten,
        status: "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(message),
        finishedAt: new Date(),
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    throw error;
  } finally {
    await releaseLock(prisma, jobRun.jobRunId, lockKey);
  }
}
