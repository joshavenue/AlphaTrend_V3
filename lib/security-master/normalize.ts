import type { SecurityType, UniverseBucket } from "@/lib/domain/types";
import type {
  AlphaVantageListing,
  MassiveTicker,
  NasdaqSymbol,
  OpenFigiMapping,
} from "@/lib/providers/parsers";

const MIC_BY_EXCHANGE: Record<string, string> = {
  CBOE_BZX: "BATS",
  IEX: "IEXG",
  NASDAQ: "XNAS",
  NYSE: "XNYS",
  NYSE_AMERICAN: "XASE",
  NYSE_ARCA: "ARCX",
};

const OTHER_LISTED_EXCHANGE_BY_CODE: Record<string, string> = {
  A: "NYSE_AMERICAN",
  C: "NYSE_NATIONAL",
  I: "IEX",
  N: "NYSE",
  P: "NYSE_ARCA",
  V: "IEX",
  Z: "CBOE_BZX",
};

const ALPHA_EXCHANGE_BY_NAME: Record<string, string> = {
  AMEX: "NYSE_AMERICAN",
  BATS: "CBOE_BZX",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  "NYSE ARCA": "NYSE_ARCA",
  "NYSE MKT": "NYSE_AMERICAN",
};

const MASSIVE_EXCHANGE_BY_MIC: Record<string, string> = {
  ARCX: "NYSE_ARCA",
  BATS: "CBOE_BZX",
  IEXG: "IEX",
  XASE: "NYSE_AMERICAN",
  XNAS: "NASDAQ",
  XNYS: "NYSE",
};

function upper(value: string | undefined) {
  return value?.trim().toUpperCase();
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function firstType<T extends SecurityType | undefined>(values: T[]) {
  return values.find((value): value is Exclude<T, undefined> => Boolean(value));
}

export function normalizeTicker(value: string | undefined) {
  const ticker = value?.trim().toUpperCase().replace(/\s+/g, "");
  return ticker === "" ? undefined : ticker;
}

export function normalizeCik(value: string | undefined) {
  const digits = value?.replace(/\D/g, "");

  if (!digits) {
    return undefined;
  }

  return digits.padStart(10, "0").slice(-10);
}

export function parseListingDate(value: string | undefined) {
  const normalized = value?.trim();

  if (
    !normalized ||
    normalized.toLowerCase() === "null" ||
    normalized === "0000-00-00"
  ) {
    return undefined;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function normalizeNasdaqListedExchange(row: NasdaqSymbol) {
  if (row.exchange) {
    return normalizeOtherListedExchange(row.exchange);
  }

  return "NASDAQ";
}

export function normalizeOtherListedExchange(value: string | undefined) {
  const code = upper(value);

  if (!code) {
    return "UNKNOWN";
  }

  return OTHER_LISTED_EXCHANGE_BY_CODE[code] ?? code.replace(/\s+/g, "_");
}

export function normalizeAlphaExchange(value: string | undefined) {
  const exchange = upper(value);

  if (!exchange) {
    return "UNKNOWN";
  }

  return ALPHA_EXCHANGE_BY_NAME[exchange] ?? exchange.replace(/\s+/g, "_");
}

export function exchangeFromMassiveTicker(row: MassiveTicker | undefined) {
  const mic = upper(row?.primaryExchange);

  if (!mic) {
    return undefined;
  }

  return MASSIVE_EXCHANGE_BY_MIC[mic] ?? mic;
}

export function micForExchange(exchange: string, massive?: MassiveTicker) {
  return upper(massive?.primaryExchange) ?? MIC_BY_EXCHANGE[exchange];
}

export function cleanCompanyName(value: string | undefined) {
  const name = value
    ?.replace(/\s+-\s+Common Stock$/i, "")
    .replace(/\s+-\s+Class [A-Z] Common Stock$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return name === "" ? undefined : name;
}

function allNames(input: {
  companyName?: string;
  nasdaq?: NasdaqSymbol;
  massive?: MassiveTicker;
  openFigi?: OpenFigiMapping;
  alpha?: AlphaVantageListing;
}) {
  return [
    input.companyName,
    input.nasdaq?.securityName,
    input.massive?.name,
    input.openFigi?.name,
    input.alpha?.name,
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function hasExplicitAdrToken(value: string | undefined) {
  const name = upper(value);

  if (!name) {
    return false;
  }

  return (
    /\bAMERICAN\s+DEPOSITARY\s+(SHARES?|RECEIPTS?)\b/.test(name) ||
    /(^|[\s(,])ADR($|[\s),.])/.test(name) ||
    /(^|[\s(,])ADS($|[\s),.])/.test(name)
  );
}

function isAdrName(name: string) {
  return hasExplicitAdrToken(name);
}

export function hasForeignListingReviewSignal(value: string | undefined) {
  const name = upper(value);

  if (!name) {
    return false;
  }

  return [
    /\bNEW\s+YORK\s+REGISTRY\s+SHARES?\b/,
    /\bREGISTRY\s+SHARES?\b/,
    /\bGLOBAL\s+DEPOSITARY\s+(SHARES?|RECEIPTS?)\b/,
    /\bORDINARY\s+SHARES?\b/,
    /\bSUBORDINATE\s+VOTING\s+SHARES?\b/,
    /\bVARIABLE\s+VOTING\s+SHARES?\b/,
    /\bLIMITED\s+VOTING\s+SHARES?\b/,
    /\bA\/S\b/,
    /\bA\s+S\b/,
    /\bN\.?V\.?\b/,
    /\bS\.?A\.?\b/,
    /\bS\.?P\.?A\.?\b/,
    /\bP\.?L\.?C\.?\b/,
    /\bPLC\b/,
    /\bLTD\.?\b/,
    /\bLIMITED\b/,
    /\bGMBH\b/,
    /\bAG\b/,
    /\bAB\b/,
    /\bASA\b/,
    /\bOYJ\b/,
    /\bSE\b/,
    /\bCORP\/\b/,
    /\bCORP\/$/,
    /\/[A-Z]{2}\b/,
  ].some((pattern) => pattern.test(name));
}

function typeFromMassive(value: string | undefined) {
  const type = upper(value);

  if (!type) {
    return undefined;
  }

  if (["ETF", "ETS"].includes(type)) {
    return "ETF" as const;
  }

  if (["ETN"].includes(type)) {
    return "ETN" as const;
  }

  if (["ADRC", "ADRP"].includes(type)) {
    return "ADR" as const;
  }

  if (["PFD"].includes(type)) {
    return "PREFERRED" as const;
  }

  if (["WARRANT", "WAR"].includes(type)) {
    return "WARRANT" as const;
  }

  if (["RIGHT"].includes(type)) {
    return "RIGHT" as const;
  }

  if (["UNIT"].includes(type)) {
    return "UNIT" as const;
  }

  if (["CS", "COMMON", "COMMON_STOCK", "STOCK"].includes(type)) {
    return "COMMON_STOCK" as const;
  }

  return undefined;
}

function typeFromFigi(value: string | undefined) {
  const type = upper(value);

  if (!type) {
    return undefined;
  }

  if (type.includes("ETF")) {
    return "ETF" as const;
  }

  if (type.includes("ETN")) {
    return "ETN" as const;
  }

  if (type.includes("PREFERRED")) {
    return "PREFERRED" as const;
  }

  if (hasExplicitAdrToken(type)) {
    return "ADR" as const;
  }

  if (type.includes("WARRANT")) {
    return "WARRANT" as const;
  }

  if (type.includes("RIGHT")) {
    return "RIGHT" as const;
  }

  if (type.includes("UNIT")) {
    return "UNIT" as const;
  }

  if (type.includes("COMMON STOCK") || type === "COMMON") {
    return "COMMON_STOCK" as const;
  }

  return undefined;
}

function typeFromAlpha(value: string | undefined) {
  const type = upper(value);

  if (!type) {
    return undefined;
  }

  if (type.includes("ETF")) {
    return "ETF" as const;
  }

  if (type.includes("ETN")) {
    return "ETN" as const;
  }

  if (type.includes("STOCK")) {
    return "COMMON_STOCK" as const;
  }

  return undefined;
}

function excludedTypeFromName(value: string | undefined) {
  const name = upper(value);

  if (!name) {
    return undefined;
  }

  if (includesAny(name, [" ETN", "EXCHANGE TRADED NOTE"])) {
    return "ETN" as const;
  }

  if (includesAny(name, [" ETF", "EXCHANGE TRADED FUND"])) {
    return "ETF" as const;
  }

  if (
    includesAny(name, ["CLOSED-END", "CLOSED END"]) ||
    /\bFUND\b/.test(name)
  ) {
    return "CLOSED_END_FUND" as const;
  }

  if (includesAny(name, ["PREFERRED", " PFD", " PREFER"])) {
    return "PREFERRED" as const;
  }

  if (includesAny(name, ["WARRANT", " WT", " WTS"])) {
    return "WARRANT" as const;
  }

  if (includesAny(name, ["RIGHT", " RTS"])) {
    return "RIGHT" as const;
  }

  if (name.endsWith(" UNIT") || name.includes(" UNITS")) {
    return name.includes("ACQUISITION") || name.includes("SPAC")
      ? ("SPAC_UNIT" as const)
      : ("UNIT" as const);
  }

  return undefined;
}

function commonTypeFromName(value: string | undefined) {
  const name = upper(value);

  if (!name) {
    return undefined;
  }

  if (
    includesAny(name, [
      "COMMON STOCK",
      "ORDINARY SHARES",
      "REGISTRY SHARES",
      "VOTING SHARES",
    ])
  ) {
    return "COMMON_STOCK" as const;
  }

  return undefined;
}

function typeFromName(value: string | undefined) {
  const excludedType = excludedTypeFromName(value);

  if (excludedType) {
    return excludedType;
  }

  const name = upper(value);

  if (!name) {
    return undefined;
  }

  if (isAdrName(name)) {
    return "ADR" as const;
  }

  return commonTypeFromName(value);
}

function firstNameType(values: Array<string | undefined>) {
  for (const value of values) {
    const type = typeFromName(value);

    if (type) {
      return type;
    }
  }

  return undefined;
}

export function classifySecurityType(input: {
  nasdaq?: NasdaqSymbol;
  massive?: MassiveTicker;
  openFigi?: OpenFigiMapping;
  alpha?: AlphaVantageListing;
  companyName?: string;
}): SecurityType {
  if (input.nasdaq?.etf === true) {
    return "ETF";
  }

  const names = allNames(input);
  const excludedNameType = firstType(names.map(excludedTypeFromName));
  const providerType = firstType([
    typeFromMassive(input.massive?.type),
    typeFromFigi(input.openFigi?.securityType),
    typeFromAlpha(input.alpha?.assetType),
  ]);
  const explicitAdr =
    names.some(hasExplicitAdrToken) ||
    typeFromMassive(input.massive?.type) === "ADR" ||
    typeFromFigi(input.openFigi?.securityType) === "ADR";
  const commonNameType = firstType(names.map(commonTypeFromName));

  if (excludedNameType) {
    return excludedNameType;
  }

  if (explicitAdr || providerType === "ADR") {
    return "ADR";
  }

  if (commonNameType || providerType === "COMMON_STOCK") {
    return "COMMON_STOCK";
  }

  if (providerType) {
    return providerType;
  }

  const inferred = firstNameType(names);

  return inferred ?? "UNKNOWN";
}

export function isAdrSecurity(input: {
  securityType: SecurityType;
  isEtf?: boolean;
  companyName?: string;
  nasdaq?: NasdaqSymbol;
  massive?: MassiveTicker;
  openFigi?: OpenFigiMapping;
}) {
  if (input.isEtf || input.securityType === "ETF") {
    return false;
  }

  const names = allNames(input);

  return (
    input.securityType === "ADR" ||
    typeFromMassive(input.massive?.type) === "ADR" ||
    typeFromFigi(input.openFigi?.securityType) === "ADR" ||
    names.some(hasExplicitAdrToken)
  );
}

export function requiresForeignListingReview(input: {
  securityType: SecurityType;
  isAdr: boolean;
  isEtf: boolean;
  companyName?: string;
  nasdaq?: NasdaqSymbol;
  massive?: MassiveTicker;
  openFigi?: OpenFigiMapping;
  alpha?: AlphaVantageListing;
}) {
  if (input.securityType !== "COMMON_STOCK" || input.isAdr || input.isEtf) {
    return false;
  }

  return allNames(input).some(hasForeignListingReviewSignal);
}

export function assignUniverseBucket(input: {
  securityType: SecurityType;
  isActive: boolean;
  isTestIssue: boolean;
  isEtf: boolean;
  isAdr: boolean;
  isDelisted: boolean;
  foreignListingReviewRequired?: boolean;
}): UniverseBucket {
  if (input.isDelisted || !input.isActive) {
    return "US_DELISTED_HISTORY";
  }

  if (input.isTestIssue) {
    return "REVIEW_REQUIRED";
  }

  if (input.isEtf) {
    return "US_ETF_ALL";
  }

  if (input.isAdr) {
    return "US_ADR_ALL";
  }

  if (input.foreignListingReviewRequired) {
    return "REVIEW_REQUIRED";
  }

  if (input.securityType === "COMMON_STOCK") {
    return "US_COMMON_ALL";
  }

  return "REVIEW_REQUIRED";
}
