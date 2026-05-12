import type { Prisma } from "@/generated/prisma/client";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
import {
  mergeFundamentalData,
  normalizeFmpFundamentals,
  normalizeSecCompanyFacts,
} from "@/lib/fundamentals/normalization";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import {
  T6_LIQUIDITY_SCORE_VERSION,
  T6_REASON_CODES,
  T6_SIGNAL_LAYER,
} from "@/lib/liquidity/constants";
import { scoreLiquidityDilutionFragility } from "@/lib/liquidity/scoring";
import type {
  LiquidityDbClient,
  LiquidityProviderBundle,
  LiquidityScoringOptions,
  LiquidityScoringSummary,
  LiquidityThemeSummary,
} from "@/lib/liquidity/types";
import { T4_HISTORY, T4_THRESHOLDS } from "@/lib/price/constants";
import { computePriceMetrics } from "@/lib/price/scoring";
import type { PriceBar } from "@/lib/price/types";
import {
  fetchFmpBalanceSheetStatement,
  fetchFmpCashFlowStatement,
  fetchFmpKeyMetrics,
  fetchFmpProfile,
  fetchMassiveDailyBars,
  fetchSecCompanySubmissions,
  fetchSecFundamentalCompanyFacts,
} from "@/lib/providers/clients";
import type { FmpCompanyMetric } from "@/lib/providers/parsers";
import type { ProviderResult } from "@/lib/providers/types";
import { isUuid } from "@/lib/util/uuid";

const LOCK_TTL_MS = 30 * 60 * 1_000;
const MASSIVE_REQUEST_SPACING_MS = 12_500;
const ACTIVE_THEME_STATUSES = [
  "ACTIVE_UNSCANNED",
  "ACTIVE_SCANNED",
  "ACTIVE",
] as const;
const SCORABLE_T1_STATES = [
  "MAJOR_BENEFICIARY",
  "DIRECT_BENEFICIARY",
  "PARTIAL_BENEFICIARY",
  "INDIRECT_BENEFICIARY",
] as const;

type CandidateForLiquidity = Awaited<
  ReturnType<typeof loadCandidatesForLiquidity>
>[number];

type PriceMetricBundle = {
  averageDollarVolume20d?: number;
  averageVolume20d?: number;
  metricDate?: string;
  priceDataStale?: boolean;
  providerResults: ProviderResult<unknown>[];
  rowsRead: number;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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

function dateFromIso(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function utcDateOnly(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function businessDaysBetween(start: Date, end = new Date()) {
  const current = utcDateOnly(start);
  const target = utcDateOnly(end);
  let days = 0;

  if (current >= target) {
    return 0;
  }

  current.setUTCDate(current.getUTCDate() + 1);

  while (current <= target) {
    const day = current.getUTCDay();

    if (day !== 0 && day !== 6) {
      days += 1;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

export function isPriceMetricStale(metricDate: Date, asOfDate = new Date()) {
  return (
    businessDaysBetween(metricDate, asOfDate) >
    T4_THRESHOLDS.priceBarsStaleAfterBusinessDays
  );
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function decimalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}

function isScorableT1State(state: string | undefined) {
  return SCORABLE_T1_STATES.some((eligibleState) => eligibleState === state);
}

function latestSignalState(
  candidate: {
    signalStates: Array<{
      signalLayer: string;
      state: string;
    }>;
  },
  signalLayer: typeof T1_SIGNAL_LAYER,
) {
  return candidate.signalStates.find(
    (state) => state.signalLayer === signalLayer,
  );
}

function warning(input: LiquidityScoringSummary["warnings"][number]) {
  return input;
}

function providerWarning(
  ticker: string,
  themeCode: string | undefined,
  result: ProviderResult<unknown>,
) {
  if (result.ok) {
    return undefined;
  }

  return warning({
    code:
      result.status === "UNCONFIGURED"
        ? T6_REASON_CODES.REQUIRED_DATA_MISSING
        : T6_REASON_CODES.PROVIDER_CALL_FAILED,
    message: `${result.provider}:${result.endpoint} ${ticker} ${result.status}${
      result.sanitizedError ? ` - ${shortError(result.sanitizedError)}` : ""
    }`,
    severity: "WARNING",
    themeCode,
    ticker,
  });
}

function warningCodeForVeto(flags: string[]) {
  if (flags.includes("SEVERE_DILUTION")) {
    return T6_REASON_CODES.DILUTION_SEVERE;
  }

  if (flags.includes("ILLIQUID")) {
    return T6_REASON_CODES.LIQUIDITY_ILLIQUID;
  }

  if (flags.includes("RECENT_MATERIAL_OFFERING")) {
    return T6_REASON_CODES.DILUTION_RECENT_OFFERING;
  }

  if (flags.includes("GOING_CONCERN_AND_WEAK_FUNDAMENTALS")) {
    return T6_REASON_CODES.FRAGILITY_GOING_CONCERN;
  }

  return T6_REASON_CODES.REQUIRED_DATA_MISSING;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function firstNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(row[key]);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function marketCapFromFmp(fmp: LiquidityProviderBundle["fmp"]) {
  const profileMarketCap = fmp?.profiles?.find(
    (profile) => profile.marketCap !== undefined,
  )?.marketCap;

  if (profileMarketCap !== undefined) {
    return profileMarketCap;
  }

  for (const row of fmp?.keyMetrics ?? []) {
    const marketCap = firstNumber(row, [
      "marketCap",
      "marketCapitalization",
      "marketCapTTM",
    ]);

    if (marketCap !== undefined) {
      return marketCap;
    }
  }

  return undefined;
}

async function loadCandidatesForLiquidity(
  prisma: LiquidityDbClient,
  options: LiquidityScoringOptions,
) {
  const candidates = await prisma.themeCandidate.findMany({
    include: {
      security: {
        include: {
          priceMetrics: {
            orderBy: {
              computedAt: "desc",
            },
            take: 1,
          },
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        where: {
          signalLayer: {
            in: [T1_SIGNAL_LAYER],
          },
        },
      },
      theme: {
        select: {
          sourceThemeCode: true,
          themeId: true,
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
      security: options.ticker
        ? {
            canonicalTicker: options.ticker.trim().toUpperCase(),
          }
        : undefined,
      signalStates: {
        some: {
          signalLayer: T1_SIGNAL_LAYER,
        },
      },
      theme: themeWhere(options.themeRef),
    },
  });

  const latestEligibleCandidates = candidates.filter((candidate) =>
    isScorableT1State(latestSignalState(candidate, T1_SIGNAL_LAYER)?.state),
  );

  if (latestEligibleCandidates.length === 0) {
    throw new Error(
      options.themeRef || options.ticker
        ? `No T1-eligible candidates found for ${options.themeRef ?? "all themes"} ${options.ticker ?? ""}.`.trim()
        : "No active-theme T1-eligible candidates found for liquidity scoring.",
    );
  }

  return latestEligibleCandidates;
}

async function acquireLock(
  prisma: LiquidityDbClient,
  jobRunId: string,
  scope: string,
) {
  const lockKey = `t6_liquidity:${scope}`;
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
        ownerId: "liquidity-scoring-cli",
      },
    });
  } catch {
    throw new Error(`T6 liquidity scoring is already running for ${scope}.`);
  }

  return lockKey;
}

async function releaseLock(
  prisma: LiquidityDbClient,
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

async function fetchProviderBundle(
  prisma: LiquidityDbClient,
  candidate: CandidateForLiquidity,
  jobRunId: string,
  options: LiquidityScoringOptions,
) {
  const ticker = candidate.security.canonicalTicker.toUpperCase();
  const fixture = options.providerDataByTicker?.[ticker];
  const providerResults: ProviderResult<unknown>[] = [];
  const warnings: LiquidityScoringSummary["warnings"] = [];
  let sec = fixture?.sec;
  let fmp = fixture?.fmp;

  if (options.includeSec !== false && !sec) {
    if (candidate.security.cik) {
      const [facts, submissions] = await Promise.all([
        fetchSecFundamentalCompanyFacts(
          {
            jobRunId,
            prisma,
          },
          candidate.security.cik,
        ),
        fetchSecCompanySubmissions(
          {
            jobRunId,
            prisma,
          },
          candidate.security.cik,
        ),
      ]);
      providerResults.push(facts, submissions);

      for (const result of [facts, submissions]) {
        const secWarning = providerWarning(
          ticker,
          candidate.theme.sourceThemeCode ?? undefined,
          result,
        );

        if (secWarning) {
          warnings.push(secWarning);
        }
      }

      sec = {
        companyFacts: facts.ok ? facts.data : undefined,
        submissions: submissions.ok ? submissions.data : undefined,
      };
    } else {
      warnings.push(
        warning({
          code: T6_REASON_CODES.REQUIRED_DATA_MISSING,
          message: `${ticker} has no CIK; SEC filings cannot be checked for T6 fragility signals.`,
          severity: "WARNING",
          themeCode: candidate.theme.sourceThemeCode ?? undefined,
          ticker,
        }),
      );
    }
  }

  if (options.includeFmp !== false && !fmp) {
    const [profiles, keyMetrics, balanceSheet, cashFlow] = await Promise.all([
      fetchFmpProfile(
        {
          jobRunId,
          prisma,
        },
        ticker,
      ),
      fetchFmpKeyMetrics(
        {
          jobRunId,
          prisma,
        },
        ticker,
      ),
      fetchFmpBalanceSheetStatement(
        {
          jobRunId,
          prisma,
        },
        ticker,
      ),
      fetchFmpCashFlowStatement(
        {
          jobRunId,
          prisma,
        },
        ticker,
      ),
    ]);
    providerResults.push(profiles, keyMetrics, balanceSheet, cashFlow);

    for (const result of [profiles, keyMetrics, balanceSheet, cashFlow]) {
      const fmpWarning = providerWarning(
        ticker,
        candidate.theme.sourceThemeCode ?? undefined,
        result,
      );

      if (fmpWarning) {
        warnings.push(fmpWarning);
      }
    }

    fmp = {
      balanceSheetStatements: balanceSheet.ok ? balanceSheet.data : undefined,
      cashFlowStatements: cashFlow.ok ? cashFlow.data : undefined,
      keyMetrics: keyMetrics.ok ? keyMetrics.data : undefined,
      profiles: profiles.ok ? profiles.data : undefined,
    };
  }

  return {
    bundle: {
      fmp,
      massive: fixture?.massive,
      sec,
    } satisfies LiquidityProviderBundle,
    providerResults,
    warnings,
  };
}

async function priceMetricForCandidate(
  prisma: LiquidityDbClient,
  candidate: CandidateForLiquidity,
  jobRunId: string,
  options: LiquidityScoringOptions,
): Promise<PriceMetricBundle> {
  const ticker = candidate.security.canonicalTicker.toUpperCase();
  const fixtureBars = options.providerDataByTicker?.[ticker]?.massive?.bars;
  const storedMetric = candidate.security.priceMetrics[0];

  if (!fixtureBars && storedMetric) {
    const priceDataStale = isPriceMetricStale(storedMetric.metricDate);

    if (!priceDataStale || options.includeMassive === false) {
      return {
        averageDollarVolume20d: decimalNumber(
          storedMetric.averageDollarVolume20d,
        ),
        averageVolume20d: decimalNumber(storedMetric.averageVolume20d),
        metricDate: storedMetric.metricDate.toISOString().slice(0, 10),
        priceDataStale,
        providerResults: [],
        rowsRead: 1,
      };
    }
  }

  const bars = fixtureBars;

  if (bars) {
    const metrics = computePriceMetrics(bars as PriceBar[]);

    return {
      averageDollarVolume20d: metrics.averageDollarVolume20d,
      averageVolume20d: metrics.averageVolume20d,
      metricDate: metrics.date,
      priceDataStale: metrics.isStale,
      providerResults: [],
      rowsRead: bars.length,
    };
  }

  if (options.includeMassive === false) {
    return {
      providerResults: [],
      rowsRead: 0,
    };
  }

  const result = await fetchMassiveDailyBars(
    {
      jobRunId,
      prisma,
    },
    ticker,
    daysAgoIso(T4_HISTORY.preferredInitialCalendarDays),
    todayIso(),
  );

  if (!result.ok) {
    return {
      providerResults: [result],
      rowsRead: 0,
    };
  }

  const data = result.data ?? [];
  const metrics = computePriceMetrics(data);

  return {
    averageDollarVolume20d: metrics.averageDollarVolume20d,
    averageVolume20d: metrics.averageVolume20d,
    metricDate: metrics.date,
    priceDataStale: metrics.isStale,
    providerResults: [result],
    rowsRead: 0,
  };
}

function financialPeriods(bundle: LiquidityProviderBundle) {
  const secData = normalizeSecCompanyFacts(bundle.sec?.companyFacts);
  const fmpData = normalizeFmpFundamentals({
    balanceSheetStatements: bundle.fmp?.balanceSheetStatements,
    cashFlowStatements: bundle.fmp?.cashFlowStatements,
    keyMetrics: bundle.fmp?.keyMetrics as FmpCompanyMetric[] | undefined,
  });
  const financials = mergeFundamentalData(secData, fmpData);

  return [...financials.quarterlyPeriods, ...financials.annualPeriods];
}

async function writeEvidenceRows(
  prisma: LiquidityDbClient,
  candidate: CandidateForLiquidity,
  jobRunId: string,
  score: ReturnType<typeof scoreLiquidityDilutionFragility>,
) {
  const now = new Date();
  const evidenceIds: string[] = [];
  const detailEvidence = await insertEvidence(prisma, {
    endpoint: "t6_liquidity_dilution_fragility",
    entityId: candidate.themeCandidateId,
    entityType: "theme_candidate",
    evidenceGrade: "B",
    fetchedAt: now,
    jobRunId,
    metricName: "t6.liquidity_fragility_score_detail",
    metricValueNum: score.score,
    metricValueText: JSON.stringify(score.scoreDetail),
    provider: "ALPHATREND_INTERNAL",
    reasonCode:
      score.scoreDetail.reason_codes[0] ??
      T6_REASON_CODES.REQUIRED_DATA_MISSING,
    scoreImpact: score.score === 0 ? undefined : score.score,
    securityId: candidate.securityId,
    sourcePayloadHash: hashPayload({
      candidate: candidate.themeCandidateId,
      scoreDetail: score.scoreDetail,
    }),
    sourceUrlOrEndpoint: "alphatrend://t6_liquidity_dilution_fragility",
    themeId: candidate.themeId,
  });

  evidenceIds.push(detailEvidence.evidenceId);

  for (const detail of score.evidenceDetails) {
    const evidence = await insertEvidence(prisma, {
      asOfDate: dateFromIso(detail.periodEnd),
      endpoint: "t6_liquidity_dilution_fragility",
      entityId: candidate.themeCandidateId,
      entityType: "theme_candidate",
      evidenceGrade: "B",
      fetchedAt: now,
      jobRunId,
      metricName: detail.metricName,
      metricUnit: detail.metricUnit,
      metricValueNum: detail.metricValueNum,
      metricValueText: detail.metricValueText,
      provider: "ALPHATREND_INTERNAL",
      reasonCode: detail.reasonCode,
      scoreImpact: detail.scoreImpact === 0 ? undefined : detail.scoreImpact,
      securityId: candidate.securityId,
      sourcePayloadHash: hashPayload({
        candidate: candidate.themeCandidateId,
        detail,
        scoreVersion: T6_LIQUIDITY_SCORE_VERSION,
      }),
      sourceUrlOrEndpoint: "alphatrend://t6_liquidity_dilution_fragility",
      themeId: candidate.themeId,
    });

    evidenceIds.push(evidence.evidenceId);
  }

  return evidenceIds;
}

async function persistLiquidityScore(
  prisma: LiquidityDbClient,
  candidate: CandidateForLiquidity,
  jobRunId: string,
  score: ReturnType<typeof scoreLiquidityDilutionFragility>,
) {
  const now = new Date();
  const evidenceIds = await writeEvidenceRows(
    prisma,
    candidate,
    jobRunId,
    score,
  );
  const reasonCodes = toJsonValue(score.scoreDetail.reason_codes);

  await prisma.candidateSignalScore.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      maxScore: 100,
      reasonCodes,
      score: score.score,
      scoreVersion: T6_LIQUIDITY_SCORE_VERSION,
      signalLayer: T6_SIGNAL_LAYER,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.candidateSignalState.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      reasonCodes,
      signalLayer: T6_SIGNAL_LAYER,
      state: score.liquidityState,
      stateVersion: T6_LIQUIDITY_SCORE_VERSION,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.themeCandidate.update({
    data: {
      lastScannedAt: now,
    },
    where: {
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.jobItem.create({
    data: {
      finishedAt: now,
      itemId: `${candidate.theme.sourceThemeCode ?? candidate.themeId}:${candidate.security.canonicalTicker}`,
      itemType: "T6_LIQUIDITY_SCORE",
      jobRunId,
      startedAt: now,
      status: "SUCCEEDED",
    },
  });

  return evidenceIds.length + 4;
}

function emptyThemeSummary(
  candidate: CandidateForLiquidity,
): LiquidityThemeSummary {
  return {
    candidatesScored: 0,
    coreEligible: 0,
    expandedEligible: 0,
    highDilution: 0,
    illiquid: 0,
    insufficientData: 0,
    lowDilution: 0,
    moderateDilution: 0,
    severeDilution: 0,
    sourceThemeCode: candidate.theme.sourceThemeCode ?? candidate.theme.themeId,
    speculativeOnly: 0,
    themeId: candidate.theme.themeId,
    themeName: candidate.theme.themeName,
  };
}

function updateThemeSummary(
  summary: LiquidityThemeSummary,
  score: ReturnType<typeof scoreLiquidityDilutionFragility>,
) {
  summary.candidatesScored += 1;

  if (score.liquidityState === "CORE_ELIGIBLE") {
    summary.coreEligible += 1;
  } else if (score.liquidityState === "EXPANDED_ELIGIBLE") {
    summary.expandedEligible += 1;
  } else if (score.liquidityState === "SPECULATIVE_ONLY") {
    summary.speculativeOnly += 1;
  } else if (score.liquidityState === "ILLIQUID") {
    summary.illiquid += 1;
  } else {
    summary.insufficientData += 1;
  }

  if (score.dilutionRiskState === "LOW") {
    summary.lowDilution += 1;
  } else if (score.dilutionRiskState === "MODERATE") {
    summary.moderateDilution += 1;
  } else if (score.dilutionRiskState === "HIGH") {
    summary.highDilution += 1;
  } else if (score.dilutionRiskState === "SEVERE") {
    summary.severeDilution += 1;
  } else {
    summary.insufficientData += 1;
  }
}

export async function scoreThemeLiquidity(
  prisma: LiquidityDbClient,
  options: LiquidityScoringOptions = {},
): Promise<LiquidityScoringSummary> {
  const scope = [
    options.themeRef ?? "all-active",
    options.ticker ? options.ticker.trim().toUpperCase() : undefined,
  ]
    .filter(Boolean)
    .join(":");
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "THEME_SCAN",
      scopeId: scope,
      scopeType: "t6_liquidity",
      status: "STARTED",
    },
  });
  const lockKey = await acquireLock(prisma, jobRun.jobRunId, scope);
  const providerResults: ProviderResult<unknown>[] = [];
  const warnings: LiquidityScoringSummary["warnings"] = [];
  const themeSummaries = new Map<string, LiquidityThemeSummary>();
  let nextMassiveRequestAt = 0;
  let evidenceWritten = 0;
  let rowsRead = 0;
  let rowsWritten = 0;

  try {
    const candidates = await loadCandidatesForLiquidity(prisma, options);

    for (const candidate of candidates) {
      const ticker = candidate.security.canonicalTicker.toUpperCase();
      const hasPriceFixture = Boolean(
        options.providerDataByTicker?.[ticker]?.massive?.bars,
      );

      if (
        options.includeMassive !== false &&
        !hasPriceFixture &&
        !candidate.security.priceMetrics[0]
      ) {
        const waitMs = nextMassiveRequestAt - Date.now();

        if (waitMs > 0) {
          await sleep(waitMs);
        }

        nextMassiveRequestAt = Date.now() + MASSIVE_REQUEST_SPACING_MS;
      }

      const [provider, priceMetric] = await Promise.all([
        fetchProviderBundle(prisma, candidate, jobRun.jobRunId, options),
        priceMetricForCandidate(prisma, candidate, jobRun.jobRunId, options),
      ]);

      providerResults.push(...provider.providerResults);
      providerResults.push(...priceMetric.providerResults);
      warnings.push(...provider.warnings);
      rowsRead += priceMetric.rowsRead;

      for (const result of priceMetric.providerResults) {
        const priceWarning = providerWarning(
          ticker,
          candidate.theme.sourceThemeCode ?? undefined,
          result,
        );

        if (priceWarning) {
          warnings.push(priceWarning);
        }
      }

      const score = scoreLiquidityDilutionFragility({
        averageDollarVolume20d: priceMetric.averageDollarVolume20d,
        averageVolume20d: priceMetric.averageVolume20d,
        financialPeriods: financialPeriods(provider.bundle),
        marketCap: marketCapFromFmp(provider.bundle.fmp),
        metricDate: priceMetric.metricDate,
        priceDataStale: priceMetric.priceDataStale,
        secFilingCoverageAvailable: Array.isArray(
          provider.bundle.sec?.submissions,
        ),
        submissions: provider.bundle.sec?.submissions,
      });

      const scoreRowsWritten = await persistLiquidityScore(
        prisma,
        candidate,
        jobRun.jobRunId,
        score,
      );
      evidenceWritten += scoreRowsWritten - 4;
      rowsWritten += scoreRowsWritten;

      if (score.scoreDetail.veto_flags.length > 0) {
        warnings.push(
          warning({
            code: warningCodeForVeto(score.scoreDetail.veto_flags),
            message: `${ticker} has T6 veto flag(s): ${score.scoreDetail.veto_flags.join(", ")}`,
            severity: "WARNING",
            themeCode: candidate.theme.sourceThemeCode ?? undefined,
            ticker,
          }),
        );
      }

      const summary =
        themeSummaries.get(candidate.theme.themeId) ??
        emptyThemeSummary(candidate);

      updateThemeSummary(summary, score);
      themeSummaries.set(candidate.theme.themeId, summary);
    }

    const summary: LiquidityScoringSummary = {
      candidatesScored: candidates.length,
      evidenceWritten,
      fmpConfigured: providerResults.some(
        (result) =>
          result.provider === "FMP" && result.status !== "UNCONFIGURED",
      ),
      jobRunId: jobRun.jobRunId,
      massiveConfigured: providerResults.some(
        (result) =>
          result.provider === "MASSIVE" && result.status !== "UNCONFIGURED",
      ),
      providerCalls: providerCalls(providerResults),
      rowsRead:
        candidates.length + rowsRead + rowsReadFromProviders(providerResults),
      rowsWritten,
      secConfigured: providerResults.some(
        (result) =>
          result.provider === "SEC" && result.status !== "UNCONFIGURED",
      ),
      themes: [...themeSummaries.values()],
      warnings,
    };

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length === 0
            ? undefined
            : `${warnings.length} liquidity scoring warning(s); see command output.`,
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
