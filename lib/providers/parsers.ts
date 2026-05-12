export type SecCompanyTicker = {
  cik: string;
  ticker: string;
  companyName: string;
};

export type NasdaqSymbol = {
  symbol: string;
  securityName: string;
  marketCategory?: string;
  testIssue?: boolean;
  financialStatus?: string;
  roundLotSize?: number;
  etf?: boolean;
  exchange?: string;
  nasdaqSymbol?: string;
};

export type MassiveTicker = {
  ticker: string;
  name?: string;
  market?: string;
  locale?: string;
  primaryExchange?: string;
  type?: string;
  active?: boolean;
  currencyName?: string;
  cik?: string;
  compositeFigi?: string;
  shareClassFigi?: string;
};

export type MassiveAggregateBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  transactions?: number;
};

export type OpenFigiMapping = {
  ticker?: string;
  name?: string;
  figi?: string;
  compositeFigi?: string;
  shareClassFigi?: string;
  exchangeCode?: string;
  marketSector?: string;
  securityType?: string;
};

export type FmpCompanyMetric = Record<string, unknown> & {
  symbol?: string;
  date?: string;
};

export type SecCompanyFactUnit = {
  end?: string;
  filed?: string;
  fiscalPeriod?: string;
  fiscalYear?: number;
  form?: string;
  frame?: string;
  start?: string;
  tag: string;
  unit: string;
  value: number;
};

export type SecCompanyFacts = {
  cik?: string;
  entityName?: string;
  facts: SecCompanyFactUnit[];
  revenueFactTags: string[];
};

export type SecCompanySubmission = {
  accessionNumber?: string;
  filingDate?: string;
  form?: string;
  primaryDocument?: string;
  reportDate?: string;
};

export type FmpCompanyProfile = {
  companyName?: string;
  description?: string;
  industry?: string;
  marketCap?: number;
  raw: Record<string, unknown>;
  sector?: string;
  symbol: string;
};

export type FmpEtfHolding = {
  asOfDate?: string;
  holdingName?: string;
  marketValue?: number;
  raw: Record<string, unknown>;
  shares?: number;
  symbol: string;
  weight?: number;
};

export type FmpCompanyScreenerRow = {
  companyName?: string;
  exchangeShortName?: string;
  industry?: string;
  marketCap?: number;
  raw: Record<string, unknown>;
  sector?: string;
  symbol: string;
};

export type AlphaVantageListing = {
  symbol: string;
  name?: string;
  exchange?: string;
  assetType?: string;
  ipoDate?: string;
  delistingDate?: string;
  status?: string;
};

export type FredObservation = {
  seriesId: string;
  date: string;
  value: number | null;
  realtimeStart?: string;
  realtimeEnd?: string;
};

export type BeaDataset = {
  datasetName: string;
  datasetDescription?: string;
};

export type BlsObservation = {
  seriesId: string;
  year: string;
  period: string;
  periodName?: string;
  value: number | null;
  latest?: boolean;
  footnotes?: unknown;
};

export type EiaRoute = {
  id?: string;
  name?: string;
  description?: string;
};

export type UsaSpendingAward = {
  awardId?: string;
  recipientName?: string;
  awardAmount?: number;
  awardingAgency?: string;
  fundingAgency?: string;
  awardType?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

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

function yesNo(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim().toUpperCase() === "Y";
}

function normalizeCik(value: unknown) {
  const numeric = asNumber(value);

  if (numeric === undefined) {
    return asString(value)?.padStart(10, "0");
  }

  return String(numeric).padStart(10, "0");
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseDelimitedRows(text: string, delimiter: "|" | ",") {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerLine = lines[0];

  if (!headerLine) {
    return [];
  }

  const headers =
    delimiter === "," ? splitCsvLine(headerLine) : headerLine.split(delimiter);

  return lines.slice(1).flatMap((line) => {
    if (line.startsWith("File Creation Time")) {
      return [];
    }

    const values =
      delimiter === "," ? splitCsvLine(line) : line.split(delimiter);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );

    return [row];
  });
}

export function parseSecCompanyTickers(payload: unknown): SecCompanyTicker[] {
  return Object.values(asRecord(payload)).flatMap((value) => {
    const row = asRecord(value);
    const cik = normalizeCik(row.cik_str);
    const ticker = asString(row.ticker);
    const companyName = asString(row.title);

    if (!cik || !ticker || !companyName) {
      return [];
    }

    return [{ cik, companyName, ticker }];
  });
}

export function findSecRevenueFactTags(payload: unknown) {
  const facts = asRecord(asRecord(payload).facts);
  const usGaap = asRecord(facts["us-gaap"]);
  const revenueTags = [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
  ];

  return revenueTags.filter((tag) => Boolean(usGaap[tag]));
}

export function parseSecCompanyFactsPayload(payload: unknown): SecCompanyFacts {
  const record = asRecord(payload);
  const facts = asRecord(record.facts);
  const usGaap = asRecord(facts["us-gaap"]);
  const parsedFacts: SecCompanyFactUnit[] = [];

  for (const [tag, tagPayload] of Object.entries(usGaap)) {
    const units = asRecord(asRecord(tagPayload).units);

    for (const [unit, rows] of Object.entries(units)) {
      for (const value of asArray(rows)) {
        const row = asRecord(value);
        const numericValue = asNumber(row.val);

        if (numericValue === undefined) {
          continue;
        }

        parsedFacts.push({
          end: asString(row.end),
          filed: asString(row.filed),
          fiscalPeriod: asString(row.fp),
          fiscalYear: asNumber(row.fy),
          form: asString(row.form),
          frame: asString(row.frame),
          start: asString(row.start),
          tag,
          unit,
          value: numericValue,
        });
      }
    }
  }

  return {
    cik: asString(record.cik),
    entityName: asString(record.entityName),
    facts: parsedFacts,
    revenueFactTags: findSecRevenueFactTags(payload),
  };
}

export function parseSecCompanySubmissions(
  payload: unknown,
): SecCompanySubmission[] {
  const recent = asRecord(asRecord(asRecord(payload).filings).recent);
  const accessionNumbers = asArray(recent.accessionNumber);
  const forms = asArray(recent.form);
  const filingDates = asArray(recent.filingDate);
  const reportDates = asArray(recent.reportDate);
  const primaryDocuments = asArray(recent.primaryDocument);

  return accessionNumbers.flatMap((value, index) => {
    const accessionNumber = asString(value);

    if (!accessionNumber) {
      return [];
    }

    return [
      {
        accessionNumber,
        filingDate: asString(filingDates[index]),
        form: asString(forms[index]),
        primaryDocument: asString(primaryDocuments[index]),
        reportDate: asString(reportDates[index]),
      },
    ];
  });
}

export function parseNasdaqListedSymbols(text: string): NasdaqSymbol[] {
  return parseDelimitedRows(text, "|").flatMap((row) => {
    const symbol = row.Symbol;
    const securityName = row["Security Name"];

    if (!symbol || !securityName) {
      return [];
    }

    return [
      {
        etf: yesNo(row.ETF),
        financialStatus: row["Financial Status"],
        marketCategory: row["Market Category"],
        roundLotSize: asNumber(row["Round Lot Size"]),
        securityName,
        symbol,
        testIssue: yesNo(row["Test Issue"]),
      },
    ];
  });
}

export function parseOtherListedSymbols(text: string): NasdaqSymbol[] {
  return parseDelimitedRows(text, "|").flatMap((row) => {
    const symbol = row["ACT Symbol"];
    const securityName = row["Security Name"];

    if (!symbol || !securityName) {
      return [];
    }

    return [
      {
        etf: yesNo(row.ETF),
        exchange: row.Exchange,
        nasdaqSymbol: row["NASDAQ Symbol"],
        roundLotSize: asNumber(row["Round Lot Size"]),
        securityName,
        symbol,
        testIssue: yesNo(row["Test Issue"]),
      },
    ];
  });
}

export function parseMassiveTickers(payload: unknown): MassiveTicker[] {
  return asArray(asRecord(payload).results).flatMap((value) => {
    const row = asRecord(value);
    const ticker = asString(row.ticker);

    if (!ticker) {
      return [];
    }

    return [
      {
        active: typeof row.active === "boolean" ? row.active : undefined,
        cik: asString(row.cik),
        compositeFigi: asString(row.composite_figi),
        currencyName: asString(row.currency_name),
        locale: asString(row.locale),
        market: asString(row.market),
        name: asString(row.name),
        primaryExchange: asString(row.primary_exchange),
        shareClassFigi: asString(row.share_class_figi),
        ticker,
        type: asString(row.type),
      },
    ];
  });
}

export function parseMassiveAggregateBars(
  payload: unknown,
): MassiveAggregateBar[] {
  return asArray(asRecord(payload).results).flatMap((value) => {
    const row = asRecord(value);
    const timestamp = asNumber(row.t);
    const open = asNumber(row.o);
    const high = asNumber(row.h);
    const low = asNumber(row.l);
    const close = asNumber(row.c);
    const volume = asNumber(row.v);

    if (
      timestamp === undefined ||
      open === undefined ||
      high === undefined ||
      low === undefined ||
      close === undefined ||
      volume === undefined
    ) {
      return [];
    }

    return [
      {
        close,
        date: new Date(timestamp).toISOString().slice(0, 10),
        high,
        low,
        open,
        transactions: asNumber(row.n),
        volume,
        vwap: asNumber(row.vw),
      },
    ];
  });
}

export function parseOpenFigiMappings(payload: unknown): OpenFigiMapping[] {
  return asArray(payload).flatMap((mappingGroup) =>
    asArray(asRecord(mappingGroup).data).flatMap((value) => {
      const row = asRecord(value);
      const figi = asString(row.figi);

      if (!figi) {
        return [];
      }

      return [
        {
          compositeFigi: asString(row.compositeFIGI),
          exchangeCode: asString(row.exchCode),
          figi,
          marketSector: asString(row.marketSector),
          name: asString(row.name),
          securityType: asString(row.securityType),
          shareClassFigi: asString(row.shareClassFIGI),
          ticker: asString(row.ticker),
        },
      ];
    }),
  );
}

export function parseFmpRows(payload: unknown): FmpCompanyMetric[] {
  return asArray(payload).map((row) => asRecord(row) as FmpCompanyMetric);
}

export function parseFmpProfile(payload: unknown): FmpCompanyProfile[] {
  return asArray(payload).flatMap((value) => {
    const row = asRecord(value);
    const symbol = firstString(row, ["symbol", "ticker"])?.toUpperCase();

    if (!symbol) {
      return [];
    }

    return [
      {
        companyName: firstString(row, ["companyName", "company_name", "name"]),
        description: firstString(row, [
          "description",
          "profile",
          "businessSummary",
        ]),
        industry: firstString(row, ["industry"]),
        marketCap: firstNumber(row, ["marketCap", "market_cap", "mktCap"]),
        raw: row,
        sector: firstString(row, ["sector"]),
        symbol,
      },
    ];
  });
}

function firstString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asString(row[key]);

    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
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

export function parseFmpEtfHoldings(payload: unknown): FmpEtfHolding[] {
  return asArray(payload).flatMap((value) => {
    const row = asRecord(value);
    const symbol = firstString(row, [
      "symbol",
      "holdingSymbol",
      "holding_symbol",
      "ticker",
    ])?.toUpperCase();

    if (!symbol) {
      return [];
    }

    return [
      {
        asOfDate: firstString(row, [
          "date",
          "updatedAt",
          "updated_at",
          "asOfDate",
          "as_of_date",
        ]),
        holdingName: firstString(row, [
          "name",
          "holdingName",
          "holding_name",
          "asset",
        ]),
        marketValue: firstNumber(row, [
          "marketValue",
          "market_value",
          "marketVal",
        ]),
        raw: row,
        shares: firstNumber(row, ["sharesNumber", "shares", "share"]),
        symbol,
        weight: firstNumber(row, [
          "weightPercentage",
          "weight",
          "holdingWeight",
          "holding_weight",
        ]),
      },
    ];
  });
}

export function parseFmpCompanyScreener(
  payload: unknown,
): FmpCompanyScreenerRow[] {
  return asArray(payload).flatMap((value) => {
    const row = asRecord(value);
    const symbol = firstString(row, ["symbol", "ticker"])?.toUpperCase();

    if (!symbol) {
      return [];
    }

    return [
      {
        companyName: firstString(row, ["companyName", "company_name", "name"]),
        exchangeShortName: firstString(row, [
          "exchangeShortName",
          "exchange_short_name",
          "exchange",
        ]),
        industry: firstString(row, ["industry"]),
        marketCap: firstNumber(row, ["marketCap", "market_cap", "mktCap"]),
        raw: row,
        sector: firstString(row, ["sector"]),
        symbol,
      },
    ];
  });
}

export function parseAlphaVantageListingCsv(
  text: string,
): AlphaVantageListing[] {
  return parseDelimitedRows(text, ",").flatMap((row) => {
    if (!row.symbol) {
      return [];
    }

    return [
      {
        assetType: row.assetType,
        delistingDate: row.delistingDate,
        exchange: row.exchange,
        ipoDate: row.ipoDate,
        name: row.name,
        status: row.status,
        symbol: row.symbol,
      },
    ];
  });
}

export function parseFredObservations(
  payload: unknown,
  seriesId: string,
): FredObservation[] {
  return asArray(asRecord(payload).observations).flatMap((value) => {
    const row = asRecord(value);
    const date = asString(row.date);

    if (!date) {
      return [];
    }

    return [
      {
        date,
        realtimeEnd: asString(row.realtime_end),
        realtimeStart: asString(row.realtime_start),
        seriesId,
        value: row.value === "." ? null : (asNumber(row.value) ?? null),
      },
    ];
  });
}

export function parseBeaDatasets(payload: unknown): BeaDataset[] {
  const beaApi = asRecord(asRecord(payload).BEAAPI);
  const results = asRecord(beaApi.Results);

  return asArray(results.Dataset).flatMap((value) => {
    const row = asRecord(value);
    const datasetName = asString(row.DatasetName);

    if (!datasetName) {
      return [];
    }

    return [
      {
        datasetDescription: asString(row.DatasetDescription),
        datasetName,
      },
    ];
  });
}

export function parseBlsObservations(payload: unknown): BlsObservation[] {
  const results = asRecord(asRecord(payload).Results);

  return asArray(results.series).flatMap((series) => {
    const seriesRecord = asRecord(series);
    const seriesId = asString(seriesRecord.seriesID);

    if (!seriesId) {
      return [];
    }

    return asArray(seriesRecord.data).flatMap((value) => {
      const row = asRecord(value);
      const year = asString(row.year);
      const period = asString(row.period);

      if (!year || !period) {
        return [];
      }

      return [
        {
          footnotes: row.footnotes,
          latest: typeof row.latest === "boolean" ? row.latest : undefined,
          period,
          periodName: asString(row.periodName),
          seriesId,
          value: asNumber(row.value) ?? null,
          year,
        },
      ];
    });
  });
}

export function parseEiaRoutes(payload: unknown): EiaRoute[] {
  const response = asRecord(payload).response
    ? asRecord(asRecord(payload).response)
    : asRecord(payload);

  return asArray(response.routes).flatMap((value) => {
    const row = asRecord(value);
    const id = asString(row.id);
    const name = asString(row.name);

    if (!id && !name) {
      return [];
    }

    return [
      {
        description: asString(row.description),
        id,
        name,
      },
    ];
  });
}

export function parseUsaSpendingAwards(payload: unknown): UsaSpendingAward[] {
  const results = asArray(asRecord(payload).results);

  return results.flatMap((value) => {
    const row = asRecord(value);

    return [
      {
        awardAmount: asNumber(row["Award Amount"]),
        awardId: asString(row["Award ID"]),
        awardType: asString(row["Award Type"]),
        awardingAgency: asString(row["Awarding Agency"]),
        description: asString(row.Description),
        endDate: asString(row["End Date"]),
        fundingAgency: asString(row["Funding Agency"]),
        recipientName: asString(row["Recipient Name"]),
        startDate: asString(row["Start Date"]),
      },
    ];
  });
}
