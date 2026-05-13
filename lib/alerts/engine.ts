import type { AlertSeverity } from "@/generated/prisma/client";
import {
  ALERT_COOLDOWN_BUSINESS_DAYS,
  ALERT_REASON_CODES,
  ALERT_STATE_TYPES,
  ALERT_TYPES,
} from "@/lib/alerts/constants";
import type {
  AlertDecision,
  AlertStateType,
  CurrentTrackedState,
} from "@/lib/alerts/types";

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  BLOCKER: 5,
  CAUTION: 2,
  INFO: 1,
  POSITIVE: 3,
  WARNING: 4,
};

export function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values.flatMap((value) =>
        typeof value === "string" && value.length > 0 ? [value] : [],
      ),
    ),
  ];
}

export function severityRank(severity: AlertSeverity) {
  return SEVERITY_RANK[severity] ?? 0;
}

export function severityIncreased(
  previous: AlertSeverity | null | undefined,
  current: AlertSeverity,
) {
  return previous ? severityRank(current) > severityRank(previous) : true;
}

export function addBusinessDays(date: Date, days: number) {
  const next = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    next.setUTCDate(next.getUTCDate() + 1);
    const day = next.getUTCDay();

    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return next;
}

export function cooldownUntil(now: Date) {
  return addBusinessDays(now, ALERT_COOLDOWN_BUSINESS_DAYS);
}

function stateLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ").toLowerCase() : "baseline";
}

function titlePrefix(state: CurrentTrackedState) {
  return state.ticker
    ? `${state.ticker} in ${state.themeName}`
    : state.themeName;
}

function messageFor(state: CurrentTrackedState, previousState: string | null) {
  return `State changed from ${stateLabel(previousState)} to ${stateLabel(
    state.currentState,
  )}.`;
}

function themeSeverity(state: string): AlertSeverity {
  if (state === "WORTH_CHECKING_OUT") {
    return "POSITIVE";
  }

  if (state === "CONFIRMED_BUT_EXTENDED" || state === "CROWDED_LATE") {
    return "CAUTION";
  }

  if (state === "FADING" || state === "NO_CLEAN_EXPRESSION") {
    return "WARNING";
  }

  if (state === "REJECTED_INACTIVE") {
    return "BLOCKER";
  }

  return "INFO";
}

function exposureSeverity(state: string): AlertSeverity {
  if (state === "MAJOR_BENEFICIARY" || state === "DIRECT_BENEFICIARY") {
    return "POSITIVE";
  }

  if (state === "PARTIAL_BENEFICIARY" || state === "INDIRECT_BENEFICIARY") {
    return "INFO";
  }

  if (state === "UNRELATED" || state === "SAME_SECTOR_ONLY") {
    return "CAUTION";
  }

  if (state === "NARRATIVE_ADJACENT") {
    return "WARNING";
  }

  return "INFO";
}

function fundamentalSeverity(state: string): AlertSeverity {
  if (state === "VALIDATED" || state === "IMPROVING") {
    return "POSITIVE";
  }

  if (state === "DETERIORATING") {
    return "WARNING";
  }

  if (state === "CONTRADICTED") {
    return "BLOCKER";
  }

  if (state === "INSUFFICIENT_DATA") {
    return "CAUTION";
  }

  return "INFO";
}

function priceSeverity(state: string): AlertSeverity {
  if (state === "LEADER" || state === "PARTICIPANT") {
    return "POSITIVE";
  }

  if (
    state === "LEADER_BUT_EXTENDED" ||
    state === "PRICE_OUTRAN_EVIDENCE" ||
    state === "NEEDS_CONSOLIDATION"
  ) {
    return "WARNING";
  }

  if (state === "BROKEN") {
    return "BLOCKER";
  }

  if (state === "NON_PARTICIPANT" || state === "INSUFFICIENT_DATA") {
    return "CAUTION";
  }

  return "INFO";
}

function liquiditySeverity(
  state: string,
  reasonCodes: string[],
): AlertSeverity {
  if (
    state === "ILLIQUID" ||
    reasonCodes.includes("DILUTION_SEVERE") ||
    reasonCodes.includes("FRAGILITY_GOING_CONCERN")
  ) {
    return "BLOCKER";
  }

  if (
    state === "SPECULATIVE_ONLY" ||
    reasonCodes.includes("DILUTION_RECENT_OFFERING") ||
    reasonCodes.includes("DILUTION_SHARE_COUNT_WARNING") ||
    reasonCodes.includes("LIQUIDITY_DOLLAR_VOLUME_LOW")
  ) {
    return "WARNING";
  }

  if (state === "CORE_ELIGIBLE") {
    return "POSITIVE";
  }

  if (state === "EXPANDED_ELIGIBLE") {
    return "INFO";
  }

  return "CAUTION";
}

function finalSeverity(state: string): AlertSeverity {
  if (state === "SINGLE_STOCK_RESEARCH_JUSTIFIED") {
    return "POSITIVE";
  }

  if (state === "NO_TRADE" || state === "LEADER_BUT_EXTENDED") {
    return "WARNING";
  }

  if (state === "INVALIDATED") {
    return "BLOCKER";
  }

  if (
    state === "WRONG_TICKER" ||
    state === "REJECTED" ||
    state === "NON_PARTICIPANT"
  ) {
    return "CAUTION";
  }

  return "INFO";
}

export function severityForState(input: {
  reasonCodes?: string[];
  state: string;
  stateType: AlertStateType;
}): AlertSeverity {
  switch (input.stateType) {
    case ALERT_STATE_TYPES.THEME_DASHBOARD_STATE:
      return themeSeverity(input.state);
    case ALERT_STATE_TYPES.CANDIDATE_EXPOSURE_STATE:
      return exposureSeverity(input.state);
    case ALERT_STATE_TYPES.CANDIDATE_FUNDAMENTAL_STATE:
      return fundamentalSeverity(input.state);
    case ALERT_STATE_TYPES.CANDIDATE_PRICE_STATE:
      return priceSeverity(input.state);
    case ALERT_STATE_TYPES.CANDIDATE_LIQUIDITY_STATE:
      return liquiditySeverity(input.state, input.reasonCodes ?? []);
    case ALERT_STATE_TYPES.CANDIDATE_FINAL_STATE:
      return finalSeverity(input.state);
  }
}

function exposureDecision(state: string) {
  if (
    state === "MAJOR_BENEFICIARY" ||
    state === "DIRECT_BENEFICIARY" ||
    state === "PARTIAL_BENEFICIARY"
  ) {
    return {
      alertReasonCode: ALERT_REASON_CODES.EXPOSURE_CONFIRMED,
      alertType: ALERT_TYPES.EXPOSURE_CONFIRMED,
      title: "Exposure confirmed",
    };
  }

  return {
    alertReasonCode: ALERT_REASON_CODES.EXPOSURE_REJECTED,
    alertType: ALERT_TYPES.EXPOSURE_REJECTED,
    title: "Exposure rejected",
  };
}

function fundamentalDecision(state: string) {
  if (state === "VALIDATED" || state === "IMPROVING") {
    return {
      alertReasonCode: ALERT_REASON_CODES.FUNDAMENTALS_VALIDATED,
      alertType: ALERT_TYPES.FUNDAMENTALS_VALIDATED,
      title: "Fundamentals validated",
    };
  }

  if (state === "DETERIORATING" || state === "CONTRADICTED") {
    return {
      alertReasonCode: ALERT_REASON_CODES.FUNDAMENTALS_DETERIORATED,
      alertType: ALERT_TYPES.FUNDAMENTALS_DETERIORATED,
      title: "Fundamentals deteriorated",
    };
  }

  return {
    alertReasonCode: ALERT_REASON_CODES.FUNDAMENTALS_DETERIORATED,
    alertType: ALERT_TYPES.FUNDAMENTALS_DETERIORATED,
    title: "Fundamental state changed",
  };
}

function priceDecision(state: string) {
  if (state === "LEADER_BUT_EXTENDED") {
    return {
      alertReasonCode: ALERT_REASON_CODES.LEADER_BUT_EXTENDED,
      alertType: ALERT_TYPES.LEADER_BUT_EXTENDED,
      title: "Leader but extended",
    };
  }

  if (state === "DELAYED_CATCH_UP_CANDIDATE") {
    return {
      alertReasonCode: ALERT_REASON_CODES.DELAYED_CATCHUP,
      alertType: ALERT_TYPES.DELAYED_CATCHUP,
      title: "Delayed catch-up candidate",
    };
  }

  return {
    alertReasonCode: ALERT_REASON_CODES.PRICE_STATE_CHANGED,
    alertType: ALERT_TYPES.PRICE_STATE_CHANGED,
    title: "Price state changed",
  };
}

function liquidityDecision(state: CurrentTrackedState) {
  if (
    state.reasonCodes.includes("DILUTION_SEVERE") ||
    state.reasonCodes.includes("DILUTION_RECENT_OFFERING") ||
    state.reasonCodes.includes("DILUTION_SHARE_COUNT_WARNING")
  ) {
    return {
      alertReasonCode: ALERT_REASON_CODES.DILUTION_WARNING,
      alertType: ALERT_TYPES.DILUTION_WARNING,
      title: "Dilution risk warning",
    };
  }

  if (
    state.currentState === "ILLIQUID" ||
    state.currentState === "SPECULATIVE_ONLY" ||
    state.reasonCodes.includes("LIQUIDITY_DOLLAR_VOLUME_LOW")
  ) {
    return {
      alertReasonCode: ALERT_REASON_CODES.LIQUIDITY_WARNING,
      alertType: ALERT_TYPES.LIQUIDITY_WARNING,
      title: "Liquidity risk warning",
    };
  }

  return {
    alertReasonCode: ALERT_REASON_CODES.LIQUIDITY_WARNING,
    alertType: ALERT_TYPES.LIQUIDITY_WARNING,
    title: "Liquidity state changed",
  };
}

function finalDecision(state: string) {
  if (state === "NO_TRADE") {
    return {
      alertReasonCode: ALERT_REASON_CODES.NO_TRADE_TRIGGERED,
      alertType: ALERT_TYPES.NO_TRADE_TRIGGERED,
      title: "No-trade state triggered",
    };
  }

  if (state === "INVALIDATED") {
    return {
      alertReasonCode: ALERT_REASON_CODES.INVALIDATION_TRIGGERED,
      alertType: ALERT_TYPES.INVALIDATION_TRIGGERED,
      title: "Invalidation triggered",
    };
  }

  return {
    alertReasonCode: ALERT_REASON_CODES.FINAL_STATE_CHANGED,
    alertType: ALERT_TYPES.FINAL_STATE_CHANGED,
    title: "Final state changed",
  };
}

export function buildAlertDecision(
  state: CurrentTrackedState,
  previousState: string | null,
): AlertDecision {
  const base = (() => {
    switch (state.stateType) {
      case ALERT_STATE_TYPES.THEME_DASHBOARD_STATE:
        return {
          alertReasonCode: ALERT_REASON_CODES.THEME_STATE_CHANGED,
          alertType: ALERT_TYPES.THEME_STATE_CHANGED,
          title: "Theme state changed",
        };
      case ALERT_STATE_TYPES.CANDIDATE_EXPOSURE_STATE:
        return exposureDecision(state.currentState);
      case ALERT_STATE_TYPES.CANDIDATE_FUNDAMENTAL_STATE:
        return fundamentalDecision(state.currentState);
      case ALERT_STATE_TYPES.CANDIDATE_PRICE_STATE:
        return priceDecision(state.currentState);
      case ALERT_STATE_TYPES.CANDIDATE_LIQUIDITY_STATE:
        return liquidityDecision(state);
      case ALERT_STATE_TYPES.CANDIDATE_FINAL_STATE:
        return finalDecision(state.currentState);
    }
  })();

  return {
    ...base,
    message: messageFor(state, previousState),
    severity: state.severity,
    title: `${titlePrefix(state)}: ${base.title}`,
  };
}
