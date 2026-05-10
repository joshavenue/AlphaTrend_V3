import type { ProviderName } from "@/generated/prisma/client";
import { hashPayload } from "@/lib/evidence/hash";
import type {
  AlphaVantageListing,
  MassiveTicker,
  NasdaqSymbol,
  OpenFigiMapping,
  SecCompanyTicker,
} from "@/lib/providers/parsers";
import { SECURITY_MASTER_REASON_CODES } from "@/lib/security-master/reason-codes";
import {
  assignUniverseBucket,
  classifySecurityType,
  cleanCompanyName,
  exchangeFromMassiveTicker,
  hasExplicitAdrToken,
  hasForeignListingReviewSignal,
  isAdrSecurity,
  micForExchange,
  normalizeAlphaExchange,
  normalizeCik,
  normalizeNasdaqListedExchange,
  normalizeTicker,
  parseListingDate,
  requiresForeignListingReview,
} from "@/lib/security-master/normalize";
import type {
  SecurityMasterBuildResult,
  SecurityMasterIdentifierInput,
  SecurityMasterProviderPayloadRefs,
  SecurityMasterRecord,
  SecurityMasterSummary,
  SecurityMasterWarning,
} from "@/lib/security-master/types";

type BuildSecurityMasterInput = {
  secTickers?: SecCompanyTicker[];
  nasdaqListed?: NasdaqSymbol[];
  otherListed?: NasdaqSymbol[];
  massiveTickers?: MassiveTicker[];
  openFigiMappings?: OpenFigiMapping[];
  alphaActiveListings?: AlphaVantageListing[];
  alphaDelistedListings?: AlphaVantageListing[];
  providerPayloadRefs?: SecurityMasterProviderPayloadRefs;
};

type NasdaqSourceRow = {
  row: NasdaqSymbol;
  exchange: string;
  providerEndpoint: "nasdaqlisted" | "otherlisted";
};

function firstByTicker<T>(
  rows: T[] | undefined,
  tickerOf: (row: T) => string | undefined,
) {
  const map = new Map<string, T>();

  for (const row of rows ?? []) {
    const ticker = normalizeTicker(tickerOf(row));

    if (ticker && !map.has(ticker)) {
      map.set(ticker, row);
    }
  }

  return map;
}

function sourceHash(
  refs: SecurityMasterProviderPayloadRefs | undefined,
  provider: ProviderName,
) {
  return refs?.[provider]?.responseHash;
}

function addIdentifier(
  identifiers: SecurityMasterIdentifierInput[],
  input: Omit<SecurityMasterIdentifierInput, "identifierValue"> & {
    identifierValue?: string;
  },
) {
  const identifierValue = input.identifierValue?.trim();

  if (!identifierValue) {
    return;
  }

  identifiers.push({
    confidence: input.confidence,
    identifierType: input.identifierType,
    identifierValue,
    provider: input.provider,
    sourcePayloadHash: input.sourcePayloadHash,
  });
}

function warning(input: SecurityMasterWarning): SecurityMasterWarning {
  return input;
}

function isEtfOpinion(input: {
  nasdaq?: NasdaqSymbol;
  massive?: MassiveTicker;
  openFigi?: OpenFigiMapping;
  alpha?: AlphaVantageListing;
}) {
  const massiveType = input.massive?.type?.toUpperCase();
  const figiType = input.openFigi?.securityType?.toUpperCase();
  const alphaType = input.alpha?.assetType?.toUpperCase();

  return {
    alpha: alphaType?.includes("ETF"),
    figi: figiType?.includes("ETF"),
    massive: massiveType === "ETF" || massiveType === "ETS",
    nasdaq: input.nasdaq?.etf,
  };
}

function compactProviders(providers: Array<ProviderName | undefined>) {
  return providers.filter((provider): provider is ProviderName =>
    Boolean(provider),
  );
}

function classificationNames(input: {
  record: SecurityMasterRecord;
  nasdaq?: NasdaqSourceRow;
  massive?: MassiveTicker;
  openFigi?: OpenFigiMapping;
  alphaActive?: AlphaVantageListing;
  alphaDelisted?: AlphaVantageListing;
}) {
  return [
    input.record.companyName,
    input.nasdaq?.row.securityName,
    input.massive?.name,
    input.openFigi?.name,
    input.alphaActive?.name,
    input.alphaDelisted?.name,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function buildRecord(input: {
  nasdaq?: NasdaqSourceRow;
  sec?: SecCompanyTicker;
  massive?: MassiveTicker;
  openFigi?: OpenFigiMapping;
  alphaActive?: AlphaVantageListing;
  alphaDelisted?: AlphaVantageListing;
  providerPayloadRefs?: SecurityMasterProviderPayloadRefs;
}) {
  const ticker =
    normalizeTicker(input.nasdaq?.row.symbol) ??
    normalizeTicker(input.sec?.ticker) ??
    normalizeTicker(input.massive?.ticker) ??
    normalizeTicker(input.openFigi?.ticker) ??
    normalizeTicker(input.alphaActive?.symbol) ??
    normalizeTicker(input.alphaDelisted?.symbol);

  if (!ticker) {
    return undefined;
  }

  const exchange =
    input.nasdaq?.exchange ??
    normalizeAlphaExchange(input.alphaActive?.exchange) ??
    normalizeAlphaExchange(input.alphaDelisted?.exchange) ??
    exchangeFromMassiveTicker(input.massive) ??
    "UNKNOWN";
  const secCik = normalizeCik(input.sec?.cik);
  const massiveCik = normalizeCik(input.massive?.cik);
  const cik = secCik ?? massiveCik;
  const companyName =
    cleanCompanyName(input.sec?.companyName) ??
    cleanCompanyName(input.massive?.name) ??
    cleanCompanyName(input.openFigi?.name) ??
    cleanCompanyName(input.alphaActive?.name) ??
    cleanCompanyName(input.alphaDelisted?.name) ??
    cleanCompanyName(input.nasdaq?.row.securityName) ??
    `${ticker} Unnamed Security`;
  const alphaStatus =
    input.alphaDelisted?.status?.toUpperCase() ??
    input.alphaActive?.status?.toUpperCase();
  const isDelisted = Boolean(input.alphaDelisted) || alphaStatus === "DELISTED";
  const isActive =
    !isDelisted &&
    (input.nasdaq !== undefined ||
      input.alphaActive !== undefined ||
      input.massive?.active !== false);
  const securityType = classifySecurityType({
    alpha: input.alphaActive ?? input.alphaDelisted,
    companyName,
    massive: input.massive,
    nasdaq: input.nasdaq?.row,
    openFigi: input.openFigi,
  });
  const isEtf = securityType === "ETF";
  const isAdr = isAdrSecurity({
    companyName,
    isEtf,
    massive: input.massive,
    nasdaq: input.nasdaq?.row,
    openFigi: input.openFigi,
    securityType,
  });
  const foreignListingReviewRequired = requiresForeignListingReview({
    alpha: input.alphaActive ?? input.alphaDelisted,
    companyName,
    isAdr,
    isEtf,
    massive: input.massive,
    nasdaq: input.nasdaq?.row,
    openFigi: input.openFigi,
    securityType,
  });
  const isTestIssue = input.nasdaq?.row.testIssue === true;
  const universeBucket = assignUniverseBucket({
    foreignListingReviewRequired,
    isActive,
    isAdr,
    isDelisted,
    isEtf,
    isTestIssue,
    securityType,
  });
  const refs = input.providerPayloadRefs;
  const identifiers: SecurityMasterIdentifierInput[] = [];

  addIdentifier(identifiers, {
    confidence: "HIGH",
    identifierType: "TICKER",
    identifierValue: ticker,
    provider: "NASDAQ_TRADER",
    sourcePayloadHash: sourceHash(refs, "NASDAQ_TRADER"),
  });
  addIdentifier(identifiers, {
    confidence: "HIGH",
    identifierType: "CIK",
    identifierValue: secCik,
    provider: "SEC",
    sourcePayloadHash: sourceHash(refs, "SEC"),
  });
  addIdentifier(identifiers, {
    confidence: "HIGH",
    identifierType: "TICKER",
    identifierValue: input.sec?.ticker,
    provider: "SEC",
    sourcePayloadHash: sourceHash(refs, "SEC"),
  });
  addIdentifier(identifiers, {
    confidence: "MEDIUM",
    identifierType: "TICKER",
    identifierValue: input.massive?.ticker,
    provider: "MASSIVE",
    sourcePayloadHash: sourceHash(refs, "MASSIVE"),
  });
  addIdentifier(identifiers, {
    confidence: "MEDIUM",
    identifierType: "CIK",
    identifierValue: massiveCik,
    provider: "MASSIVE",
    sourcePayloadHash: sourceHash(refs, "MASSIVE"),
  });
  addIdentifier(identifiers, {
    confidence: "HIGH",
    identifierType: "FIGI",
    identifierValue: input.openFigi?.figi,
    provider: "OPENFIGI",
    sourcePayloadHash: sourceHash(refs, "OPENFIGI"),
  });
  addIdentifier(identifiers, {
    confidence: "HIGH",
    identifierType: "COMPOSITE_FIGI",
    identifierValue:
      input.openFigi?.compositeFigi ?? input.massive?.compositeFigi,
    provider: input.openFigi?.compositeFigi ? "OPENFIGI" : "MASSIVE",
    sourcePayloadHash: input.openFigi?.compositeFigi
      ? sourceHash(refs, "OPENFIGI")
      : sourceHash(refs, "MASSIVE"),
  });
  addIdentifier(identifiers, {
    confidence: "HIGH",
    identifierType: "SHARE_CLASS_FIGI",
    identifierValue:
      input.openFigi?.shareClassFigi ?? input.massive?.shareClassFigi,
    provider: input.openFigi?.shareClassFigi ? "OPENFIGI" : "MASSIVE",
    sourcePayloadHash: input.openFigi?.shareClassFigi
      ? sourceHash(refs, "OPENFIGI")
      : sourceHash(refs, "MASSIVE"),
  });
  addIdentifier(identifiers, {
    confidence: "MEDIUM",
    identifierType: "TICKER",
    identifierValue: input.alphaActive?.symbol ?? input.alphaDelisted?.symbol,
    provider: "ALPHA_VANTAGE",
    sourcePayloadHash: sourceHash(refs, "ALPHA_VANTAGE"),
  });

  const record: SecurityMasterRecord = {
    canonicalTicker: ticker,
    cik,
    companyName,
    compositeFigi:
      input.openFigi?.compositeFigi ?? input.massive?.compositeFigi,
    country: input.massive?.locale?.toLowerCase() === "us" ? "US" : "US",
    currency:
      input.massive?.currencyName?.toUpperCase() === "USD" ? "USD" : "USD",
    delistingDate: parseListingDate(input.alphaDelisted?.delistingDate),
    exchange,
    figi: input.openFigi?.figi,
    identifiers,
    isActive,
    isAdr,
    isDelisted,
    isEtf,
    isTestIssue,
    foreignListingReviewRequired,
    listingDate: parseListingDate(
      input.alphaActive?.ipoDate ?? input.alphaDelisted?.ipoDate,
    ),
    mic: micForExchange(exchange, input.massive),
    securityType,
    shareClassFigi:
      input.openFigi?.shareClassFigi ?? input.massive?.shareClassFigi,
    universeBucket,
  };

  return record;
}

function buildWarnings(input: {
  record: SecurityMasterRecord;
  nasdaq?: NasdaqSourceRow;
  sec?: SecCompanyTicker;
  massive?: MassiveTicker;
  openFigi?: OpenFigiMapping;
  alphaActive?: AlphaVantageListing;
  alphaDelisted?: AlphaVantageListing;
}) {
  const warnings: SecurityMasterWarning[] = [];
  const { record } = input;
  const secCik = normalizeCik(input.sec?.cik);
  const massiveCik = normalizeCik(input.massive?.cik);
  const names = classificationNames(input);
  const adrTokenNames = names.filter(hasExplicitAdrToken);
  const foreignSignalNames = names.filter(hasForeignListingReviewSignal);

  if (record.companyName.endsWith("Unnamed Security")) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.BLANK_NAME,
        exchange: record.exchange,
        message: "Security had no usable provider name.",
        providers: compactProviders(["SEC", "NASDAQ_TRADER", "MASSIVE"]),
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (secCik && massiveCik && secCik !== massiveCik) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.CIK_CONFLICT,
        detail: { massiveCik, secCik },
        exchange: record.exchange,
        message: "SEC and Massive returned different CIK values.",
        providers: ["SEC", "MASSIVE"],
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (
    input.openFigi?.compositeFigi &&
    input.massive?.compositeFigi &&
    input.openFigi.compositeFigi !== input.massive.compositeFigi
  ) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.FIGI_CONFLICT,
        detail: {
          massiveCompositeFigi: input.massive.compositeFigi,
          openFigiCompositeFigi: input.openFigi.compositeFigi,
        },
        exchange: record.exchange,
        message: "OpenFIGI and Massive returned different composite FIGIs.",
        providers: ["OPENFIGI", "MASSIVE"],
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  const etfOpinions = isEtfOpinion({
    alpha: input.alphaActive ?? input.alphaDelisted,
    massive: input.massive,
    nasdaq: input.nasdaq?.row,
    openFigi: input.openFigi,
  });
  const opinionValues = Object.values(etfOpinions).filter(
    (value): value is boolean => value !== undefined,
  );

  if (
    opinionValues.length > 1 &&
    new Set(opinionValues).size > 1 &&
    !record.isTestIssue
  ) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.ETF_FLAG_CONFLICT,
        detail: etfOpinions,
        exchange: record.exchange,
        message: "Providers disagree on ETF classification.",
        providers: compactProviders([
          input.nasdaq ? "NASDAQ_TRADER" : undefined,
          input.massive ? "MASSIVE" : undefined,
          input.openFigi ? "OPENFIGI" : undefined,
          (input.alphaActive ?? input.alphaDelisted)
            ? "ALPHA_VANTAGE"
            : undefined,
        ]),
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (input.nasdaq && input.massive?.active === false) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.STATUS_CONFLICT,
        detail: { massiveActive: false, nasdaqListed: true },
        exchange: record.exchange,
        message: "Nasdaq lists the symbol while Massive marks it inactive.",
        providers: ["NASDAQ_TRADER", "MASSIVE"],
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (input.nasdaq && input.alphaDelisted) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.STATUS_CONFLICT,
        detail: { alphaStatus: input.alphaDelisted.status },
        exchange: record.exchange,
        message:
          "Nasdaq lists the symbol while Alpha Vantage marks it delisted.",
        providers: ["NASDAQ_TRADER", "ALPHA_VANTAGE"],
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (record.isEtf && adrTokenNames.length > 0) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.ADR_TOKEN_REJECTED,
        detail: { matchedNames: adrTokenNames },
        exchange: record.exchange,
        message: "ADR text ignored because ETF classification has precedence.",
        providers: compactProviders([
          input.nasdaq ? "NASDAQ_TRADER" : undefined,
          input.openFigi ? "OPENFIGI" : undefined,
          input.massive ? "MASSIVE" : undefined,
        ]),
        severity: "INFO",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (record.isAdr && adrTokenNames.length > 0) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.ADR_TOKEN_MATCH,
        detail: { matchedNames: adrTokenNames },
        exchange: record.exchange,
        message: "Explicit ADR/ADS token was used for ADR classification.",
        providers: compactProviders([
          input.nasdaq ? "NASDAQ_TRADER" : undefined,
          input.openFigi ? "OPENFIGI" : undefined,
          input.massive ? "MASSIVE" : undefined,
          input.sec ? "SEC" : undefined,
        ]),
        severity: "INFO",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (record.foreignListingReviewRequired) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.COMMON_STOCK_BLOCKED_BY_FOREIGN_SIGNAL,
        detail: { matchedNames: foreignSignalNames },
        exchange: record.exchange,
        message:
          "Common-stock classification blocked from US_COMMON_ALL by foreign/listing review signal.",
        providers: compactProviders([
          input.nasdaq ? "NASDAQ_TRADER" : undefined,
          input.sec ? "SEC" : undefined,
          input.openFigi ? "OPENFIGI" : undefined,
          input.massive ? "MASSIVE" : undefined,
        ]),
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  } else if (
    foreignSignalNames.length > 0 &&
    record.universeBucket === "REVIEW_REQUIRED" &&
    !record.isAdr &&
    !record.isEtf
  ) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.FOREIGN_LISTING_REVIEW_REQUIRED,
        detail: { matchedNames: foreignSignalNames },
        exchange: record.exchange,
        message:
          "Foreign/listing signal kept security in REVIEW_REQUIRED until policy review.",
        providers: compactProviders([
          input.nasdaq ? "NASDAQ_TRADER" : undefined,
          input.sec ? "SEC" : undefined,
          input.openFigi ? "OPENFIGI" : undefined,
          input.massive ? "MASSIVE" : undefined,
        ]),
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (
    record.securityType === "COMMON_STOCK" &&
    record.isActive &&
    !record.cik
  ) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.MISSING_CIK,
        exchange: record.exchange,
        message: "Active common stock has no SEC CIK mapping.",
        providers: ["SEC"],
        severity: "INFO",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (
    record.securityType === "COMMON_STOCK" &&
    record.isActive &&
    !record.figi
  ) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.MISSING_FIGI,
        exchange: record.exchange,
        message: "Active common stock has no FIGI mapping in this run.",
        providers: ["OPENFIGI"],
        severity: "INFO",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (
    record.universeBucket === "US_COMMON_ALL" &&
    input.massive?.locale &&
    input.massive.locale.toLowerCase() !== "us"
  ) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.NON_US_LOCALE,
        detail: { massiveLocale: input.massive.locale },
        exchange: record.exchange,
        message:
          "Security was common-stock eligible but Massive locale was not US.",
        providers: ["MASSIVE"],
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (
    record.securityType === "UNKNOWN" &&
    record.universeBucket !== "US_ETF_ALL"
  ) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.UNEXPECTED_ASSET_TYPE,
        detail: {
          alphaType:
            input.alphaActive?.assetType ?? input.alphaDelisted?.assetType,
          figiType: input.openFigi?.securityType,
          massiveType: input.massive?.type,
          nasdaqName: input.nasdaq?.row.securityName,
        },
        exchange: record.exchange,
        message: "Security type could not be classified deterministically.",
        providers: compactProviders([
          input.nasdaq ? "NASDAQ_TRADER" : undefined,
          input.massive ? "MASSIVE" : undefined,
          input.openFigi ? "OPENFIGI" : undefined,
          (input.alphaActive ?? input.alphaDelisted)
            ? "ALPHA_VANTAGE"
            : undefined,
        ]),
        severity: "WARNING",
        ticker: record.canonicalTicker,
      }),
    );
  }

  if (record.isAdr) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.ADR_LABELED,
        exchange: record.exchange,
        message: "ADR kept out of domestic common-stock universe.",
        providers: compactProviders([
          input.openFigi ? "OPENFIGI" : undefined,
          input.massive ? "MASSIVE" : undefined,
          input.sec ? "SEC" : undefined,
        ]),
        severity: "INFO",
        ticker: record.canonicalTicker,
      }),
    );
  }

  return warnings;
}

function buildCommonUniverseInvariantWarnings(records: SecurityMasterRecord[]) {
  return records
    .filter(
      (record) =>
        record.universeBucket === "US_COMMON_ALL" &&
        (hasExplicitAdrToken(record.companyName) ||
          hasForeignListingReviewSignal(record.companyName)),
    )
    .map((record) =>
      warning({
        code: SECURITY_MASTER_REASON_CODES.COMMON_STOCK_BLOCKED_BY_FOREIGN_SIGNAL,
        detail: { companyName: record.companyName },
        exchange: record.exchange,
        message:
          "Invariant violation: review-marked security entered US_COMMON_ALL.",
        providers: ["NASDAQ_TRADER"],
        severity: "BLOCKER",
        ticker: record.canonicalTicker,
      }),
    );
}

function summarize(
  records: SecurityMasterRecord[],
  warnings: SecurityMasterWarning[],
  input: BuildSecurityMasterInput,
  skippedTestIssues: number,
  duplicateProviderSymbols: number,
): SecurityMasterSummary {
  return {
    activeCommonStocks: records.filter(
      (record) => record.universeBucket === "US_COMMON_ALL",
    ).length,
    adrs: records.filter((record) => record.universeBucket === "US_ADR_ALL")
      .length,
    alphaActiveListings: input.alphaActiveListings?.length ?? 0,
    alphaDelistedListings: input.alphaDelistedListings?.length ?? 0,
    delisted: records.filter(
      (record) => record.universeBucket === "US_DELISTED_HISTORY",
    ).length,
    duplicateProviderSymbols,
    etfs: records.filter((record) => record.universeBucket === "US_ETF_ALL")
      .length,
    massiveTickers: input.massiveTickers?.length ?? 0,
    missingCik: warnings.filter(
      (item) => item.code === SECURITY_MASTER_REASON_CODES.MISSING_CIK,
    ).length,
    missingFigi: warnings.filter(
      (item) => item.code === SECURITY_MASTER_REASON_CODES.MISSING_FIGI,
    ).length,
    nasdaqListed: input.nasdaqListed?.length ?? 0,
    openFigiMappings: input.openFigiMappings?.length ?? 0,
    otherListed: input.otherListed?.length ?? 0,
    recordsBuilt: records.length,
    reviewRequired: records.filter(
      (record) => record.universeBucket === "REVIEW_REQUIRED",
    ).length,
    secTickers: input.secTickers?.length ?? 0,
    skippedTestIssues,
    warnings: warnings.length,
  };
}

function addUniqueNasdaqSource(
  sources: Map<string, NasdaqSourceRow>,
  row: NasdaqSymbol,
  endpoint: "nasdaqlisted" | "otherlisted",
  warnings: SecurityMasterWarning[],
) {
  const ticker = normalizeTicker(row.symbol);

  if (!ticker) {
    return;
  }

  const exchange = normalizeNasdaqListedExchange(row);
  const key = `${ticker}|${exchange}`;

  if (sources.has(key)) {
    warnings.push(
      warning({
        code: SECURITY_MASTER_REASON_CODES.DUPLICATE_PROVIDER_SYMBOL,
        detail: { endpoint },
        exchange,
        message: "Duplicate Nasdaq Trader ticker/exchange row ignored.",
        providers: ["NASDAQ_TRADER"],
        severity: "WARNING",
        ticker,
      }),
    );
    return;
  }

  sources.set(key, {
    exchange,
    providerEndpoint: endpoint,
    row,
  });
}

export function buildSecurityMaster(
  input: BuildSecurityMasterInput,
): SecurityMasterBuildResult {
  const providerPayloadRefs = input.providerPayloadRefs ?? {};
  const secByTicker = firstByTicker(input.secTickers, (row) => row.ticker);
  const massiveByTicker = firstByTicker(
    input.massiveTickers,
    (row) => row.ticker,
  );
  const openFigiByTicker = firstByTicker(
    input.openFigiMappings,
    (row) => row.ticker,
  );
  const alphaActiveByTicker = firstByTicker(
    input.alphaActiveListings,
    (row) => row.symbol,
  );
  const alphaDelistedByTicker = firstByTicker(
    input.alphaDelistedListings,
    (row) => row.symbol,
  );
  const nasdaqSources = new Map<string, NasdaqSourceRow>();
  const warnings: SecurityMasterWarning[] = [];

  for (const row of input.nasdaqListed ?? []) {
    addUniqueNasdaqSource(nasdaqSources, row, "nasdaqlisted", warnings);
  }

  for (const row of input.otherListed ?? []) {
    addUniqueNasdaqSource(nasdaqSources, row, "otherlisted", warnings);
  }

  let skippedTestIssues = 0;
  const records: SecurityMasterRecord[] = [];

  for (const nasdaq of nasdaqSources.values()) {
    const ticker = normalizeTicker(nasdaq.row.symbol);

    if (!ticker) {
      continue;
    }

    if (nasdaq.row.testIssue) {
      skippedTestIssues += 1;
      warnings.push(
        warning({
          code: SECURITY_MASTER_REASON_CODES.EXCLUDED_TEST_ISSUE,
          exchange: nasdaq.exchange,
          message: "Nasdaq Trader marked symbol as a test issue.",
          providers: ["NASDAQ_TRADER"],
          severity: "INFO",
          ticker,
        }),
      );
      continue;
    }

    const record = buildRecord({
      alphaActive: alphaActiveByTicker.get(ticker),
      alphaDelisted: alphaDelistedByTicker.get(ticker),
      massive: massiveByTicker.get(ticker),
      nasdaq,
      openFigi: openFigiByTicker.get(ticker),
      providerPayloadRefs,
      sec: secByTicker.get(ticker),
    });

    if (record) {
      records.push(record);
      warnings.push(
        ...buildWarnings({
          alphaActive: alphaActiveByTicker.get(ticker),
          alphaDelisted: alphaDelistedByTicker.get(ticker),
          massive: massiveByTicker.get(ticker),
          nasdaq,
          openFigi: openFigiByTicker.get(ticker),
          record,
          sec: secByTicker.get(ticker),
        }),
      );
    }
  }

  for (const alphaDelisted of input.alphaDelistedListings ?? []) {
    const ticker = normalizeTicker(alphaDelisted.symbol);

    if (!ticker) {
      continue;
    }

    const exchange = normalizeAlphaExchange(alphaDelisted.exchange);
    const key = `${ticker}|${exchange}`;

    if (nasdaqSources.has(key)) {
      continue;
    }

    const record = buildRecord({
      alphaDelisted,
      massive: massiveByTicker.get(ticker),
      openFigi: openFigiByTicker.get(ticker),
      providerPayloadRefs,
      sec: secByTicker.get(ticker),
    });

    if (record) {
      records.push(record);
      warnings.push(
        ...buildWarnings({
          alphaDelisted,
          massive: massiveByTicker.get(ticker),
          openFigi: openFigiByTicker.get(ticker),
          record,
          sec: secByTicker.get(ticker),
        }),
      );
    }
  }

  warnings.push(...buildCommonUniverseInvariantWarnings(records));

  const summary = summarize(
    records,
    warnings,
    input,
    skippedTestIssues,
    warnings.filter(
      (item) =>
        item.code === SECURITY_MASTER_REASON_CODES.DUPLICATE_PROVIDER_SYMBOL,
    ).length,
  );

  providerPayloadRefs.NASDAQ_TRADER ??= {
    endpoint: "security_master_build",
    responseHash: hashPayload({
      nasdaqListed: input.nasdaqListed?.length ?? 0,
      otherListed: input.otherListed?.length ?? 0,
    }),
  };

  return {
    providerPayloadRefs,
    records,
    summary,
    warnings,
  };
}
