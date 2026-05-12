import { titleCaseState } from "@/lib/ui/format";

type StateBadgeProps = {
  state?: string | null;
};

function stateClass(state?: string | null) {
  if (!state) {
    return "border-state-muted text-state-muted";
  }

  if (
    [
      "WORTH_CHECKING_OUT",
      "SINGLE_STOCK_RESEARCH_JUSTIFIED",
      "VALIDATED",
      "CORE_ELIGIBLE",
      "LOW",
      "LEADER",
    ].includes(state)
  ) {
    return "border-positive bg-positive-bg text-positive";
  }

  if (
    [
      "EARLY_WATCHLIST",
      "WATCHLIST_ONLY",
      "BASKET_PREFERRED",
      "ETF_PREFERRED",
      "IMPROVING",
      "PARTICIPANT",
    ].includes(state)
  ) {
    return "border-info bg-info-bg text-info";
  }

  if (
    [
      "CONFIRMED_BUT_EXTENDED",
      "CROWDED_LATE",
      "LEADER_BUT_EXTENDED",
      "DELAYED_CATCH_UP_CANDIDATE",
      "MODERATE",
      "HIGH",
    ].includes(state)
  ) {
    return "border-warning bg-warning-bg text-warning";
  }

  if (
    [
      "FADING",
      "WRONG_TICKER",
      "NO_TRADE",
      "REJECTED",
      "INVALIDATED",
      "SEVERE",
      "ILLIQUID",
      "BROKEN",
    ].includes(state)
  ) {
    return "border-negative bg-negative-bg text-negative";
  }

  return "border-state-muted text-state-muted";
}

export function StateBadge({ state }: StateBadgeProps) {
  return (
    <span
      className={`inline-flex min-h-6 items-center border px-2 py-0.5 font-mono text-[11px] ${stateClass(
        state,
      )}`}
    >
      {titleCaseState(state)}
    </span>
  );
}
