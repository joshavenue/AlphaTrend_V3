import type {
  FmpCompanyMetric,
  SecCompanyFacts,
  SecCompanyFactUnit,
} from "@/lib/providers/parsers";
import type {
  FundamentalPeriod,
  FundamentalPeriodType,
  NormalizedFundamentalData,
} from "@/lib/fundamentals/types";

const SEC_TAGS = {
  assets: ["Assets"],
  basicShares: [
    "WeightedAverageNumberOfSharesOutstandingBasic",
    "CommonStockSharesOutstanding",
    "EntityCommonStockSharesOutstanding",
  ],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
  ],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  ],
  debtCurrent: [
    "ShortTermBorrowings",
    "ShortTermDebt",
    "LongTermDebtCurrent",
    "LongTermDebtAndFinanceLeaseObligationsCurrent",
  ],
  debtNonCurrent: [
    "LongTermDebtNoncurrent",
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
  ],
  dilutedShares: [
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfSharesOutstandingDiluted",
  ],
  grossProfit: ["GrossProfit"],
  inventory: ["InventoryNet", "InventoryFinishedGoodsNet"],
  liabilities: ["Liabilities"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  operatingIncome: ["OperatingIncomeLoss"],
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "Revenues",
  ],
} as const;

function asNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function firstString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asString(row[key]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function sortPeriodsDescending(periods: FundamentalPeriod[]) {
  return [...periods].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
}

function isQuarterPeriod(period: string | undefined) {
  return Boolean(period && /^Q[1-4]$/i.test(period));
}

function fmpPeriodType(row: Record<string, unknown>): FundamentalPeriodType {
  const period = firstString(row, ["period"]);

  return isQuarterPeriod(period) ? "quarter" : "annual";
}

function periodKey(period: FundamentalPeriod) {
  return `${period.periodType}:${period.periodEnd}:${period.fiscalPeriod ?? ""}`;
}

function assignDefined<T extends object>(target: T, values: Partial<T>) {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

export function normalizeFmpFundamentals(input: {
  balanceSheetStatements?: FmpCompanyMetric[];
  cashFlowStatements?: FmpCompanyMetric[];
  incomeStatements?: FmpCompanyMetric[];
  keyMetrics?: FmpCompanyMetric[];
  ratios?: FmpCompanyMetric[];
}): NormalizedFundamentalData {
  const periods = new Map<string, FundamentalPeriod>();

  function ensurePeriod(row: FmpCompanyMetric) {
    const periodEnd = firstString(row, ["date", "fillingDate", "acceptedDate"]);

    if (!periodEnd) {
      return undefined;
    }

    const period: FundamentalPeriod = {
      fiscalPeriod: firstString(row, ["period"]),
      fiscalYear: asNumber(firstString(row, ["calendarYear", "year"])),
      periodEnd: periodEnd.slice(0, 10),
      periodType: fmpPeriodType(row),
      source: "FMP",
    };
    const key = periodKey(period);
    const existing = periods.get(key) ?? period;
    periods.set(key, existing);

    return existing;
  }

  for (const row of input.incomeStatements ?? []) {
    const period = ensurePeriod(row);

    if (!period) {
      continue;
    }

    assignDefined(period, {
      dilutedShares: firstNumber(row, ["weightedAverageShsOutDil"]),
      grossProfit: firstNumber(row, ["grossProfit"]),
      netIncome: firstNumber(row, ["netIncome"]),
      operatingIncome: firstNumber(row, ["operatingIncome"]),
      revenue: firstNumber(row, ["revenue"]),
    });
  }

  for (const row of input.balanceSheetStatements ?? []) {
    const period = ensurePeriod(row);

    if (!period) {
      continue;
    }

    assignDefined(period, {
      cashAndEquivalents: firstNumber(row, [
        "cashAndCashEquivalents",
        "cashAndShortTermInvestments",
      ]),
      inventory: firstNumber(row, ["inventory", "netInventory"]),
      totalAssets: firstNumber(row, ["totalAssets"]),
      totalDebt:
        firstNumber(row, ["totalDebt"]) ??
        sumNumbers(
          firstNumber(row, ["shortTermDebt"]),
          firstNumber(row, ["longTermDebt"]),
        ),
      totalLiabilities: firstNumber(row, ["totalLiabilities"]),
    });
  }

  for (const row of input.cashFlowStatements ?? []) {
    const period = ensurePeriod(row);

    if (!period) {
      continue;
    }

    const operatingCashFlow = firstNumber(row, ["operatingCashFlow"]);
    const capitalExpenditure = firstNumber(row, ["capitalExpenditure"]);

    assignDefined(period, {
      capitalExpenditure,
      freeCashFlow:
        firstNumber(row, ["freeCashFlow"]) ??
        freeCashFlowFrom(operatingCashFlow, capitalExpenditure),
      operatingCashFlow,
    });
  }

  for (const row of input.keyMetrics ?? []) {
    const period = ensurePeriod(row);

    if (!period) {
      continue;
    }

    assignDefined(period, {
      dilutedShares:
        period.dilutedShares ??
        firstNumber(row, ["sharesOutstanding", "weightedAverageShsOutDil"]),
    });
  }

  const allPeriods = [...periods.values()];

  return {
    annualPeriods: sortPeriodsDescending(
      allPeriods.filter((period) => period.periodType === "annual"),
    ),
    provider: "FMP",
    quarterlyPeriods: sortPeriodsDescending(
      allPeriods.filter((period) => period.periodType === "quarter"),
    ),
  };
}

function sumNumbers(...values: Array<number | undefined>) {
  const usable = values.filter((value): value is number => value !== undefined);

  return usable.length === 0
    ? undefined
    : usable.reduce((sum, value) => sum + value, 0);
}

function freeCashFlowFrom(
  operatingCashFlow: number | undefined,
  capitalExpenditure: number | undefined,
) {
  if (operatingCashFlow === undefined || capitalExpenditure === undefined) {
    return undefined;
  }

  return capitalExpenditure < 0
    ? operatingCashFlow + capitalExpenditure
    : operatingCashFlow - capitalExpenditure;
}

function preferredFact(
  facts: SecCompanyFactUnit[],
  tags: readonly string[],
  unitKinds: "USD" | "shares",
  periodEnd: string,
  periodType: FundamentalPeriodType,
) {
  const units =
    unitKinds === "USD" ? new Set(["USD"]) : new Set(["shares", "SHARES"]);
  const periodFacts = facts.filter(
    (fact) =>
      tags.includes(fact.tag) &&
      fact.end === periodEnd &&
      units.has(fact.unit) &&
      (periodType === "annual"
        ? fact.fiscalPeriod === "FY"
        : isQuarterPeriod(fact.fiscalPeriod)),
  );

  for (const tag of tags) {
    const taggedFacts = periodFacts
      .filter((fact) => fact.tag === tag)
      .sort((left, right) => {
        const leftFiled = left.filed ?? "";
        const rightFiled = right.filed ?? "";

        return rightFiled.localeCompare(leftFiled);
      });
    const framed =
      periodType === "quarter"
        ? taggedFacts.find((fact) => fact.frame?.includes("Q"))
        : undefined;

    if (framed) {
      return framed;
    }

    if (taggedFacts[0]) {
      return taggedFacts[0];
    }
  }

  return undefined;
}

function uniquePeriodEnds(facts: SecCompanyFactUnit[]) {
  return [
    ...new Set(
      facts
        .filter(
          (fact) => fact.end && (fact.form === "10-Q" || fact.form === "10-K"),
        )
        .map((fact) => fact.end as string),
    ),
  ];
}

function secPeriodType(facts: SecCompanyFactUnit[], periodEnd: string) {
  const periodFacts = facts.filter((fact) => fact.end === periodEnd);

  return periodFacts.some((fact) => isQuarterPeriod(fact.fiscalPeriod))
    ? "quarter"
    : "annual";
}

export function normalizeSecCompanyFacts(
  input: SecCompanyFacts | undefined,
): NormalizedFundamentalData {
  if (!input) {
    return {
      annualPeriods: [],
      provider: "SEC",
      quarterlyPeriods: [],
    };
  }

  const periods: FundamentalPeriod[] = [];

  for (const periodEnd of uniquePeriodEnds(input.facts)) {
    const periodType = secPeriodType(input.facts, periodEnd);
    const revenue = preferredFact(
      input.facts,
      SEC_TAGS.revenue,
      "USD",
      periodEnd,
      periodType,
    );
    const grossProfit = preferredFact(
      input.facts,
      SEC_TAGS.grossProfit,
      "USD",
      periodEnd,
      periodType,
    );
    const operatingIncome = preferredFact(
      input.facts,
      SEC_TAGS.operatingIncome,
      "USD",
      periodEnd,
      periodType,
    );
    const netIncome = preferredFact(
      input.facts,
      SEC_TAGS.netIncome,
      "USD",
      periodEnd,
      periodType,
    );
    const operatingCashFlow = preferredFact(
      input.facts,
      SEC_TAGS.operatingCashFlow,
      "USD",
      periodEnd,
      periodType,
    );
    const capex = preferredFact(
      input.facts,
      SEC_TAGS.capex,
      "USD",
      periodEnd,
      periodType,
    );
    const dilutedShares = preferredFact(
      input.facts,
      SEC_TAGS.dilutedShares,
      "shares",
      periodEnd,
      periodType,
    );
    const cash = preferredFact(
      input.facts,
      SEC_TAGS.cash,
      "USD",
      periodEnd,
      periodType,
    );
    const currentDebt = preferredFact(
      input.facts,
      SEC_TAGS.debtCurrent,
      "USD",
      periodEnd,
      periodType,
    );
    const nonCurrentDebt = preferredFact(
      input.facts,
      SEC_TAGS.debtNonCurrent,
      "USD",
      periodEnd,
      periodType,
    );
    const assets = preferredFact(
      input.facts,
      SEC_TAGS.assets,
      "USD",
      periodEnd,
      periodType,
    );
    const liabilities = preferredFact(
      input.facts,
      SEC_TAGS.liabilities,
      "USD",
      periodEnd,
      periodType,
    );
    const inventory = preferredFact(
      input.facts,
      SEC_TAGS.inventory,
      "USD",
      periodEnd,
      periodType,
    );

    periods.push({
      capitalExpenditure: capex?.value,
      cashAndEquivalents: cash?.value,
      dilutedShares: dilutedShares?.value,
      fiscalPeriod: revenue?.fiscalPeriod ?? grossProfit?.fiscalPeriod,
      fiscalYear: revenue?.fiscalYear ?? grossProfit?.fiscalYear,
      freeCashFlow: freeCashFlowFrom(operatingCashFlow?.value, capex?.value),
      grossProfit: grossProfit?.value,
      inventory: inventory?.value,
      netIncome: netIncome?.value,
      operatingCashFlow: operatingCashFlow?.value,
      operatingIncome: operatingIncome?.value,
      periodEnd,
      periodStart: revenue?.start ?? grossProfit?.start,
      periodType,
      revenue: revenue?.value,
      source: "SEC",
      sourceTags: {
        assets: assets?.tag,
        cash: cash?.tag,
        grossProfit: grossProfit?.tag,
        netIncome: netIncome?.tag,
        operatingCashFlow: operatingCashFlow?.tag,
        operatingIncome: operatingIncome?.tag,
        revenue: revenue?.tag,
      },
      totalAssets: assets?.value,
      totalDebt: sumNumbers(currentDebt?.value, nonCurrentDebt?.value),
      totalLiabilities: liabilities?.value,
    });
  }

  return {
    annualPeriods: sortPeriodsDescending(
      periods.filter((period) => period.periodType === "annual"),
    ),
    provider: "SEC",
    quarterlyPeriods: sortPeriodsDescending(
      periods.filter((period) => period.periodType === "quarter"),
    ),
  };
}

export function mergeFundamentalData(
  secData: NormalizedFundamentalData,
  fmpData: NormalizedFundamentalData,
): NormalizedFundamentalData {
  function mergePeriods(
    secPeriods: FundamentalPeriod[],
    fmpPeriods: FundamentalPeriod[],
  ) {
    const byPeriodEnd = new Map<string, FundamentalPeriod>();

    for (const period of fmpPeriods) {
      byPeriodEnd.set(period.periodEnd, {
        ...period,
        source: "MERGED",
      });
    }

    for (const period of secPeriods) {
      const existing = byPeriodEnd.get(period.periodEnd);

      byPeriodEnd.set(period.periodEnd, {
        ...existing,
        ...Object.fromEntries(
          Object.entries(period).filter(([, value]) => value !== undefined),
        ),
        periodEnd: period.periodEnd,
        periodType: period.periodType,
        source: "MERGED",
      } as FundamentalPeriod);
    }

    return sortPeriodsDescending([...byPeriodEnd.values()]);
  }

  return {
    annualPeriods: mergePeriods(secData.annualPeriods, fmpData.annualPeriods),
    provider: "MERGED",
    quarterlyPeriods: mergePeriods(
      secData.quarterlyPeriods,
      fmpData.quarterlyPeriods,
    ),
  };
}
