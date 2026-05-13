import { describe, expect, it } from "vitest";

import { ALERT_STATE_TYPES } from "@/lib/alerts/constants";
import {
  addBusinessDays,
  buildAlertDecision,
  severityForState,
  severityIncreased,
  uniqueStrings,
} from "@/lib/alerts/engine";

describe("Phase 13 alert engine", () => {
  it("deduplicates string arrays and ignores invalid entries", () => {
    expect(uniqueStrings(["PRICE_LEADER", "", "PRICE_LEADER", null])).toEqual([
      "PRICE_LEADER",
    ]);
  });

  it("adds cooldown days as business days", () => {
    const friday = new Date("2026-05-08T00:00:00.000Z");
    const nextBusinessDay = addBusinessDays(friday, 1);

    expect(nextBusinessDay.toISOString()).toBe("2026-05-11T00:00:00.000Z");
  });

  it("detects severity increases for cooldown bypass", () => {
    expect(severityIncreased("INFO", "WARNING")).toBe(true);
    expect(severityIncreased("WARNING", "CAUTION")).toBe(false);
  });

  it("maps final no-trade state to a warning alert decision", () => {
    const decision = buildAlertDecision(
      {
        currentState: "NO_TRADE",
        evidenceIds: [],
        reasonCodes: ["DECISION_NO_TRADE"],
        securityId: "security-id",
        severity: severityForState({
          state: "NO_TRADE",
          stateType: ALERT_STATE_TYPES.CANDIDATE_FINAL_STATE,
        }),
        stateType: ALERT_STATE_TYPES.CANDIDATE_FINAL_STATE,
        themeCandidateId: "candidate-id",
        themeId: "theme-id",
        themeName: "AI Semiconductors",
        themeSlug: "ai-semiconductors",
        ticker: "NVDA",
      },
      "WATCHLIST_ONLY",
    );

    expect(decision).toMatchObject({
      alertReasonCode: "ALERT_NO_TRADE_TRIGGERED",
      alertType: "NO_TRADE_TRIGGERED",
      severity: "WARNING",
    });
    expect(decision.message).toContain("watchlist only");
    expect(decision.message).toContain("no trade");
  });

  it("maps theme dashboard changes to stored theme alerts", () => {
    const decision = buildAlertDecision(
      {
        currentState: "WORTH_CHECKING_OUT",
        evidenceIds: [],
        reasonCodes: ["DEMAND_MULTIPLE_BENEFICIARIES_VALIDATE"],
        severity: severityForState({
          state: "WORTH_CHECKING_OUT",
          stateType: ALERT_STATE_TYPES.THEME_DASHBOARD_STATE,
        }),
        stateType: ALERT_STATE_TYPES.THEME_DASHBOARD_STATE,
        themeId: "theme-id",
        themeName: "AI Semiconductors",
        themeSlug: "ai-semiconductors",
      },
      "EARLY_WATCHLIST",
    );

    expect(decision).toMatchObject({
      alertReasonCode: "ALERT_THEME_STATE_CHANGED",
      alertType: "THEME_STATE_CHANGED",
      severity: "POSITIVE",
    });
  });
});
