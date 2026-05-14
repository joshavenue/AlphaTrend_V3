import {
  ADVANCED_THRESHOLD_VERSION,
  BASE_RATE_THRESHOLDS,
  T5_OWNERSHIP_FLOW_ALGORITHM_VERSION,
  T5_REASON_CODES,
  T7_BASE_RATE_ALGORITHM_VERSION,
  T7_REASON_CODES,
} from "@/lib/advanced/constants";
import type {
  BaseRateScoreResult,
  OwnershipFlowScoreResult,
  OwnershipFlowSnapshotInput,
  PriceBarForBaseRate,
} from "@/lib/advanced/types";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function winRate(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }

  return values.filter((value) => value > 0).length / values.length;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue)),
  );

  return sorted[index];
}

function change(from: number, to: number) {
  return from === 0 ? 0 : (to - from) / from;
}

function drawdownFromWindow(
  bars: PriceBarForBaseRate[],
  start: number,
  end: number,
) {
  const window = bars.slice(Math.max(0, start), Math.max(0, end + 1));

  if (window.length === 0) {
    return 0;
  }

  const high = Math.max(...window.map((bar) => bar.high ?? bar.close));
  const latest = window[window.length - 1].close;

  return high === 0 ? 0 : (latest - high) / high;
}

function momentumBucket(value: number) {
  if (value >= 0.12) {
    return "strong";
  }

  if (value >= 0) {
    return "positive";
  }

  if (value <= -0.12) {
    return "weak";
  }

  return "negative";
}

function drawdownBucket(value: number) {
  if (value <= -0.25) {
    return "deep_drawdown";
  }

  if (value <= -0.1) {
    return "moderate_drawdown";
  }

  return "shallow_drawdown";
}

function setupKeyForIndex(bars: PriceBarForBaseRate[], index: number) {
  const prior63 = bars[index - 63];

  if (!prior63) {
    return "insufficient_history";
  }

  const momentum3m = change(prior63.close, bars[index].close);
  const drawdown = drawdownFromWindow(bars, index - 126, index);

  return `${momentumBucket(momentum3m)}:${drawdownBucket(drawdown)}`;
}

export function scoreOwnershipFlow(
  input: OwnershipFlowSnapshotInput,
): OwnershipFlowScoreResult {
  const reasonCodes = new Set<string>();
  const holderCount = input.holderCount ?? 0;
  const ownershipPercent = input.ownershipPercent ?? 0;
  const etfWeight = input.etfWeight ?? 0;
  const delayedData = input.delayedData ?? true;

  let holderBreadth = 0;
  if (holderCount >= 50) {
    holderBreadth = 35;
  } else if (holderCount >= 25) {
    holderBreadth = 25;
  } else if (holderCount >= 10) {
    holderBreadth = 15;
  }

  let ownershipTrend = 0;
  if (input.ownershipTrend === "INCREASING") {
    ownershipTrend = 20;
  } else if (input.ownershipTrend === "STABLE") {
    ownershipTrend = 8;
  } else if (input.ownershipTrend === "DECREASING") {
    ownershipTrend = -20;
    reasonCodes.add(T5_REASON_CODES.FLOW_DISTRIBUTION_WARNING);
  }

  let etfFlowAccess = 0;
  if (input.etfFlowEligible || etfWeight >= 1) {
    etfFlowAccess = etfWeight >= 3 ? 20 : 12;
    reasonCodes.add(T5_REASON_CODES.FLOW_ETF_ELIGIBLE);
  }

  let crowdingPenalty = 0;
  if (ownershipPercent >= 0.7) {
    crowdingPenalty = -15;
    reasonCodes.add(T5_REASON_CODES.FLOW_CROWDED);
  }

  if (delayedData) {
    reasonCodes.add(T5_REASON_CODES.FLOW_13F_DELAYED_DATA);
  }

  if (input.licenseRestricted) {
    reasonCodes.add(T5_REASON_CODES.FLOW_LICENSE_REQUIRED);
  }

  if (holderBreadth >= 35 && ownershipTrend > 0) {
    reasonCodes.add(T5_REASON_CODES.FLOW_INSTITUTIONAL_ACCUMULATION);
  } else if (holderBreadth >= 15) {
    reasonCodes.add(T5_REASON_CODES.FLOW_OWNERSHIP_BROADENING);
  }

  const rawScore =
    holderBreadth + ownershipTrend + etfFlowAccess + crowdingPenalty;
  const score = clamp(rawScore);

  let flowState: OwnershipFlowScoreResult["flowState"] = "INSUFFICIENT_DATA";

  if (reasonCodes.has(T5_REASON_CODES.FLOW_DISTRIBUTION_WARNING)) {
    flowState = "DISTRIBUTION_OR_TRIMMING";
  } else if (reasonCodes.has(T5_REASON_CODES.FLOW_CROWDED)) {
    flowState = "CROWDED_OWNERSHIP";
  } else if (reasonCodes.has(T5_REASON_CODES.FLOW_INSTITUTIONAL_ACCUMULATION)) {
    flowState = "INSTITUTIONAL_ACCUMULATION";
  } else if (reasonCodes.has(T5_REASON_CODES.FLOW_OWNERSHIP_BROADENING)) {
    flowState = "BROADENING_OWNERSHIP";
  } else if (reasonCodes.has(T5_REASON_CODES.FLOW_ETF_ELIGIBLE)) {
    flowState = "ETF_FLOW_ELIGIBLE";
  } else if (!input.licenseRestricted) {
    flowState = "NO_MEANINGFUL_FLOW_ACCESS";
    reasonCodes.add(T5_REASON_CODES.FLOW_NO_MEANINGFUL_ACCESS);
  } else {
    reasonCodes.add(T5_REASON_CODES.DATA_MISSING);
  }

  const orderedReasonCodes = [...reasonCodes];

  return {
    flowState,
    reasonCodes: orderedReasonCodes,
    score,
    scoreDetail: {
      algorithm_version: T5_OWNERSHIP_FLOW_ALGORITHM_VERSION,
      components: {
        crowding_penalty: crowdingPenalty,
        etf_flow_access: etfFlowAccess,
        holder_breadth: holderBreadth,
        ownership_trend: ownershipTrend,
      },
      delayed_data: delayedData,
      final_score: score,
      metrics: {
        etf_weight: input.etfWeight,
        holder_count: input.holderCount,
        ownership_percent: input.ownershipPercent,
        ownership_trend: input.ownershipTrend,
        report_date: input.reportDate,
      },
      reason_codes: orderedReasonCodes,
      threshold_version: ADVANCED_THRESHOLD_VERSION,
    },
  };
}

export function scoreBaseRate(
  priceBars: PriceBarForBaseRate[],
): BaseRateScoreResult {
  const bars = [...priceBars].sort((a, b) => a.date.localeCompare(b.date));
  const latestIndex = bars.length - 1;
  const setupKey =
    latestIndex >= 0 ? setupKeyForIndex(bars, latestIndex) : "no_price_history";
  const reasonCodes = new Set<string>([
    T7_REASON_CODES.BASE_RATE_SURVIVORSHIP_WARNING,
  ]);

  if (bars.length < BASE_RATE_THRESHOLDS.minimumBarsForContext) {
    reasonCodes.add(T7_REASON_CODES.DATA_MISSING);
    reasonCodes.add(T7_REASON_CODES.BASE_RATE_LOW_SAMPLE_WARNING);

    return {
      baseRateState:
        bars.length === 0 ? "INSUFFICIENT_DATA" : "LOW_SAMPLE_WARNING",
      reasonCodes: [...reasonCodes],
      sampleSize: 0,
      score: 0,
      scoreDetail: {
        algorithm_version: T7_BASE_RATE_ALGORITHM_VERSION,
        metrics: {
          bars: bars.length,
          sample_size: 0,
          setup_key: setupKey,
        },
        reason_codes: [...reasonCodes],
        threshold_version: ADVANCED_THRESHOLD_VERSION,
      },
      setupKey,
    };
  }

  const samples: {
    drawdown: number;
    return1m: number;
    return3m: number;
    return6m: number;
  }[] = [];

  for (let index = 126; index < bars.length - 126; index += 1) {
    if (setupKeyForIndex(bars, index) !== setupKey) {
      continue;
    }

    samples.push({
      drawdown: drawdownFromWindow(bars, index, index + 126),
      return1m: change(bars[index].close, bars[index + 21].close),
      return3m: change(bars[index].close, bars[index + 63].close),
      return6m: change(bars[index].close, bars[index + 126].close),
    });
  }

  const return1m = samples.map((sample) => sample.return1m);
  const return3m = samples.map((sample) => sample.return3m);
  const return6m = samples.map((sample) => sample.return6m);
  const drawdowns = samples.map((sample) => sample.drawdown);
  const medianReturn3m = median(return3m);
  const winRate3m = winRate(return3m);
  const worstDecileDrawdown = percentile(drawdowns, 0.1);
  const sampleSize = samples.length;

  let score = 50;
  let baseRateState: BaseRateScoreResult["baseRateState"] = "MIXED";

  if (sampleSize < BASE_RATE_THRESHOLDS.lowSampleMinimum) {
    baseRateState = "LOW_SAMPLE_WARNING";
    score = 10;
    reasonCodes.add(T7_REASON_CODES.BASE_RATE_LOW_SAMPLE_WARNING);
  } else if (
    (medianReturn3m ?? 0) >= BASE_RATE_THRESHOLDS.supportiveMedianReturn3m &&
    (winRate3m ?? 0) >= BASE_RATE_THRESHOLDS.supportiveWinRate3m
  ) {
    baseRateState = "SUPPORTIVE";
    score = 70;
    reasonCodes.add(T7_REASON_CODES.BASE_RATE_SUPPORTIVE);
  } else if (
    (medianReturn3m ?? 0) < BASE_RATE_THRESHOLDS.unfavorableMedianReturn3m ||
    (winRate3m ?? 0) < BASE_RATE_THRESHOLDS.unfavorableWinRate3m ||
    (worstDecileDrawdown ?? 0) <=
      BASE_RATE_THRESHOLDS.unfavorableWorstDecileDrawdown
  ) {
    baseRateState = "UNFAVORABLE";
    score = 30;
    reasonCodes.add(T7_REASON_CODES.BASE_RATE_UNFAVORABLE);
  } else {
    reasonCodes.add(T7_REASON_CODES.BASE_RATE_MIXED);
  }

  const detail = {
    algorithm_version: T7_BASE_RATE_ALGORITHM_VERSION,
    metrics: {
      bars: bars.length,
      median_drawdown:
        median(drawdowns) === undefined ? undefined : round(median(drawdowns)!),
      median_return_1m:
        median(return1m) === undefined ? undefined : round(median(return1m)!),
      median_return_3m:
        medianReturn3m === undefined ? undefined : round(medianReturn3m),
      median_return_6m:
        median(return6m) === undefined ? undefined : round(median(return6m)!),
      sample_size: sampleSize,
      setup_key: setupKey,
      win_rate_1m:
        winRate(return1m) === undefined ? undefined : round(winRate(return1m)!),
      win_rate_3m: winRate3m === undefined ? undefined : round(winRate3m),
      win_rate_6m:
        winRate(return6m) === undefined ? undefined : round(winRate(return6m)!),
      worst_decile_drawdown:
        worstDecileDrawdown === undefined
          ? undefined
          : round(worstDecileDrawdown),
    },
    reason_codes: [...reasonCodes],
    threshold_version: ADVANCED_THRESHOLD_VERSION,
  };

  return {
    baseRateState,
    reasonCodes: [...reasonCodes],
    sampleSize,
    score,
    scoreDetail: detail,
    setupKey,
  };
}
