import type { PriceState } from "@/generated/prisma/client";
import {
  T4_HISTORY,
  T4_PRICE_ALGORITHM_VERSION,
  T4_PRICE_THRESHOLD_VERSION,
  T4_REASON_CODES,
  T4_THRESHOLDS,
} from "@/lib/price/constants";
import type {
  PriceBar,
  PriceMetricsSnapshot,
  PriceScoreComponents,
  PriceScoreResult,
  PriceScoringInput,
  RelativeStrengthMetrics,
  ValuationMetrics,
  ValuationScoreResult,
} from "@/lib/price/types";

function round(value: number | undefined, digits = 6) {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Number(value.toFixed(digits));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sortedBars(bars: PriceBar[]) {
  return [...bars]
    .filter(
      (bar) =>
        Number.isFinite(bar.open) &&
        Number.isFinite(bar.high) &&
        Number.isFinite(bar.low) &&
        Number.isFinite(bar.close) &&
        Number.isFinite(bar.volume),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);

  if (finite.length === 0) {
    return undefined;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function standardDeviation(values: number[]) {
  const mean = average(values);

  if (mean === undefined || values.length < 2) {
    return undefined;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function zScore(value: number | undefined, values: number[]) {
  if (value === undefined || values.length < 5) {
    return undefined;
  }

  const mean = average(values);
  const sd = standardDeviation(values);

  if (mean === undefined || sd === undefined || sd === 0) {
    return undefined;
  }

  return (value - mean) / sd;
}

function movingAverageAt(bars: PriceBar[], index: number, window: number) {
  if (index < window - 1) {
    return undefined;
  }

  return average(
    bars.slice(index - window + 1, index + 1).map((bar) => bar.close),
  );
}

function slopeFor(bars: PriceBar[], window: number, lookback: number) {
  const latestIndex = bars.length - 1;
  const latest = movingAverageAt(bars, latestIndex, window);
  const prior = movingAverageAt(bars, latestIndex - lookback, window);

  if (latest === undefined || prior === undefined || prior === 0) {
    return undefined;
  }

  return (latest - prior) / Math.abs(prior);
}

function atrAt(bars: PriceBar[], index: number, window = 14) {
  if (index < window) {
    return undefined;
  }

  const ranges: number[] = [];

  for (let offset = index - window + 1; offset <= index; offset += 1) {
    const current = bars[offset];
    const previous = bars[offset - 1];
    ranges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      ),
    );
  }

  return average(ranges);
}

function returnOver(bars: PriceBar[], tradingDays: number) {
  if (bars.length <= tradingDays) {
    return undefined;
  }

  const latest = bars[bars.length - 1];
  const prior = bars[bars.length - 1 - tradingDays];

  if (prior.close === 0) {
    return undefined;
  }

  return latest.close / prior.close - 1;
}

function rollingReturns(
  bars: PriceBar[],
  tradingDays: number,
  maxWindows = 252,
) {
  const returns: number[] = [];
  const start = Math.max(tradingDays, bars.length - maxWindows);

  for (let index = start; index < bars.length; index += 1) {
    const prior = bars[index - tradingDays];

    if (prior.close !== 0) {
      returns.push(bars[index].close / prior.close - 1);
    }
  }

  return returns;
}

function businessDaysBetween(startIso: string, end: Date) {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const stop = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );
  let days = 0;

  for (
    const cursor = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    cursor <= stop;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.getUTCDay();

    if (day !== 0 && day !== 6) {
      days += 1;
    }
  }

  return days;
}

function volumeZScore(bars: PriceBar[]) {
  if (bars.length < 40) {
    return undefined;
  }

  const latestWindow = bars.slice(-20).map((bar) => bar.volume);
  const priorWindow = bars.slice(-60, -20).map((bar) => bar.volume);
  const latestAverage = average(latestWindow);

  return zScore(latestAverage, priorWindow);
}

function upVolumeRatio(bars: PriceBar[]) {
  if (bars.length < 21) {
    return undefined;
  }

  const start = bars.length - 20;
  let upVolume = 0;
  let totalVolume = 0;

  for (let index = start; index < bars.length; index += 1) {
    const bar = bars[index];
    const previous = index > 0 ? bars[index - 1] : undefined;
    totalVolume += bar.volume;

    if (previous && bar.close > previous.close) {
      upVolume += bar.volume;
    }
  }

  return totalVolume === 0 ? undefined : upVolume / totalVolume;
}

export function computePriceMetrics(
  inputBars: PriceBar[],
  asOfDate = new Date(),
): PriceMetricsSnapshot {
  const bars = sortedBars(inputBars);
  const latest = bars.at(-1);

  if (!latest) {
    return {
      barCount: 0,
      close: 0,
      date: asOfDate.toISOString().slice(0, 10),
      daysAbove50dBufferLast5: 0,
      isStale: true,
      tradingDaysSinceLastBar: Number.POSITIVE_INFINITY,
    };
  }

  const latestIndex = bars.length - 1;
  const ma20 = movingAverageAt(bars, latestIndex, 20);
  const ma50 = movingAverageAt(bars, latestIndex, 50);
  const ma200 = movingAverageAt(bars, latestIndex, 200);
  const atr14 = atrAt(bars, latestIndex, 14);
  const high52w = Math.max(
    ...bars.slice(-T4_HISTORY.tradingDays52w).map((bar) => bar.high),
  );
  const low52w = Math.min(
    ...bars.slice(-T4_HISTORY.tradingDays52w).map((bar) => bar.low),
  );
  const averageVolume20d = average(bars.slice(-20).map((bar) => bar.volume));
  const averageDollarVolume20d = average(
    bars.slice(-20).map((bar) => bar.volume * bar.close),
  );
  let daysAbove50dBufferLast5 = 0;

  for (
    let index = Math.max(0, latestIndex - 4);
    index <= latestIndex;
    index += 1
  ) {
    const ma = movingAverageAt(bars, index, 50);
    const atr = atrAt(bars, index, 14);

    if (
      ma !== undefined &&
      atr !== undefined &&
      bars[index].close > ma + T4_THRESHOLDS.trendBufferAtr * atr
    ) {
      daysAbove50dBufferLast5 += 1;
    }
  }

  const tradingDaysSinceLastBar = businessDaysBetween(latest.date, asOfDate);
  const return1m = returnOver(bars, T4_HISTORY.tradingDays1m);
  const return3m = returnOver(bars, T4_HISTORY.tradingDays3m);

  return {
    atr14: round(atr14),
    averageDollarVolume20d: round(averageDollarVolume20d, 2),
    averageVolume20d: round(averageVolume20d, 2),
    barCount: bars.length,
    close: latest.close,
    date: latest.date,
    daysAbove50dBufferLast5,
    distanceFrom20dAtr:
      ma20 !== undefined && atr14 !== undefined && atr14 > 0
        ? round((latest.close - ma20) / atr14)
        : undefined,
    distanceFrom50dAtr:
      ma50 !== undefined && atr14 !== undefined && atr14 > 0
        ? round((latest.close - ma50) / atr14)
        : undefined,
    drawdownFrom52wHigh:
      high52w > 0 ? round(latest.close / high52w - 1) : undefined,
    high52w: round(high52w),
    isStale:
      tradingDaysSinceLastBar > T4_THRESHOLDS.priceBarsStaleAfterBusinessDays,
    low52w: round(low52w),
    ma20: round(ma20),
    ma20Slope: round(slopeFor(bars, 20, 5)),
    ma50: round(ma50),
    ma50Slope: round(slopeFor(bars, 50, 10)),
    ma200: round(ma200),
    ma200Slope: round(slopeFor(bars, 200, 20)),
    return1m: round(return1m),
    return3m: round(return3m),
    return6m: round(returnOver(bars, T4_HISTORY.tradingDays6m)),
    tradingDaysSinceLastBar,
    upVolumeRatio20d: round(upVolumeRatio(bars)),
    volumeZscore20d: round(volumeZScore(bars)),
  };
}

function relativeReturn(
  candidate: PriceBar[],
  benchmark: PriceBar[] | undefined,
  tradingDays: number,
) {
  if (!benchmark || benchmark.length === 0) {
    return undefined;
  }

  const candidateReturn = returnOver(sortedBars(candidate), tradingDays);
  const benchmarkReturn = returnOver(sortedBars(benchmark), tradingDays);

  if (candidateReturn === undefined || benchmarkReturn === undefined) {
    return undefined;
  }

  return candidateReturn - benchmarkReturn;
}

export function computeRelativeStrength(
  candidateBars: PriceBar[],
  input: Pick<
    PriceScoringInput,
    "qqqBars" | "sectorBars" | "spyBars" | "themeBenchmarkBars"
  >,
): RelativeStrengthMetrics {
  return {
    vsQqq1m: round(
      relativeReturn(candidateBars, input.qqqBars, T4_HISTORY.tradingDays1m),
    ),
    vsQqq3m: round(
      relativeReturn(candidateBars, input.qqqBars, T4_HISTORY.tradingDays3m),
    ),
    vsSector3m: round(
      relativeReturn(candidateBars, input.sectorBars, T4_HISTORY.tradingDays3m),
    ),
    vsSpy1m: round(
      relativeReturn(candidateBars, input.spyBars, T4_HISTORY.tradingDays1m),
    ),
    vsSpy3m: round(
      relativeReturn(candidateBars, input.spyBars, T4_HISTORY.tradingDays3m),
    ),
    vsTheme1m: round(
      relativeReturn(
        candidateBars,
        input.themeBenchmarkBars,
        T4_HISTORY.tradingDays1m,
      ),
    ),
    vsTheme3m: round(
      relativeReturn(
        candidateBars,
        input.themeBenchmarkBars,
        T4_HISTORY.tradingDays3m,
      ),
    ),
  };
}

function numberFromRecord(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function valuesFromRows(
  rows: Record<string, unknown>[] | undefined,
  keys: string[],
) {
  return (rows ?? []).flatMap((row) => {
    const value = numberFromRecord(row, keys);
    return value === undefined || value <= 0 ? [] : [value];
  });
}

export function scoreValuationRoom(
  valuation: PriceScoringInput["valuation"],
): ValuationScoreResult {
  const keyMetricRows = valuation?.keyMetrics as
    | Record<string, unknown>[]
    | undefined;
  const ratioRows = valuation?.ratios as Record<string, unknown>[] | undefined;
  const evSalesValues = valuesFromRows(keyMetricRows, [
    "enterpriseValueOverRevenue",
    "enterpriseValueRevenue",
    "evToSales",
    "evToSalesRatio",
  ]);
  const peValues = valuesFromRows(ratioRows, [
    "priceEarningsRatio",
    "peRatio",
    "priceToEarningsRatio",
  ]);
  const priceToSalesValues = valuesFromRows(ratioRows, [
    "priceToSalesRatio",
    "priceSalesRatio",
  ]);
  const evSales = evSalesValues[0];
  const pe = peValues[0];
  const priceToSales = priceToSalesValues[0];
  const evSalesHistory = evSalesValues.slice(1);
  const peHistory = peValues.slice(1);
  const evSalesZScore = zScore(evSales, evSalesHistory);
  const peZScore = zScore(pe, peHistory);
  const historyCount = Math.max(evSalesValues.length, peValues.length);
  const metrics: ValuationMetrics = {
    evSales: round(evSales),
    evSalesZScore: round(evSalesZScore),
    historyCount,
    pe: round(pe),
    peZScore: round(peZScore),
    priceToSales: round(priceToSales),
  };
  const reasonCodes: string[] = [];

  if (
    historyCount < 5 ||
    (evSalesZScore === undefined && peZScore === undefined)
  ) {
    reasonCodes.push(T4_REASON_CODES.VALUATION_INSUFFICIENT_DATA);

    return {
      metrics,
      reasonCodes,
      state: "INSUFFICIENT_DATA",
    };
  }

  if (
    (evSalesZScore ?? Number.NEGATIVE_INFINITY) >= 2 ||
    (peZScore ?? Number.NEGATIVE_INFINITY) >= 2 ||
    (priceToSales ?? 0) > 20
  ) {
    reasonCodes.push(T4_REASON_CODES.VALUATION_EXTREME);

    return {
      metrics,
      reasonCodes,
      state: "EXTREME",
    };
  }

  if (
    (evSalesZScore ?? Number.NEGATIVE_INFINITY) >= 1 ||
    (peZScore ?? Number.NEGATIVE_INFINITY) >= 1
  ) {
    reasonCodes.push(T4_REASON_CODES.VALUATION_EXPENSIVE);

    return {
      metrics,
      reasonCodes,
      state: "EXPENSIVE",
    };
  }

  reasonCodes.push(T4_REASON_CODES.VALUATION_ROOM_AVAILABLE);

  return {
    metrics,
    reasonCodes,
    state: "VALUATION_ROOM_AVAILABLE",
  };
}

function componentScores(
  metrics: PriceMetricsSnapshot,
  relativeStrength: RelativeStrengthMetrics,
): PriceScoreComponents {
  const relativeStrengthTheme =
    (relativeStrength.vsTheme1m ?? Number.NEGATIVE_INFINITY) > 0 &&
    (relativeStrength.vsTheme3m ?? Number.NEGATIVE_INFINITY) > 0
      ? 30
      : (relativeStrength.vsTheme3m ?? Number.NEGATIVE_INFINITY) > 0
        ? 22
        : (relativeStrength.vsTheme1m ?? Number.NEGATIVE_INFINITY) > 0
          ? 14
          : 0;
  const relativeStrengthSector =
    (relativeStrength.vsSector3m ?? Number.NEGATIVE_INFINITY) > 0 ? 20 : 0;
  const marketSignals = [
    relativeStrength.vsSpy3m,
    relativeStrength.vsQqq3m,
  ].filter((value) => value !== undefined);
  const relativeStrengthMarket =
    marketSignals.length === 0
      ? 0
      : marketSignals.every((value) => value! > 0)
        ? 15
        : marketSignals.some((value) => value! > 0)
          ? 8
          : 0;
  const above20 = metrics.ma20 !== undefined && metrics.close > metrics.ma20;
  const above50 = metrics.ma50 !== undefined && metrics.close > metrics.ma50;
  const above200 = metrics.ma200 !== undefined && metrics.close > metrics.ma200;
  const trendStructure =
    above20 && above50 && above200 && (metrics.ma50Slope ?? 0) > 0
      ? 15
      : above20 && above50
        ? 10
        : above20 || (metrics.ma20Slope ?? 0) > 0
          ? 6
          : 0;
  const volumeConfirmation =
    (metrics.volumeZscore20d ?? Number.NEGATIVE_INFINITY) > 0 &&
    (metrics.upVolumeRatio20d ?? 0) >= 0.55
      ? 10
      : (metrics.volumeZscore20d ?? Number.NEGATIVE_INFINITY) > 0 ||
          (metrics.upVolumeRatio20d ?? 0) >= 0.55
        ? 5
        : 0;
  const drawdown = metrics.drawdownFrom52wHigh;
  const drawdownResilience =
    drawdown === undefined
      ? 0
      : drawdown >= -0.1
        ? 10
        : drawdown >= -0.2
          ? 5
          : 0;

  return {
    drawdown_resilience: drawdownResilience,
    relative_strength_market: relativeStrengthMarket,
    relative_strength_sector: relativeStrengthSector,
    relative_strength_theme: relativeStrengthTheme,
    trend_structure: trendStructure,
    volume_confirmation: volumeConfirmation,
  };
}

function sumComponents(components: PriceScoreComponents) {
  return Object.values(components).reduce((sum, value) => sum + value, 0);
}

function extensionState(metrics: PriceMetricsSnapshot) {
  const extended =
    (metrics.distanceFrom50dAtr ?? Number.NEGATIVE_INFINITY) >=
    T4_THRESHOLDS.distanceFrom50dExtendedAtr;
  const extreme =
    (metrics.distanceFrom50dAtr ?? Number.NEGATIVE_INFINITY) >=
    T4_THRESHOLDS.distanceFrom50dExtremeAtr;

  return {
    extended:
      extended ||
      (metrics.distanceFrom20dAtr ?? Number.NEGATIVE_INFINITY) >=
        T4_THRESHOLDS.distanceFrom20dWarningAtr,
    extreme,
  };
}

function isStrongT3State(state: string | undefined) {
  return state === "VALIDATED" || state === "IMPROVING";
}

function classifyPriceState(input: {
  components: PriceScoreComponents;
  extension: ReturnType<typeof extensionState>;
  metrics: PriceMetricsSnapshot;
  relativeStrength: RelativeStrengthMetrics;
  score: number;
  t1Score?: number;
  t1State?: string;
  t3Score?: number;
  t3State?: string;
}): PriceState {
  const { metrics, relativeStrength, score, extension } = input;

  if (
    metrics.barCount < T4_HISTORY.minimumBarsForState ||
    metrics.isStale ||
    metrics.close === 0
  ) {
    return "INSUFFICIENT_DATA";
  }

  if (
    (metrics.drawdownFrom52wHigh ?? 0) <=
      T4_THRESHOLDS.drawdownBrokenFromHigh ||
    ((metrics.ma50Slope ?? 0) < 0 &&
      metrics.ma50 !== undefined &&
      metrics.close <
        metrics.ma50 - (metrics.atr14 ?? 0) * T4_THRESHOLDS.trendBufferAtr)
  ) {
    return "BROKEN";
  }

  const leaderConditions =
    metrics.ma20 !== undefined &&
    metrics.ma50 !== undefined &&
    metrics.ma200 !== undefined &&
    metrics.close > metrics.ma20 &&
    metrics.close > metrics.ma50 &&
    metrics.close > metrics.ma200 &&
    (metrics.ma50Slope ?? 0) > 0 &&
    metrics.daysAbove50dBufferLast5 >= T4_THRESHOLDS.persistenceDays &&
    (relativeStrength.vsTheme1m ?? Number.NEGATIVE_INFINITY) > 0 &&
    (relativeStrength.vsTheme3m ?? Number.NEGATIVE_INFINITY) > 0 &&
    (relativeStrength.vsSector3m ?? Number.NEGATIVE_INFINITY) > 0;

  if (
    leaderConditions &&
    extension.extreme &&
    !isStrongT3State(input.t3State)
  ) {
    return "PRICE_OUTRAN_EVIDENCE";
  }

  if (leaderConditions && extension.extended) {
    return "LEADER_BUT_EXTENDED";
  }

  if (leaderConditions && score >= 70) {
    return "LEADER";
  }

  if (
    (relativeStrength.vsTheme1m ?? Number.POSITIVE_INFINITY) <=
      T4_THRESHOLDS.nonParticipantRsVsTheme1mMax &&
    score < 45
  ) {
    return "NON_PARTICIPANT";
  }

  if (
    isStrongT3State(input.t3State) &&
    (input.t1Score ?? 0) >= 50 &&
    (relativeStrength.vsTheme1m ?? Number.NEGATIVE_INFINITY) > 0 &&
    (metrics.ma20Slope ?? 0) > 0 &&
    score >= 40
  ) {
    return "DELAYED_CATCH_UP_CANDIDATE";
  }

  if (score >= 60) {
    return "PARTICIPANT";
  }

  if (score >= 40 || (metrics.ma20Slope ?? 0) > 0) {
    return "IMPROVING";
  }

  if (extension.extended) {
    return "NEEDS_CONSOLIDATION";
  }

  return "NEUTRAL";
}

function primaryReasonCodes(
  state: PriceState,
  metrics: PriceMetricsSnapshot,
  relativeStrength: RelativeStrengthMetrics,
  valuation: ValuationScoreResult,
  themeBasketMethod: PriceScoringInput["themeBasketMethod"],
) {
  const codes: string[] = [];

  if (metrics.isStale) {
    codes.push(T4_REASON_CODES.STALE_DATA);
  }

  if (metrics.barCount < T4_HISTORY.minimumBarsForState) {
    codes.push(T4_REASON_CODES.INSUFFICIENT_HISTORY);
  }

  if ((relativeStrength.vsTheme3m ?? Number.NEGATIVE_INFINITY) > 0) {
    codes.push(T4_REASON_CODES.RS_VS_THEME_POSITIVE);
  }

  if ((relativeStrength.vsSector3m ?? Number.NEGATIVE_INFINITY) > 0) {
    codes.push(T4_REASON_CODES.RS_VS_SECTOR_POSITIVE);
  }

  if ((metrics.volumeZscore20d ?? Number.NEGATIVE_INFINITY) > 0) {
    codes.push(T4_REASON_CODES.VOLUME_CONFIRMATION);
  }

  if (themeBasketMethod === "seed_etf_proxy") {
    codes.push(T4_REASON_CODES.THEME_BASKET_PROXY_USED);
  }

  const stateReason =
    state === "LEADER"
      ? T4_REASON_CODES.LEADER
      : state === "LEADER_BUT_EXTENDED"
        ? T4_REASON_CODES.LEADER_EXTENDED
        : state === "PARTICIPANT"
          ? T4_REASON_CODES.PARTICIPANT
          : state === "IMPROVING"
            ? T4_REASON_CODES.TREND_IMPROVING
            : state === "DELAYED_CATCH_UP_CANDIDATE"
              ? T4_REASON_CODES.DELAYED_CATCHUP_IMPROVING
              : state === "NON_PARTICIPANT"
                ? T4_REASON_CODES.NON_PARTICIPANT
                : state === "PRICE_OUTRAN_EVIDENCE"
                  ? T4_REASON_CODES.OUTRAN_EVIDENCE
                  : state === "NEEDS_CONSOLIDATION"
                    ? T4_REASON_CODES.NEEDS_CONSOLIDATION
                    : state === "BROKEN"
                      ? T4_REASON_CODES.PRICE_BROKEN
                      : undefined;

  if (stateReason) {
    codes.unshift(stateReason);
  }

  if (
    state !== "LEADER" &&
    metrics.daysAbove50dBufferLast5 > 0 &&
    metrics.daysAbove50dBufferLast5 < T4_THRESHOLDS.persistenceDays
  ) {
    codes.push(T4_REASON_CODES.ONE_DAY_SIGNAL_SUPPRESSED);
  }

  codes.push(...valuation.reasonCodes);

  return [...new Set(codes)];
}

function evidenceDetailsFor(result: {
  components: PriceScoreComponents;
  metrics: PriceMetricsSnapshot;
  relativeStrength: RelativeStrengthMetrics;
  state: PriceState;
  valuation: ValuationScoreResult;
}) {
  const details: PriceScoreResult["evidenceDetails"] = [];
  const pushNumeric = (
    metricName: string,
    metricValueNum: number | undefined,
    metricUnit: string,
    reasonCode: string,
    scoreImpact?: number,
  ) => {
    if (metricValueNum === undefined) {
      return;
    }

    details.push({
      metricName,
      metricUnit,
      metricValueNum,
      reasonCode,
      scoreImpact: scoreImpact === 0 ? undefined : scoreImpact,
    });
  };

  pushNumeric(
    "t4.price.latest_close",
    result.metrics.close,
    "usd",
    result.state === "BROKEN"
      ? T4_REASON_CODES.PRICE_BROKEN
      : T4_REASON_CODES.TREND_IMPROVING,
  );
  pushNumeric(
    "t4.price.rs_vs_spy_3m",
    result.relativeStrength.vsSpy3m,
    "ratio",
    T4_REASON_CODES.TREND_IMPROVING,
    result.components.relative_strength_market,
  );
  pushNumeric(
    "t4.price.rs_vs_qqq_3m",
    result.relativeStrength.vsQqq3m,
    "ratio",
    T4_REASON_CODES.TREND_IMPROVING,
  );
  pushNumeric(
    "t4.price.rs_vs_theme_1m",
    result.relativeStrength.vsTheme1m,
    "ratio",
    (result.relativeStrength.vsTheme1m ?? 0) > 0
      ? T4_REASON_CODES.RS_VS_THEME_POSITIVE
      : T4_REASON_CODES.NON_PARTICIPANT,
    result.components.relative_strength_theme,
  );
  pushNumeric(
    "t4.price.rs_vs_theme_3m",
    result.relativeStrength.vsTheme3m,
    "ratio",
    (result.relativeStrength.vsTheme3m ?? 0) > 0
      ? T4_REASON_CODES.RS_VS_THEME_POSITIVE
      : T4_REASON_CODES.NON_PARTICIPANT,
  );
  pushNumeric(
    "t4.price.distance_from_50d_atr",
    result.metrics.distanceFrom50dAtr,
    "atr",
    (result.metrics.distanceFrom50dAtr ?? 0) >=
      T4_THRESHOLDS.distanceFrom50dExtendedAtr
      ? T4_REASON_CODES.LEADER_EXTENDED
      : T4_REASON_CODES.TREND_IMPROVING,
  );
  pushNumeric(
    "t4.price.average_dollar_volume_20d",
    result.metrics.averageDollarVolume20d,
    "usd",
    T4_REASON_CODES.VOLUME_CONFIRMATION,
    result.components.volume_confirmation,
  );
  details.push({
    metricName: "t4.valuation.state",
    metricValueText: result.valuation.state,
    reasonCode:
      result.valuation.reasonCodes[0] ??
      T4_REASON_CODES.VALUATION_INSUFFICIENT_DATA,
  });

  return details;
}

export function scorePriceParticipation(
  input: PriceScoringInput,
): PriceScoreResult {
  const bars = sortedBars(input.bars);
  const metrics = computePriceMetrics(bars, input.asOfDate);
  const relativeStrength = computeRelativeStrength(bars, input);
  const valuation = scoreValuationRoom(input.valuation);
  const components = componentScores(metrics, relativeStrength);
  let rawScore = sumComponents(components);
  const capsApplied: string[] = [];
  const return1mZScore = zScore(
    metrics.return1m,
    rollingReturns(bars, T4_HISTORY.tradingDays1m),
  );
  const return3mZScore = zScore(
    metrics.return3m,
    rollingReturns(bars, T4_HISTORY.tradingDays3m),
  );
  const extension = extensionState(metrics);
  const overReturnExtension =
    (return1mZScore ?? Number.NEGATIVE_INFINITY) >=
      T4_THRESHOLDS.oneMonthReturnZscoreExtended ||
    (return3mZScore ?? Number.NEGATIVE_INFINITY) >= 2.5;

  extension.extended = extension.extended || overReturnExtension;
  extension.extreme =
    extension.extreme ||
    (metrics.distanceFrom50dAtr ?? Number.NEGATIVE_INFINITY) >=
      T4_THRESHOLDS.distanceFrom50dExtremeAtr;

  if (metrics.barCount < T4_HISTORY.minimumBarsForState) {
    rawScore = Math.min(rawScore, 39);
    capsApplied.push("insufficient_price_history");
  }

  if (metrics.isStale) {
    rawScore = Math.min(rawScore, 39);
    capsApplied.push("stale_price_data");
  }

  if (extension.extreme && !isStrongT3State(input.t3State)) {
    rawScore = Math.min(rawScore, 69);
    capsApplied.push("price_outran_evidence");
  }

  if (valuation.state === "EXTREME") {
    rawScore = Math.min(rawScore, 69);
    capsApplied.push("valuation_extreme");
  }

  const score = clampScore(rawScore);
  const state = classifyPriceState({
    components,
    extension,
    metrics,
    relativeStrength,
    score,
    t1Score: input.t1Score,
    t1State: input.t1State,
    t3Score: input.t3Score,
    t3State: input.t3State,
  });
  const reasonCodes = primaryReasonCodes(
    state,
    metrics,
    relativeStrength,
    valuation,
    input.themeBasketMethod,
  );
  const scoreDetail = {
    algorithm_version: T4_PRICE_ALGORITHM_VERSION,
    caps_applied: capsApplied,
    components,
    extension,
    final_score: score,
    metrics: {
      ...metrics,
      return1m: round(metrics.return1m),
      return3m: round(metrics.return3m),
      return6m: round(metrics.return6m),
    },
    price_state: state,
    reason_codes: reasonCodes,
    relative_strength: relativeStrength,
    theme_basket: {
      member_count: input.themeBasketMemberCount ?? 0,
      method: input.themeBasketMethod ?? "insufficient_data",
      proxy_ticker: input.themeBenchmarkTicker,
    },
    threshold_version: T4_PRICE_THRESHOLD_VERSION,
    valuation,
  };

  return {
    evidenceDetails: evidenceDetailsFor({
      components,
      metrics,
      relativeStrength,
      state,
      valuation,
    }),
    score,
    scoreDetail,
    state,
    valuationState: valuation.state,
  };
}
