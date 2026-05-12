import type { Prisma } from "@/generated/prisma/client";
import { T1_SIGNAL_LAYER } from "@/lib/exposure/constants";
import { T3_SIGNAL_LAYER } from "@/lib/fundamentals/constants";
import { hashPayload } from "@/lib/evidence/hash";
import { insertEvidence } from "@/lib/evidence/ledger";
import {
  T4_HISTORY,
  T4_PRICE_ALGORITHM_VERSION,
  T4_PRICE_SCORE_VERSION,
  T4_REASON_CODES,
  T4_SIGNAL_LAYER,
} from "@/lib/price/constants";
import {
  computePriceMetrics,
  scorePriceParticipation,
} from "@/lib/price/scoring";
import type {
  PriceBar,
  PriceDbClient,
  PriceScoringOptions,
  PriceScoringSummary,
  PriceThemeSummary,
} from "@/lib/price/types";
import {
  fetchFmpKeyMetrics,
  fetchFmpRatios,
  fetchMassiveDailyBars,
} from "@/lib/providers/clients";
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
const THEME_BASKET_T1_STATES = [
  "MAJOR_BENEFICIARY",
  "DIRECT_BENEFICIARY",
] as const;
const THEME_BASKET_EXCLUDED_CANDIDATE_STATUSES = [
  "REJECTED",
  "NO_TRADE",
  "INACTIVE",
] as const;
const THEME_BASKET_EXCLUDED_FINAL_STATES = [
  "WRONG_TICKER",
  "NO_TRADE",
  "REJECTED",
  "INVALIDATED",
] as const;

type CandidateForPrice = Awaited<
  ReturnType<typeof loadCandidatesForPrice>
>[number];

type BarsBundle = {
  bars: PriceBar[];
  barsWritten: number;
  providerResults: ProviderResult<unknown>[];
  rowsRead: number;
  source: "fixture" | "provider" | "stored" | "missing";
  warning?: PriceScoringSummary["warnings"][number];
};

type ThemeBenchmark = {
  bars: PriceBar[];
  memberCount: number;
  method: "equal_weight_candidates" | "seed_etf_proxy" | "insufficient_data";
  proxyTicker?: string;
  rowsWritten: number;
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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function rowsReadFromProviders(results: ProviderResult<unknown>[]) {
  return results.reduce((sum, result) => sum + (result.rowCount ?? 0), 0);
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

function isScorableT1State(state: string | undefined) {
  return SCORABLE_T1_STATES.some((eligibleState) => eligibleState === state);
}

function isThemeBasketT1State(state: string | undefined) {
  return THEME_BASKET_T1_STATES.some(
    (eligibleState) => eligibleState === state,
  );
}

function latestSignalState(
  candidate: CandidateForPrice,
  signalLayer: typeof T1_SIGNAL_LAYER | typeof T3_SIGNAL_LAYER,
) {
  return candidate.signalStates.find(
    (state) => state.signalLayer === signalLayer,
  );
}

function latestSignalScore(
  candidate: CandidateForPrice,
  signalLayer: typeof T1_SIGNAL_LAYER | typeof T3_SIGNAL_LAYER,
) {
  return candidate.signalScores.find(
    (score) => score.signalLayer === signalLayer,
  );
}

function isThemeBasketCandidate(candidate: CandidateForPrice) {
  const latestT1 = latestSignalState(candidate, T1_SIGNAL_LAYER);
  const candidateStatus = String(candidate.candidateStatus);
  const finalState =
    candidate.finalState === null || candidate.finalState === undefined
      ? undefined
      : String(candidate.finalState);

  return (
    isThemeBasketT1State(latestT1?.state) &&
    !THEME_BASKET_EXCLUDED_CANDIDATE_STATUSES.includes(
      candidateStatus as (typeof THEME_BASKET_EXCLUDED_CANDIDATE_STATUSES)[number],
    ) &&
    !(
      finalState &&
      THEME_BASKET_EXCLUDED_FINAL_STATES.includes(
        finalState as (typeof THEME_BASKET_EXCLUDED_FINAL_STATES)[number],
      )
    )
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

function dateFromIso(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}

function safeTransactionCount(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return value > 2_147_483_647 ? undefined : Math.round(value);
}

function seedEtfTickers(seedEtfs: unknown) {
  if (!Array.isArray(seedEtfs)) {
    return [];
  }

  return seedEtfs.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry.toUpperCase()];
    }

    if (entry && typeof entry === "object" && "symbol" in entry) {
      return [String(entry.symbol).toUpperCase()];
    }

    return [];
  });
}

function warning(input: PriceScoringSummary["warnings"][number]) {
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
        ? "DATA_MISSING"
        : "PROVIDER_ENDPOINT_UNAVAILABLE",
    message: `${result.provider}:${result.endpoint} ${ticker} ${result.status}${
      result.sanitizedError ? ` - ${shortError(result.sanitizedError)}` : ""
    }`,
    severity: "WARNING",
    themeCode,
    ticker,
  });
}

async function loadCandidatesForPrice(
  prisma: PriceDbClient,
  options: PriceScoringOptions,
) {
  const candidates = await prisma.themeCandidate.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          securityId: true,
        },
      },
      signalScores: {
        orderBy: {
          computedAt: "desc",
        },
        take: 10,
        where: {
          signalLayer: {
            in: [T1_SIGNAL_LAYER, T3_SIGNAL_LAYER],
          },
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        take: 10,
        where: {
          signalLayer: {
            in: [T1_SIGNAL_LAYER, T3_SIGNAL_LAYER],
          },
        },
      },
      theme: {
        select: {
          seedEtfs: true,
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

  const latestEligibleCandidates = candidates.filter((candidate) => {
    const latestT1 = candidate.signalStates.find(
      (state) => state.signalLayer === T1_SIGNAL_LAYER,
    );

    return isScorableT1State(latestT1?.state);
  });

  if (latestEligibleCandidates.length === 0) {
    throw new Error(
      options.themeRef || options.ticker
        ? `No T1-scored candidates found for ${options.themeRef ?? "all themes"} ${options.ticker ?? ""}.`.trim()
        : "No active-theme T1-scored candidates found for price scoring.",
    );
  }

  return latestEligibleCandidates;
}

async function loadThemeBenchmarkCandidates(
  prisma: PriceDbClient,
  themeIds: string[],
) {
  if (themeIds.length === 0) {
    return [];
  }

  const candidates = await prisma.themeCandidate.findMany({
    include: {
      security: {
        select: {
          canonicalTicker: true,
          companyName: true,
          securityId: true,
        },
      },
      signalScores: {
        orderBy: {
          computedAt: "desc",
        },
        take: 10,
        where: {
          signalLayer: {
            in: [T1_SIGNAL_LAYER, T3_SIGNAL_LAYER],
          },
        },
      },
      signalStates: {
        orderBy: {
          computedAt: "desc",
        },
        take: 10,
        where: {
          signalLayer: {
            in: [T1_SIGNAL_LAYER, T3_SIGNAL_LAYER],
          },
        },
      },
      theme: {
        select: {
          seedEtfs: true,
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
      signalStates: {
        some: {
          signalLayer: T1_SIGNAL_LAYER,
        },
      },
      themeId: {
        in: themeIds,
      },
    },
  });

  return candidates.filter(isThemeBasketCandidate);
}

async function acquireLock(
  prisma: PriceDbClient,
  jobRunId: string,
  scope: string,
) {
  const lockKey = `t4_price:${scope}`;
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
        ownerId: "price-scoring-cli",
      },
    });
  } catch {
    throw new Error(`T4 price scoring is already running for ${scope}.`);
  }

  return lockKey;
}

async function releaseLock(
  prisma: PriceDbClient,
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

async function securityForTicker(prisma: PriceDbClient, ticker: string) {
  return prisma.security.findFirst({
    select: {
      securityId: true,
    },
    where: {
      canonicalTicker: ticker.toUpperCase(),
      isActive: true,
    },
  });
}

async function persistBars(
  prisma: PriceDbClient,
  input: {
    bars: PriceBar[];
    fetchedAt?: string;
    payloadId?: string;
    responseHash?: string;
    securityId: string;
    ticker: string;
  },
) {
  if (input.bars.length === 0) {
    return 0;
  }

  const result = await prisma.priceBarDaily.createMany({
    data: input.bars.map((bar) => ({
      adjusted: true,
      barDate: dateFromIso(bar.date),
      close: bar.close,
      fetchedAt: input.fetchedAt ? new Date(input.fetchedAt) : new Date(),
      high: bar.high,
      low: bar.low,
      open: bar.open,
      payloadId: input.payloadId,
      provider: "MASSIVE",
      securityId: input.securityId,
      sourcePayloadHash: input.responseHash ?? hashPayload(input.bars),
      ticker: input.ticker.toUpperCase(),
      transactions: safeTransactionCount(bar.transactions),
      volume: bar.volume,
      vwap: bar.vwap,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

async function loadStoredBars(
  prisma: PriceDbClient,
  securityId: string,
  fromIso: string,
) {
  const rows = await prisma.priceBarDaily.findMany({
    orderBy: {
      barDate: "asc",
    },
    where: {
      adjusted: true,
      barDate: {
        gte: dateFromIso(fromIso),
      },
      provider: "MASSIVE",
      securityId,
    },
  });

  return rows.map((row) => ({
    close: Number(row.close),
    date: row.barDate.toISOString().slice(0, 10),
    high: Number(row.high),
    low: Number(row.low),
    open: Number(row.open),
    transactions: row.transactions ?? undefined,
    volume: Number(row.volume),
    vwap: decimalNumber(row.vwap),
  }));
}

async function barsForTicker(
  prisma: PriceDbClient,
  input: {
    fromIso: string;
    includeMassive?: boolean;
    jobRunId: string;
    options: PriceScoringOptions;
    securityId?: string;
    themeCode?: string;
    ticker: string;
    toIso: string;
  },
): Promise<BarsBundle> {
  const ticker = input.ticker.toUpperCase();
  const fixture = input.options.providerDataByTicker?.[ticker]?.bars;

  if (fixture) {
    const security =
      input.securityId === undefined
        ? await securityForTicker(prisma, ticker)
        : { securityId: input.securityId };
    const barsWritten = security
      ? await persistBars(prisma, {
          bars: fixture,
          responseHash: hashPayload(fixture),
          securityId: security.securityId,
          ticker,
        })
      : 0;

    return {
      bars: fixture,
      barsWritten,
      providerResults: [],
      rowsRead: fixture.length,
      source: "fixture",
    };
  }

  const providerResults: ProviderResult<unknown>[] = [];
  let barsWritten = 0;
  let storedBars: PriceBar[] | undefined;

  if (input.securityId) {
    storedBars = await loadStoredBars(prisma, input.securityId, input.fromIso);

    if (storedBars.length >= T4_HISTORY.minimumBarsForState) {
      const storedMetrics = computePriceMetrics(storedBars);

      if (!storedMetrics.isStale) {
        return {
          bars: storedBars,
          barsWritten,
          providerResults,
          rowsRead: storedBars.length,
          source: "stored",
        };
      }
    }
  }

  if (input.includeMassive !== false) {
    const result = await fetchMassiveDailyBars(
      {
        jobRunId: input.jobRunId,
        prisma,
      },
      ticker,
      input.fromIso,
      input.toIso,
    );
    providerResults.push(result);

    if (result.ok && result.data) {
      if (input.securityId) {
        barsWritten = await persistBars(prisma, {
          bars: result.data,
          fetchedAt: result.fetchedAt,
          payloadId: result.payloadId,
          responseHash: result.responseHash,
          securityId: input.securityId,
          ticker,
        });
      }

      return {
        bars: result.data,
        barsWritten,
        providerResults,
        rowsRead: result.rowCount ?? result.data.length,
        source: "provider",
      };
    }
  }

  if (input.securityId) {
    const stored =
      storedBars ??
      (await loadStoredBars(prisma, input.securityId, input.fromIso));

    if (stored.length > 0) {
      return {
        bars: stored,
        barsWritten,
        providerResults,
        rowsRead: stored.length,
        source: "stored",
        warning:
          providerResults.length > 0
            ? providerWarning(ticker, input.themeCode, providerResults[0])
            : undefined,
      };
    }
  }

  return {
    bars: [],
    barsWritten,
    providerResults,
    rowsRead: 0,
    source: "missing",
    warning:
      providerResults.length > 0
        ? providerWarning(ticker, input.themeCode, providerResults[0])
        : warning({
            code: T4_REASON_CODES.INSUFFICIENT_HISTORY,
            message: `${ticker} has no stored or fixture price bars.`,
            severity: "WARNING",
            themeCode: input.themeCode,
            ticker,
          }),
  };
}

function tState(
  candidate: CandidateForPrice,
  signalLayer: typeof T1_SIGNAL_LAYER | typeof T3_SIGNAL_LAYER,
) {
  return latestSignalState(candidate, signalLayer);
}

function tScore(
  candidate: CandidateForPrice,
  signalLayer: typeof T1_SIGNAL_LAYER | typeof T3_SIGNAL_LAYER,
) {
  return latestSignalScore(candidate, signalLayer);
}

function groupByTheme(candidates: CandidateForPrice[]) {
  const themes = new Map<string, CandidateForPrice[]>();

  for (const candidate of candidates) {
    themes.set(candidate.themeId, [
      ...(themes.get(candidate.themeId) ?? []),
      candidate,
    ]);
  }

  return themes;
}

function sortedPriceBars(bars: PriceBar[]) {
  return [...bars].sort((a, b) => a.date.localeCompare(b.date));
}

function buildEqualWeightBasketBars(series: PriceBar[][]): PriceBar[] {
  const sortedSeries = series
    .map(sortedPriceBars)
    .filter((bars) => bars.length >= T4_HISTORY.minimumBarsForState);
  const dateReturns = new Map<string, number[]>();

  for (const bars of sortedSeries) {
    for (let index = 1; index < bars.length; index += 1) {
      const previous = bars[index - 1];
      const current = bars[index];

      if (previous.close > 0) {
        dateReturns.set(current.date, [
          ...(dateReturns.get(current.date) ?? []),
          current.close / previous.close - 1,
        ]);
      }
    }
  }

  const basket: PriceBar[] = [];
  let close = 100;

  for (const [date, returns] of [...dateReturns.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (returns.length < 3) {
      continue;
    }

    const averageReturn =
      returns.reduce((sum, value) => sum + value, 0) / returns.length;
    close *= 1 + averageReturn;
    basket.push({
      close,
      date,
      high: close,
      low: close,
      open: close,
      volume: 0,
    });
  }

  return basket;
}

async function persistThemeBasket(
  prisma: PriceDbClient,
  themeId: string,
  benchmark: ThemeBenchmark,
) {
  const metrics = computePriceMetrics(benchmark.bars);

  if (benchmark.bars.length === 0 || !metrics.date) {
    return 0;
  }

  await prisma.themeBasketPrice.deleteMany({
    where: {
      algorithmVersion: T4_PRICE_ALGORITHM_VERSION,
      basketDate: dateFromIso(metrics.date),
      themeId,
    },
  });
  await prisma.themeBasketPrice.create({
    data: {
      algorithmVersion: T4_PRICE_ALGORITHM_VERSION,
      basketDate: dateFromIso(metrics.date),
      benchmarkTicker: benchmark.proxyTicker,
      memberCount: benchmark.memberCount,
      method: benchmark.method,
      return1m: metrics.return1m,
      return3m: metrics.return3m,
      themeId,
    },
  });

  return 1;
}

async function writeEvidenceRows(
  prisma: PriceDbClient,
  candidate: CandidateForPrice,
  jobRunId: string,
  score: ReturnType<typeof scorePriceParticipation>,
) {
  const now = new Date();
  const evidenceIds: string[] = [];
  const detailEvidence = await insertEvidence(prisma, {
    endpoint: "t4_price_valuation_participation",
    entityId: candidate.themeCandidateId,
    entityType: "theme_candidate",
    evidenceGrade: "B",
    fetchedAt: now,
    jobRunId,
    metricName: "t4.price_score_detail",
    metricValueNum: score.score,
    metricValueText: JSON.stringify(score.scoreDetail),
    provider: "ALPHATREND_INTERNAL",
    reasonCode:
      score.scoreDetail.reason_codes[0] ?? T4_REASON_CODES.INSUFFICIENT_HISTORY,
    scoreImpact: score.score,
    securityId: candidate.securityId,
    sourcePayloadHash: hashPayload({
      candidate: candidate.themeCandidateId,
      scoreDetail: score.scoreDetail,
    }),
    sourceUrlOrEndpoint: "alphatrend://t4_price_valuation_participation",
    themeId: candidate.themeId,
  });

  evidenceIds.push(detailEvidence.evidenceId);

  for (const detail of score.evidenceDetails) {
    const evidence = await insertEvidence(prisma, {
      asOfDate: dateFromIso(score.scoreDetail.metrics.date),
      endpoint: "t4_price_valuation_participation",
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
      scoreImpact: detail.scoreImpact,
      securityId: candidate.securityId,
      sourcePayloadHash: hashPayload({
        candidate: candidate.themeCandidateId,
        detail,
        scoreVersion: T4_PRICE_SCORE_VERSION,
      }),
      sourceUrlOrEndpoint: "alphatrend://t4_price_valuation_participation",
      themeId: candidate.themeId,
    });

    evidenceIds.push(evidence.evidenceId);
  }

  return evidenceIds;
}

async function persistPriceMetric(
  prisma: PriceDbClient,
  candidate: CandidateForPrice,
  score: ReturnType<typeof scorePriceParticipation>,
) {
  const metricDate = dateFromIso(score.scoreDetail.metrics.date);
  const metrics = score.scoreDetail.metrics;

  await prisma.priceMetricDaily.deleteMany({
    where: {
      algorithmVersion: T4_PRICE_ALGORITHM_VERSION,
      metricDate,
      securityId: candidate.securityId,
    },
  });
  await prisma.priceMetricDaily.create({
    data: {
      algorithmVersion: T4_PRICE_ALGORITHM_VERSION,
      atr14: metrics.atr14,
      averageDollarVolume20d: metrics.averageDollarVolume20d,
      averageVolume20d: metrics.averageVolume20d,
      computedAt: new Date(),
      distanceFrom20dAtr: metrics.distanceFrom20dAtr,
      distanceFrom50dAtr: metrics.distanceFrom50dAtr,
      drawdownFrom52wHigh: metrics.drawdownFrom52wHigh,
      high52w: metrics.high52w,
      latestClose: metrics.close,
      low52w: metrics.low52w,
      ma20: metrics.ma20,
      ma20Slope: metrics.ma20Slope,
      ma50: metrics.ma50,
      ma50Slope: metrics.ma50Slope,
      ma200: metrics.ma200,
      ma200Slope: metrics.ma200Slope,
      metricDate,
      return1m: metrics.return1m,
      return3m: metrics.return3m,
      return6m: metrics.return6m,
      securityId: candidate.securityId,
      upVolumeRatio20d: metrics.upVolumeRatio20d,
      volumeZscore20d: metrics.volumeZscore20d,
    },
  });

  return 1;
}

async function persistPriceScore(
  prisma: PriceDbClient,
  candidate: CandidateForPrice,
  jobRunId: string,
  score: ReturnType<typeof scorePriceParticipation>,
) {
  const now = new Date();
  const evidenceIds = await writeEvidenceRows(
    prisma,
    candidate,
    jobRunId,
    score,
  );
  await persistPriceMetric(prisma, candidate, score);
  const reasonCodes = toJsonValue(score.scoreDetail.reason_codes);

  await prisma.candidateSignalScore.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      maxScore: 100,
      reasonCodes,
      score: score.score,
      scoreVersion: T4_PRICE_SCORE_VERSION,
      signalLayer: T4_SIGNAL_LAYER,
      themeCandidateId: candidate.themeCandidateId,
    },
  });

  await prisma.candidateSignalState.create({
    data: {
      computedAt: now,
      evidenceIds: toJsonValue(evidenceIds),
      jobRunId,
      reasonCodes,
      signalLayer: T4_SIGNAL_LAYER,
      state: score.state,
      stateVersion: T4_PRICE_SCORE_VERSION,
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
      itemType: "T4_PRICE_SCORE",
      jobRunId,
      startedAt: now,
      status: "SUCCEEDED",
    },
  });

  return evidenceIds.length + 4;
}

function emptyThemeSummary(candidate: CandidateForPrice): PriceThemeSummary {
  return {
    broken: 0,
    candidatesScored: 0,
    delayedCatchUp: 0,
    improving: 0,
    insufficientData: 0,
    leader: 0,
    leaderButExtended: 0,
    nonParticipant: 0,
    participant: 0,
    priceOutranEvidence: 0,
    sourceThemeCode: candidate.theme.sourceThemeCode ?? candidate.theme.themeId,
    themeId: candidate.theme.themeId,
    themeName: candidate.theme.themeName,
  };
}

function updateThemeSummary(
  summary: PriceThemeSummary,
  score: ReturnType<typeof scorePriceParticipation>,
) {
  summary.candidatesScored += 1;

  if (score.state === "LEADER") {
    summary.leader += 1;
  } else if (score.state === "LEADER_BUT_EXTENDED") {
    summary.leaderButExtended += 1;
  } else if (score.state === "PARTICIPANT") {
    summary.participant += 1;
  } else if (score.state === "IMPROVING") {
    summary.improving += 1;
  } else if (score.state === "DELAYED_CATCH_UP_CANDIDATE") {
    summary.delayedCatchUp += 1;
  } else if (score.state === "NON_PARTICIPANT") {
    summary.nonParticipant += 1;
  } else if (score.state === "PRICE_OUTRAN_EVIDENCE") {
    summary.priceOutranEvidence += 1;
  } else if (score.state === "BROKEN") {
    summary.broken += 1;
  } else if (score.state === "INSUFFICIENT_DATA") {
    summary.insufficientData += 1;
  }
}

async function fetchValuationBundle(
  prisma: PriceDbClient,
  jobRunId: string,
  ticker: string,
  options: PriceScoringOptions,
) {
  const fixture = options.providerDataByTicker?.[ticker];
  const providerResults: ProviderResult<unknown>[] = [];

  if (fixture?.keyMetrics || fixture?.ratios) {
    return {
      keyMetrics: fixture.keyMetrics,
      providerResults,
      ratios: fixture.ratios,
    };
  }

  if (options.includeFmp === false) {
    return {
      keyMetrics: undefined,
      providerResults,
      ratios: undefined,
    };
  }

  const [keyMetrics, ratios] = await Promise.all([
    fetchFmpKeyMetrics(
      {
        jobRunId,
        prisma,
      },
      ticker,
    ),
    fetchFmpRatios(
      {
        jobRunId,
        prisma,
      },
      ticker,
    ),
  ]);
  providerResults.push(keyMetrics, ratios);

  return {
    keyMetrics: keyMetrics.ok ? keyMetrics.data : undefined,
    providerResults,
    ratios: ratios.ok ? ratios.data : undefined,
  };
}

export async function scoreThemePrices(
  prisma: PriceDbClient,
  options: PriceScoringOptions = {},
): Promise<PriceScoringSummary> {
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
      scopeType: "t4_price",
      status: "STARTED",
    },
  });
  const lockKey = await acquireLock(prisma, jobRun.jobRunId, scope);
  const providerResults: ProviderResult<unknown>[] = [];
  const warnings: PriceScoringSummary["warnings"] = [];
  const themeSummaries = new Map<string, PriceThemeSummary>();
  const fromIso = daysAgoIso(T4_HISTORY.preferredInitialCalendarDays);
  const toIso = todayIso();
  const benchmarkCache = new Map<string, BarsBundle>();
  const candidateBars = new Map<string, BarsBundle>();
  let nextMassiveRequestAt = 0;
  let evidenceWritten = 0;
  let rowsRead = 0;
  let rowsWritten = 0;

  try {
    const candidates = await loadCandidatesForPrice(prisma, options);
    const candidatesByTheme = groupByTheme(candidates);
    const benchmarkCandidates = await loadThemeBenchmarkCandidates(prisma, [
      ...candidatesByTheme.keys(),
    ]);
    const benchmarkCandidatesByTheme = groupByTheme(benchmarkCandidates);

    async function getBars(
      ticker: string,
      themeCode?: string,
      securityId?: string,
    ) {
      const cacheKey = `${ticker.toUpperCase()}:${securityId ?? ""}`;

      if (benchmarkCache.has(cacheKey)) {
        return benchmarkCache.get(cacheKey)!;
      }

      const hasFixture = Boolean(
        options.providerDataByTicker?.[ticker.toUpperCase()]?.bars,
      );

      if (options.includeMassive !== false && !hasFixture) {
        const waitMs = nextMassiveRequestAt - Date.now();

        if (waitMs > 0) {
          await sleep(waitMs);
        }

        nextMassiveRequestAt = Date.now() + MASSIVE_REQUEST_SPACING_MS;
      }

      const bundle = await barsForTicker(prisma, {
        fromIso,
        includeMassive: options.includeMassive,
        jobRunId: jobRun.jobRunId,
        options,
        securityId,
        themeCode,
        ticker,
        toIso,
      });
      benchmarkCache.set(cacheKey, bundle);
      providerResults.push(...bundle.providerResults);
      rowsRead += bundle.rowsRead;
      rowsWritten += bundle.barsWritten;

      if (bundle.warning) {
        warnings.push(bundle.warning);
      }

      return bundle;
    }

    const spySecurity = await securityForTicker(prisma, "SPY");
    const qqqSecurity = await securityForTicker(prisma, "QQQ");
    const spyBars = await getBars("SPY", undefined, spySecurity?.securityId);
    const qqqBars = await getBars("QQQ", undefined, qqqSecurity?.securityId);

    for (const themeCandidates of candidatesByTheme.values()) {
      const firstCandidate = themeCandidates[0];
      const themeCode = firstCandidate.theme.sourceThemeCode ?? undefined;
      const seedEtfs = seedEtfTickers(firstCandidate.theme.seedEtfs);
      const basketCandidates =
        benchmarkCandidatesByTheme.get(firstCandidate.themeId) ?? [];

      for (const candidate of themeCandidates) {
        const bundle = await getBars(
          candidate.security.canonicalTicker,
          themeCode,
          candidate.securityId,
        );
        candidateBars.set(candidate.themeCandidateId, bundle);
      }

      for (const candidate of basketCandidates) {
        if (candidateBars.has(candidate.themeCandidateId)) {
          continue;
        }

        const bundle = await getBars(
          candidate.security.canonicalTicker,
          themeCode,
          candidate.securityId,
        );
        candidateBars.set(candidate.themeCandidateId, bundle);
      }

      let themeBenchmark: ThemeBenchmark = {
        bars: buildEqualWeightBasketBars(
          basketCandidates.map(
            (candidate) =>
              candidateBars.get(candidate.themeCandidateId)?.bars ?? [],
          ),
        ),
        memberCount: basketCandidates.length,
        method: "equal_weight_candidates",
        rowsWritten: 0,
      };

      if (
        themeBenchmark.bars.length < T4_HISTORY.minimumBarsForShortTermMetrics
      ) {
        const seedTicker = seedEtfs[0];
        const seedSecurity = seedTicker
          ? await securityForTicker(prisma, seedTicker)
          : undefined;
        const seedBars = seedTicker
          ? await getBars(seedTicker, themeCode, seedSecurity?.securityId)
          : undefined;

        themeBenchmark = {
          bars: seedBars?.bars ?? [],
          memberCount: basketCandidates.length,
          method: seedBars?.bars.length
            ? "seed_etf_proxy"
            : "insufficient_data",
          proxyTicker: seedTicker,
          rowsWritten: 0,
        };
      }

      const basketRowsWritten = await persistThemeBasket(
        prisma,
        firstCandidate.themeId,
        themeBenchmark,
      );
      rowsWritten += basketRowsWritten;

      for (const candidate of themeCandidates) {
        const ticker = candidate.security.canonicalTicker;
        const bundle = candidateBars.get(candidate.themeCandidateId);
        const valuation = await fetchValuationBundle(
          prisma,
          jobRun.jobRunId,
          ticker,
          options,
        );
        providerResults.push(...valuation.providerResults);
        rowsRead += rowsReadFromProviders(valuation.providerResults);

        for (const result of valuation.providerResults) {
          const fmpWarning = providerWarning(ticker, themeCode, result);

          if (fmpWarning) {
            warnings.push(fmpWarning);
          }
        }

        const latestT1Score = tScore(candidate, T1_SIGNAL_LAYER)?.score;
        const latestT3Score = tScore(candidate, T3_SIGNAL_LAYER)?.score;
        const score = scorePriceParticipation({
          bars: bundle?.bars ?? [],
          qqqBars: qqqBars.bars,
          spyBars: spyBars.bars,
          t1Score:
            latestT1Score === null || latestT1Score === undefined
              ? undefined
              : Number(latestT1Score),
          t1State: tState(candidate, T1_SIGNAL_LAYER)?.state,
          t3Score:
            latestT3Score === null || latestT3Score === undefined
              ? undefined
              : Number(latestT3Score),
          t3State: tState(candidate, T3_SIGNAL_LAYER)?.state,
          themeBasketMemberCount: themeBenchmark.memberCount,
          themeBasketMethod: themeBenchmark.method,
          themeBenchmarkBars: themeBenchmark.bars,
          themeBenchmarkTicker: themeBenchmark.proxyTicker,
          valuation: {
            keyMetrics: valuation.keyMetrics,
            ratios: valuation.ratios,
          },
        });
        const scoreRowsWritten = await persistPriceScore(
          prisma,
          candidate,
          jobRun.jobRunId,
          score,
        );
        evidenceWritten += scoreRowsWritten - 4;
        rowsWritten += scoreRowsWritten + 1;

        const summary =
          themeSummaries.get(candidate.theme.themeId) ??
          emptyThemeSummary(candidate);
        updateThemeSummary(summary, score);
        themeSummaries.set(candidate.theme.themeId, summary);
      }
    }

    const summary: PriceScoringSummary = {
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
      rowsRead: candidates.length + rowsRead,
      rowsWritten,
      themes: [...themeSummaries.values()],
      warnings,
    };

    await prisma.jobRun.update({
      data: {
        errorSummary:
          warnings.length === 0
            ? undefined
            : `${warnings.length} price scoring warning(s); see command output.`,
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
