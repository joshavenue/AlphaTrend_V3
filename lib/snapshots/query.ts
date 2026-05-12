import type {
  DashboardState,
  FinalState,
  ThemeDefinitionStatus,
} from "@/generated/prisma/client";

const DASHBOARD_STATES = new Set<DashboardState>([
  "CONFIRMED_BUT_EXTENDED",
  "CROWDED_LATE",
  "EARLY_WATCHLIST",
  "FADING",
  "INSUFFICIENT_EVIDENCE",
  "NO_CLEAN_EXPRESSION",
  "REJECTED_INACTIVE",
  "WORTH_CHECKING_OUT",
]);

const FINAL_STATES = new Set<FinalState>([
  "BASKET_PREFERRED",
  "DELAYED_CATCH_UP_CANDIDATE",
  "ETF_PREFERRED",
  "INSUFFICIENT_DATA",
  "INVALIDATED",
  "LEADER_BUT_EXTENDED",
  "NON_PARTICIPANT",
  "NO_TRADE",
  "REJECTED",
  "SINGLE_STOCK_RESEARCH_JUSTIFIED",
  "WATCHLIST_ONLY",
  "WRONG_TICKER",
]);

const THEME_STATUSES = new Set<ThemeDefinitionStatus>([
  "ACTIVE",
  "ACTIVE_SCANNED",
  "ACTIVE_UNSCANNED",
  "ARCHIVED",
  "CATALOG_LOADED",
  "INACTIVE",
  "PAUSED_DATA_GAP",
  "RETIRED",
  "REVIEW_REQUIRED",
]);

export function parsePositiveInt(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseDashboardState(value: string | null) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase() as DashboardState;

  return DASHBOARD_STATES.has(normalized) ? normalized : undefined;
}

export function parseFinalState(value: string | null) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase() as FinalState;

  return FINAL_STATES.has(normalized) ? normalized : undefined;
}

export function parseThemeStatus(value: string | null) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase() as ThemeDefinitionStatus;

  return THEME_STATUSES.has(normalized) ? normalized : undefined;
}
