import { describe, expect, it } from "vitest";

import {
  scorePriceParticipation,
  scoreValuationRoom,
} from "@/lib/price/scoring";
import type { PriceBar, PriceScoringInput } from "@/lib/price/types";

function previousTradingDay(date: Date) {
  const next = new Date(date);

  do {
    next.setUTCDate(next.getUTCDate() - 1);
  } while (next.getUTCDay() === 0 || next.getUTCDay() === 6);

  return next;
}

function tradingDates(count: number, endIso = "2026-05-11") {
  const dates: string[] = [];
  let cursor = new Date(`${endIso}T00:00:00.000Z`);

  while (dates.length < count) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
      dates.unshift(cursor.toISOString().slice(0, 10));
    }

    cursor = previousTradingDay(cursor);
  }

  return dates;
}

function bars(
  count: number,
  options: {
    dailyReturn?: number;
    endIso?: string;
    recentBoost?: number;
    recentDays?: number;
    recentDrop?: number;
    start?: number;
  } = {},
): PriceBar[] {
  const dates = tradingDates(count, options.endIso);
  let close = options.start ?? 100;

  return dates.map((date, index) => {
    const inRecentWindow =
      index >= count - (options.recentDays ?? 30) && index < count;
    const returnValue =
      options.recentDrop !== undefined && inRecentWindow
        ? options.recentDrop
        : (options.dailyReturn ?? 0.001) +
          (inRecentWindow ? (options.recentBoost ?? 0) : 0);
    const open = close;
    close *= 1 + returnValue;

    return {
      close,
      date,
      high: Math.max(open, close) * 1.004,
      low: Math.min(open, close) * 0.996,
      open,
      volume: 1_000_000 + index * 1_000,
      vwap: (open + close) / 2,
    };
  });
}

function input(overrides: Partial<PriceScoringInput> = {}): PriceScoringInput {
  return {
    asOfDate: new Date("2026-05-12T00:00:00.000Z"),
    bars: bars(280, {
      dailyReturn: 0.0015,
      recentBoost: 0.001,
    }),
    qqqBars: bars(280, {
      dailyReturn: 0.0005,
    }),
    spyBars: bars(280, {
      dailyReturn: 0.0004,
    }),
    t1Score: 72,
    t1State: "DIRECT_BENEFICIARY",
    t3Score: 84,
    t3State: "VALIDATED",
    themeBasketMemberCount: 4,
    themeBasketMethod: "equal_weight_candidates",
    themeBenchmarkBars: bars(280, {
      dailyReturn: 0.0006,
    }),
    ...overrides,
  };
}

describe("Phase 8 T4 price, valuation, and participation scoring", () => {
  it("leader_with_extension_becomes_leader_but_extended", () => {
    const result = scorePriceParticipation(
      input({
        bars: bars(280, {
          dailyReturn: 0.001,
          recentBoost: 0.015,
          recentDays: 35,
        }),
      }),
    );

    expect(result.state).toBe("LEADER_BUT_EXTENDED");
    expect(result.scoreDetail.reason_codes).toContain("PRICE_LEADER_EXTENDED");
    expect(result.scoreDetail.extension.extended).toBe(true);
  });

  it("broken_drawdown_vetoes_price_participation", () => {
    const result = scorePriceParticipation(
      input({
        bars: bars(280, {
          dailyReturn: 0.001,
          recentDays: 55,
          recentDrop: -0.012,
        }),
      }),
    );

    expect(result.state).toBe("BROKEN");
    expect(result.scoreDetail.reason_codes).toContain("PRICE_BROKEN");
  });

  it("insufficient_history_cannot_create_price_state", () => {
    const result = scorePriceParticipation(
      input({
        bars: bars(100),
      }),
    );

    expect(result.state).toBe("INSUFFICIENT_DATA");
    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.scoreDetail.reason_codes).toContain(
      "PRICE_INSUFFICIENT_HISTORY",
    );
  });

  it("single_day_breakout_is_suppressed_without_persistence", () => {
    const weakBars = bars(279, {
      dailyReturn: -0.0004,
    });
    const latest = weakBars.at(-1)!;
    const oneDayBreakout = [
      ...weakBars,
      {
        close: latest.close * 1.12,
        date: "2026-05-11",
        high: latest.close * 1.13,
        low: latest.close * 1.04,
        open: latest.close * 1.05,
        volume: 3_000_000,
      },
    ];
    const result = scorePriceParticipation(
      input({
        bars: oneDayBreakout,
      }),
    );

    expect(result.state).not.toBe("LEADER");
    expect(result.scoreDetail.reason_codes).toContain(
      "PRICE_ONE_DAY_SIGNAL_SUPPRESSED",
    );
  });

  it("strong_fundamentals_with_turning_relative_strength_is_delayed_catchup", () => {
    const result = scorePriceParticipation(
      input({
        bars: bars(280, {
          dailyReturn: -0.0008,
          recentBoost: 0.003,
          recentDays: 20,
        }),
        qqqBars: bars(280, {
          dailyReturn: -0.0003,
        }),
        spyBars: bars(280, {
          dailyReturn: -0.0002,
        }),
        themeBenchmarkBars: bars(280, {
          dailyReturn: 0.0007,
          recentBoost: -0.001,
          recentDays: 25,
        }),
      }),
    );

    expect(result.state).toBe("DELAYED_CATCH_UP_CANDIDATE");
    expect(result.scoreDetail.reason_codes).toContain(
      "PRICE_DELAYED_CATCHUP_IMPROVING",
    );
  });

  it("material_theme_underperformance_becomes_non_participant", () => {
    const result = scorePriceParticipation(
      input({
        bars: bars(280, {
          dailyReturn: 0,
        }),
        qqqBars: bars(280, {
          dailyReturn: 0.0005,
          recentBoost: 0.003,
          recentDays: 21,
        }),
        spyBars: bars(280, {
          dailyReturn: 0.0005,
          recentBoost: 0.003,
          recentDays: 21,
        }),
        themeBenchmarkBars: bars(280, {
          dailyReturn: 0.0006,
          recentBoost: 0.004,
          recentDays: 21,
        }),
      }),
    );

    expect(result.state).toBe("NON_PARTICIPANT");
    expect(result.scoreDetail.reason_codes).toContain("PRICE_NON_PARTICIPANT");
  });

  it("valuation_room_uses_historical_band_when_available", () => {
    const result = scoreValuationRoom({
      keyMetrics: [
        { enterpriseValueOverRevenue: 8, symbol: "P8" },
        { enterpriseValueOverRevenue: 5, symbol: "P8" },
        { enterpriseValueOverRevenue: 5.5, symbol: "P8" },
        { enterpriseValueOverRevenue: 6, symbol: "P8" },
        { enterpriseValueOverRevenue: 5.25, symbol: "P8" },
        { enterpriseValueOverRevenue: 5.75, symbol: "P8" },
      ],
      ratios: [],
    });

    expect(result.state).toBe("EXTREME");
    expect(result.reasonCodes).toContain("VALUATION_EXTREME");
  });

  it("valuation_room_stays_insufficient_without_history", () => {
    const result = scoreValuationRoom({
      keyMetrics: [{ enterpriseValueOverRevenue: 8, symbol: "P8" }],
      ratios: [],
    });

    expect(result.state).toBe("INSUFFICIENT_DATA");
    expect(result.reasonCodes).toContain("VALUATION_INSUFFICIENT_DATA");
  });
});
