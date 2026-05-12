import type { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/config/env";
import {
  providerFetch,
  unconfiguredProviderResult,
} from "@/lib/providers/http";
import {
  findSecRevenueFactTags,
  parseAlphaVantageListingCsv,
  parseBeaDatasets,
  parseBlsObservations,
  parseEiaRoutes,
  parseFmpCompanyScreener,
  parseFmpEtfHoldings,
  parseFmpProfile,
  parseFmpRows,
  parseSecCompanyFactsPayload,
  parseSecCompanySubmissions,
  parseFredObservations,
  parseMassiveAggregateBars,
  parseMassiveTickers,
  parseNasdaqListedSymbols,
  parseOpenFigiMappings,
  parseOtherListedSymbols,
  parseSecCompanyTickers,
  parseUsaSpendingAwards,
  type AlphaVantageListing,
  type BeaDataset,
  type BlsObservation,
  type EiaRoute,
  type FmpCompanyScreenerRow,
  type FmpEtfHolding,
  type FmpCompanyMetric,
  type FmpCompanyProfile,
  type FredObservation,
  type MassiveAggregateBar,
  type MassiveTicker,
  type NasdaqSymbol,
  type OpenFigiMapping,
  type SecCompanyFacts,
  type SecCompanySubmission,
  type SecCompanyTicker,
  type UsaSpendingAward,
} from "@/lib/providers/parsers";
import type { ProviderResult } from "@/lib/providers/types";

type ProviderDbClient = Pick<
  PrismaClient,
  "apiObservability" | "providerPayload"
>;

type ProviderCallContext = {
  prisma: ProviderDbClient;
  jobRunId?: string;
  timeoutMs?: number;
  retryCount?: number;
};

type FmpPeriodOptions = {
  limit?: number;
  period?: "annual" | "quarter";
};

function requireEnv<T>(
  context: ProviderCallContext,
  provider: ProviderResult<T>["provider"],
  endpoint: string,
  envKey: keyof ReturnType<typeof getEnv>,
  value: string | undefined,
) {
  if (value) {
    return null;
  }

  return unconfiguredProviderResult<T>({
    endpoint,
    envKey,
    jobRunId: context.jobRunId,
    prisma: context.prisma,
    provider,
  });
}

function withQuery(
  baseUrl: string,
  params: Record<string, string | undefined>,
) {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function fmpPeriodParams(options: FmpPeriodOptions = {}) {
  return {
    limit: options.limit === undefined ? undefined : String(options.limit),
    period: options.period,
  };
}

function requireRows<T extends { length: number }>(label: string) {
  return (rows: T) =>
    rows.length > 0 ? undefined : `${label} returned 0 rows`;
}

export async function fetchSecCompanyTickers(
  context: ProviderCallContext,
): Promise<ProviderResult<SecCompanyTicker[]>> {
  const env = getEnv();
  const endpoint = "company_tickers";
  const unconfigured = requireEnv<SecCompanyTicker[]>(
    context,
    "SEC",
    endpoint,
    "SEC_USER_AGENT",
    env.SEC_USER_AGENT,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    headers: {
      "User-Agent": env.SEC_USER_AGENT,
    },
    jobRunId: context.jobRunId,
    parse: parseSecCompanyTickers,
    prisma: context.prisma,
    provider: "SEC",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: "https://www.sec.gov/files/company_tickers.json",
    validate: requireRows<SecCompanyTicker[]>("SEC company_tickers"),
  });
}

export async function fetchSecCompanyFacts(
  context: ProviderCallContext,
  cik: string,
): Promise<ProviderResult<{ cik: string; revenueFactTags: string[] }>> {
  const env = getEnv();
  const endpoint = "companyfacts";
  const unconfigured = requireEnv<{ cik: string; revenueFactTags: string[] }>(
    context,
    "SEC",
    endpoint,
    "SEC_USER_AGENT",
    env.SEC_USER_AGENT,
  );

  if (unconfigured) {
    return unconfigured;
  }

  const paddedCik = cik.padStart(10, "0");

  return providerFetch({
    endpoint,
    entityId: paddedCik,
    entityType: "cik",
    headers: {
      "User-Agent": env.SEC_USER_AGENT,
    },
    jobRunId: context.jobRunId,
    parse: (payload) => ({
      cik: paddedCik,
      revenueFactTags: findSecRevenueFactTags(payload),
    }),
    prisma: context.prisma,
    provider: "SEC",
    retryCount: context.retryCount,
    rowCount: (data) => data.revenueFactTags.length,
    timeoutMs: context.timeoutMs,
    url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`,
    validate: (data) =>
      data.revenueFactTags.length > 0
        ? undefined
        : "SEC companyfacts returned no revenue-like tags",
  });
}

export async function fetchSecFundamentalCompanyFacts(
  context: ProviderCallContext,
  cik: string,
): Promise<ProviderResult<SecCompanyFacts>> {
  const env = getEnv();
  const endpoint = "companyfacts";
  const unconfigured = requireEnv<SecCompanyFacts>(
    context,
    "SEC",
    endpoint,
    "SEC_USER_AGENT",
    env.SEC_USER_AGENT,
  );

  if (unconfigured) {
    return unconfigured;
  }

  const paddedCik = cik.padStart(10, "0");

  return providerFetch({
    endpoint,
    entityId: paddedCik,
    entityType: "cik",
    headers: {
      "User-Agent": env.SEC_USER_AGENT,
    },
    jobRunId: context.jobRunId,
    parse: parseSecCompanyFactsPayload,
    prisma: context.prisma,
    provider: "SEC",
    retryCount: context.retryCount,
    rowCount: (data) => data.facts.length,
    timeoutMs: context.timeoutMs,
    url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`,
    validate: (data) =>
      data.facts.length > 0 ? undefined : "SEC companyfacts returned no facts",
  });
}

export async function fetchSecCompanySubmissions(
  context: ProviderCallContext,
  cik: string,
): Promise<ProviderResult<SecCompanySubmission[]>> {
  const env = getEnv();
  const endpoint = "submissions";
  const unconfigured = requireEnv<SecCompanySubmission[]>(
    context,
    "SEC",
    endpoint,
    "SEC_USER_AGENT",
    env.SEC_USER_AGENT,
  );

  if (unconfigured) {
    return unconfigured;
  }

  const paddedCik = cik.padStart(10, "0");

  return providerFetch({
    endpoint,
    entityId: paddedCik,
    entityType: "cik",
    headers: {
      "User-Agent": env.SEC_USER_AGENT,
    },
    jobRunId: context.jobRunId,
    parse: parseSecCompanySubmissions,
    prisma: context.prisma,
    provider: "SEC",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
    validate: requireRows<SecCompanySubmission[]>("SEC submissions"),
  });
}

export async function fetchNasdaqListed(
  context: ProviderCallContext,
): Promise<ProviderResult<NasdaqSymbol[]>> {
  return providerFetch({
    endpoint: "nasdaqlisted",
    headers: {
      "User-Agent": "AlphaTrendV3/0.1 provider-smoke",
    },
    jobRunId: context.jobRunId,
    parse: (payload) => parseNasdaqListedSymbols(String(payload ?? "")),
    prisma: context.prisma,
    provider: "NASDAQ_TRADER",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    validate: requireRows<NasdaqSymbol[]>("Nasdaq listed symbols"),
  });
}

export async function fetchNasdaqOtherListed(
  context: ProviderCallContext,
): Promise<ProviderResult<NasdaqSymbol[]>> {
  return providerFetch({
    endpoint: "otherlisted",
    headers: {
      "User-Agent": "AlphaTrendV3/0.1 provider-smoke",
    },
    jobRunId: context.jobRunId,
    parse: (payload) => parseOtherListedSymbols(String(payload ?? "")),
    prisma: context.prisma,
    provider: "NASDAQ_TRADER",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
    validate: requireRows<NasdaqSymbol[]>("Nasdaq other-listed symbols"),
  });
}

export async function fetchMassiveReferenceTickers(
  context: ProviderCallContext,
  options: {
    active?: boolean;
    limit?: number;
    ticker?: string;
  } = {},
): Promise<ProviderResult<MassiveTicker[]>> {
  const env = getEnv();
  const endpoint = "reference_tickers";
  const unconfigured = requireEnv<MassiveTicker[]>(
    context,
    "MASSIVE",
    endpoint,
    "MASSIVE_API_KEY",
    env.MASSIVE_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: options.ticker,
    entityType: options.ticker ? "ticker" : "market",
    jobRunId: context.jobRunId,
    parse: parseMassiveTickers,
    prisma: context.prisma,
    provider: "MASSIVE",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://api.massive.com/v3/reference/tickers", {
      active: options.active === false ? "false" : "true",
      apiKey: env.MASSIVE_API_KEY,
      limit: options.limit === undefined ? undefined : String(options.limit),
      market: "stocks",
      ticker: options.ticker,
    }),
    validate: requireRows<MassiveTicker[]>("Massive reference tickers"),
  });
}

export async function fetchMassiveReferenceTicker(
  context: ProviderCallContext,
  ticker = "AAPL",
): Promise<ProviderResult<MassiveTicker[]>> {
  return fetchMassiveReferenceTickers(context, {
    active: true,
    ticker,
  });
}

export async function fetchMassiveDailyBars(
  context: ProviderCallContext,
  ticker = "AAPL",
  from = daysAgoIso(45),
  to = todayIso(),
): Promise<ProviderResult<MassiveAggregateBar[]>> {
  const env = getEnv();
  const endpoint = "daily_aggregate_bars";
  const unconfigured = requireEnv<MassiveAggregateBar[]>(
    context,
    "MASSIVE",
    endpoint,
    "MASSIVE_API_KEY",
    env.MASSIVE_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: ticker,
    entityType: "ticker",
    jobRunId: context.jobRunId,
    parse: parseMassiveAggregateBars,
    prisma: context.prisma,
    provider: "MASSIVE",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery(
      `https://api.massive.com/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
      {
        adjusted: "true",
        apiKey: env.MASSIVE_API_KEY,
        limit: "50000",
        sort: "asc",
      },
    ),
    validate: requireRows<MassiveAggregateBar[]>("Massive daily bars"),
  });
}

export async function mapOpenFigiTicker(
  context: ProviderCallContext,
  ticker = "AAPL",
): Promise<ProviderResult<OpenFigiMapping[]>> {
  return mapOpenFigiTickers(context, [ticker]);
}

export async function mapOpenFigiTickers(
  context: ProviderCallContext,
  tickers: string[],
): Promise<ProviderResult<OpenFigiMapping[]>> {
  const env = getEnv();
  const endpoint = "mapping";
  const body = tickers.map((ticker) => ({
    exchCode: "US",
    idType: "TICKER",
    idValue: ticker,
  }));

  return providerFetch({
    body,
    endpoint,
    entityId: tickers.length === 1 ? tickers[0] : `${tickers.length}_tickers`,
    entityType: tickers.length === 1 ? "ticker" : "ticker_batch",
    headers: {
      "Content-Type": "application/json",
      "X-OPENFIGI-APIKEY": env.OPENFIGI_API_KEY,
    },
    jobRunId: context.jobRunId,
    method: "POST",
    parse: parseOpenFigiMappings,
    prisma: context.prisma,
    provider: "OPENFIGI",
    retryCount: 0,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: "https://api.openfigi.com/v3/mapping",
    validate: requireRows<OpenFigiMapping[]>("OpenFIGI mapping"),
  });
}

export async function fetchFmpKeyMetrics(
  context: ProviderCallContext,
  ticker = "AAPL",
  options: FmpPeriodOptions = {},
): Promise<ProviderResult<FmpCompanyMetric[]>> {
  const env = getEnv();
  const endpoint = "key_metrics";
  const unconfigured = requireEnv<FmpCompanyMetric[]>(
    context,
    "FMP",
    endpoint,
    "FMP_API_KEY",
    env.FMP_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: ticker,
    entityType: "ticker",
    jobRunId: context.jobRunId,
    parse: parseFmpRows,
    prisma: context.prisma,
    provider: "FMP",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://financialmodelingprep.com/stable/key-metrics", {
      apikey: env.FMP_API_KEY,
      ...fmpPeriodParams(options),
      symbol: ticker,
    }),
    validate: requireRows<FmpCompanyMetric[]>("FMP key metrics"),
  });
}

export async function fetchFmpIncomeStatement(
  context: ProviderCallContext,
  ticker = "AAPL",
  options: FmpPeriodOptions = {},
): Promise<ProviderResult<FmpCompanyMetric[]>> {
  const env = getEnv();
  const endpoint = "income_statement";
  const unconfigured = requireEnv<FmpCompanyMetric[]>(
    context,
    "FMP",
    endpoint,
    "FMP_API_KEY",
    env.FMP_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: ticker,
    entityType: "ticker",
    jobRunId: context.jobRunId,
    parse: parseFmpRows,
    prisma: context.prisma,
    provider: "FMP",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery(
      "https://financialmodelingprep.com/stable/income-statement",
      {
        apikey: env.FMP_API_KEY,
        ...fmpPeriodParams(options),
        symbol: ticker,
      },
    ),
    validate: requireRows<FmpCompanyMetric[]>("FMP income statement"),
  });
}

export async function fetchFmpBalanceSheetStatement(
  context: ProviderCallContext,
  ticker = "AAPL",
  options: FmpPeriodOptions = {},
): Promise<ProviderResult<FmpCompanyMetric[]>> {
  const env = getEnv();
  const endpoint = "balance_sheet_statement";
  const unconfigured = requireEnv<FmpCompanyMetric[]>(
    context,
    "FMP",
    endpoint,
    "FMP_API_KEY",
    env.FMP_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: ticker,
    entityType: "ticker",
    jobRunId: context.jobRunId,
    parse: parseFmpRows,
    prisma: context.prisma,
    provider: "FMP",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery(
      "https://financialmodelingprep.com/stable/balance-sheet-statement",
      {
        apikey: env.FMP_API_KEY,
        ...fmpPeriodParams(options),
        symbol: ticker,
      },
    ),
    validate: requireRows<FmpCompanyMetric[]>("FMP balance sheet statement"),
  });
}

export async function fetchFmpCashFlowStatement(
  context: ProviderCallContext,
  ticker = "AAPL",
  options: FmpPeriodOptions = {},
): Promise<ProviderResult<FmpCompanyMetric[]>> {
  const env = getEnv();
  const endpoint = "cash_flow_statement";
  const unconfigured = requireEnv<FmpCompanyMetric[]>(
    context,
    "FMP",
    endpoint,
    "FMP_API_KEY",
    env.FMP_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: ticker,
    entityType: "ticker",
    jobRunId: context.jobRunId,
    parse: parseFmpRows,
    prisma: context.prisma,
    provider: "FMP",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery(
      "https://financialmodelingprep.com/stable/cash-flow-statement",
      {
        apikey: env.FMP_API_KEY,
        ...fmpPeriodParams(options),
        symbol: ticker,
      },
    ),
    validate: requireRows<FmpCompanyMetric[]>("FMP cash flow statement"),
  });
}

export async function fetchFmpRatios(
  context: ProviderCallContext,
  ticker = "AAPL",
  options: FmpPeriodOptions = {},
): Promise<ProviderResult<FmpCompanyMetric[]>> {
  const env = getEnv();
  const endpoint = "ratios";
  const unconfigured = requireEnv<FmpCompanyMetric[]>(
    context,
    "FMP",
    endpoint,
    "FMP_API_KEY",
    env.FMP_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: ticker,
    entityType: "ticker",
    jobRunId: context.jobRunId,
    parse: parseFmpRows,
    prisma: context.prisma,
    provider: "FMP",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://financialmodelingprep.com/stable/ratios", {
      apikey: env.FMP_API_KEY,
      ...fmpPeriodParams(options),
      symbol: ticker,
    }),
    validate: requireRows<FmpCompanyMetric[]>("FMP ratios"),
  });
}

export async function fetchFmpProfile(
  context: ProviderCallContext,
  ticker = "AAPL",
): Promise<ProviderResult<FmpCompanyProfile[]>> {
  const env = getEnv();
  const endpoint = "profile";
  const unconfigured = requireEnv<FmpCompanyProfile[]>(
    context,
    "FMP",
    endpoint,
    "FMP_API_KEY",
    env.FMP_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: ticker,
    entityType: "ticker",
    jobRunId: context.jobRunId,
    parse: parseFmpProfile,
    prisma: context.prisma,
    provider: "FMP",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://financialmodelingprep.com/stable/profile", {
      apikey: env.FMP_API_KEY,
      symbol: ticker,
    }),
    validate: requireRows<FmpCompanyProfile[]>("FMP profile"),
  });
}

export async function fetchFmpEtfHoldings(
  context: ProviderCallContext,
  etf = "SMH",
): Promise<ProviderResult<FmpEtfHolding[]>> {
  const env = getEnv();
  const endpoint = "etf_holdings";
  const unconfigured = requireEnv<FmpEtfHolding[]>(
    context,
    "FMP",
    endpoint,
    "FMP_API_KEY",
    env.FMP_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: etf,
    entityType: "etf",
    jobRunId: context.jobRunId,
    parse: parseFmpEtfHoldings,
    prisma: context.prisma,
    provider: "FMP",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://financialmodelingprep.com/stable/etf/holdings", {
      apikey: env.FMP_API_KEY,
      symbol: etf,
    }),
    validate: requireRows<FmpEtfHolding[]>("FMP ETF holdings"),
  });
}

export async function fetchFmpCompanyScreener(
  context: ProviderCallContext,
): Promise<ProviderResult<FmpCompanyScreenerRow[]>> {
  const env = getEnv();
  const endpoint = "company_screener";
  const unconfigured = requireEnv<FmpCompanyScreenerRow[]>(
    context,
    "FMP",
    endpoint,
    "FMP_API_KEY",
    env.FMP_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    jobRunId: context.jobRunId,
    parse: parseFmpCompanyScreener,
    prisma: context.prisma,
    provider: "FMP",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery(
      "https://financialmodelingprep.com/stable/company-screener",
      {
        apikey: env.FMP_API_KEY,
      },
    ),
    validate: requireRows<FmpCompanyScreenerRow[]>("FMP company screener"),
  });
}

export async function fetchAlphaVantageListings(
  context: ProviderCallContext,
  state: "active" | "delisted" = "active",
): Promise<ProviderResult<AlphaVantageListing[]>> {
  const env = getEnv();
  const endpoint = `listing_status_${state}`;
  const unconfigured = requireEnv<AlphaVantageListing[]>(
    context,
    "ALPHA_VANTAGE",
    endpoint,
    "ALPHA_VANTAGE_API_KEY",
    env.ALPHA_VANTAGE_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    jobRunId: context.jobRunId,
    parse: (payload) => parseAlphaVantageListingCsv(String(payload ?? "")),
    prisma: context.prisma,
    provider: "ALPHA_VANTAGE",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://www.alphavantage.co/query", {
      apikey: env.ALPHA_VANTAGE_API_KEY,
      function: "LISTING_STATUS",
      state,
    }),
    validate: requireRows<AlphaVantageListing[]>(
      "Alpha Vantage listing status",
    ),
  });
}

export async function fetchFredObservations(
  context: ProviderCallContext,
  seriesId = "DGS10",
): Promise<ProviderResult<FredObservation[]>> {
  const env = getEnv();
  const endpoint = "series_observations";
  const unconfigured = requireEnv<FredObservation[]>(
    context,
    "FRED",
    endpoint,
    "FRED_API_KEY",
    env.FRED_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    entityId: seriesId,
    entityType: "series",
    jobRunId: context.jobRunId,
    parse: (payload) => parseFredObservations(payload, seriesId),
    prisma: context.prisma,
    provider: "FRED",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://api.stlouisfed.org/fred/series/observations", {
      api_key: env.FRED_API_KEY,
      file_type: "json",
      observation_start: "2026-01-01",
      series_id: seriesId,
    }),
    validate: requireRows<FredObservation[]>("FRED observations"),
  });
}

export async function fetchBeaDatasets(
  context: ProviderCallContext,
): Promise<ProviderResult<BeaDataset[]>> {
  const env = getEnv();
  const endpoint = "dataset_list";
  const unconfigured = requireEnv<BeaDataset[]>(
    context,
    "BEA",
    endpoint,
    "BEA_API_KEY",
    env.BEA_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    jobRunId: context.jobRunId,
    parse: parseBeaDatasets,
    prisma: context.prisma,
    provider: "BEA",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://apps.bea.gov/api/data", {
      ResultFormat: "JSON",
      UserID: env.BEA_API_KEY,
      method: "GETDATASETLIST",
    }),
    validate: requireRows<BeaDataset[]>("BEA datasets"),
  });
}

export async function fetchBlsCpiSeries(
  context: ProviderCallContext,
): Promise<ProviderResult<BlsObservation[]>> {
  const env = getEnv();
  const endpoint = "timeseries_cpi";
  const unconfigured = requireEnv<BlsObservation[]>(
    context,
    "BLS",
    endpoint,
    "BLS_API_KEY",
    env.BLS_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  const currentYear = String(new Date().getUTCFullYear());

  return providerFetch({
    body: {
      endyear: currentYear,
      registrationkey: env.BLS_API_KEY,
      seriesid: ["CUUR0000SA0"],
      startyear: "2024",
    },
    endpoint,
    entityId: "CUUR0000SA0",
    entityType: "series",
    headers: {
      "Content-Type": "application/json",
    },
    jobRunId: context.jobRunId,
    method: "POST",
    parse: parseBlsObservations,
    prisma: context.prisma,
    provider: "BLS",
    retryCount: 0,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
    validate: requireRows<BlsObservation[]>("BLS CPI series"),
  });
}

export async function fetchEiaRoutes(
  context: ProviderCallContext,
): Promise<ProviderResult<EiaRoute[]>> {
  const env = getEnv();
  const endpoint = "v2_root";
  const unconfigured = requireEnv<EiaRoute[]>(
    context,
    "EIA",
    endpoint,
    "EIA_API_KEY",
    env.EIA_API_KEY,
  );

  if (unconfigured) {
    return unconfigured;
  }

  return providerFetch({
    endpoint,
    jobRunId: context.jobRunId,
    parse: parseEiaRoutes,
    prisma: context.prisma,
    provider: "EIA",
    retryCount: context.retryCount,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: withQuery("https://api.eia.gov/v2/", {
      api_key: env.EIA_API_KEY,
    }),
    validate: requireRows<EiaRoute[]>("EIA routes"),
  });
}

export async function fetchUsaSpendingAwards(
  context: ProviderCallContext,
): Promise<ProviderResult<UsaSpendingAward[]>> {
  return providerFetch({
    body: {
      fields: [
        "Award ID",
        "Recipient Name",
        "Award Amount",
        "Awarding Agency",
        "Funding Agency",
        "Award Type",
        "Start Date",
        "End Date",
        "Description",
      ],
      filters: {
        award_type_codes: ["A", "B", "C", "D"],
        time_period: [
          {
            end_date: "2025-01-31",
            start_date: "2025-01-01",
          },
        ],
      },
      limit: 1,
      order: "desc",
      page: 1,
      sort: "Award Amount",
    },
    endpoint: "spending_by_award",
    headers: {
      "Content-Type": "application/json",
    },
    jobRunId: context.jobRunId,
    method: "POST",
    parse: parseUsaSpendingAwards,
    prisma: context.prisma,
    provider: "USA_SPENDING",
    retryCount: 0,
    rowCount: (rows) => rows.length,
    timeoutMs: context.timeoutMs,
    url: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
  });
}
