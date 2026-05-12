export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not scanned";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function compactDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function titleCaseState(value: string | null | undefined) {
  if (!value) {
    return "Insufficient data";
  }

  const special: Record<string, string> = {
    CROWDED_LATE: "Crowded / Late",
    DELAYED_CATCH_UP_CANDIDATE: "Delayed Catch-Up Candidate",
    ETF_PREFERRED: "ETF Preferred",
    NO_CLEAN_EXPRESSION: "No Clean Expression",
    NO_TRADE: "No Trade",
    REJECTED_INACTIVE: "Rejected / Inactive",
    SINGLE_STOCK_RESEARCH_JUSTIFIED: "Single-Stock Research Justified",
    WORTH_CHECKING_OUT: "Worth Checking Out",
  };

  if (special[value]) {
    return special[value];
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function freshnessLabel(value: string | null | undefined) {
  if (!value) {
    return "Not scanned";
  }

  const ageMs = Date.now() - Date.parse(value);
  const ageDays = ageMs / (24 * 60 * 60 * 1_000);

  if (ageDays > 7) {
    return "Stale";
  }

  return "Fresh";
}
