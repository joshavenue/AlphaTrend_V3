import { hashPayload } from "@/lib/evidence/hash";
import type {
  FmpCompanyScreenerRow,
  FmpEtfHolding,
} from "@/lib/providers/parsers";
import type { ThemeCompanySeedRow } from "@/lib/themes/company-seeds";
import { normalizeThemeLabel } from "@/lib/themes/catalog";
import {
  CANDIDATE_GENERATOR_VERSION,
  CANDIDATE_SOURCE_TYPES,
  type CandidateSourceInput,
} from "@/lib/candidates/types";

type ThemeSourceShape = {
  directBeneficiaryCategories: unknown;
  indirectBeneficiaryCategories: unknown;
  seedEtfs: unknown;
  sourceThemeCode: string | null;
  themeId: string;
};

type SourceDetailEntry = {
  as_of_date?: string;
  company_name?: string;
  details?: Record<string, unknown>;
  payload_id?: string;
  provider?: string;
  response_hash?: string;
  source_key: string;
  source_type: string;
  source_url_or_endpoint?: string;
  source_weight?: number;
  ticker: string;
};

type CandidateSourceDetail = {
  generator_version: string;
  last_generated_at: string;
  last_job_run_id?: string;
  source_count: number;
  source_types: string[];
  sources: SourceDetailEntry[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function significantTokens(value: string) {
  return (
    normalizeThemeLabel(value)
      .split(/\s+/)
      // Short tokens like AI, EV, and 5G are intentionally ignored here; Phase 6
      // exposure scoring owns those high-noise theme anchors.
      .filter((token) => token.length >= 3)
      .filter(
        (token) =>
          !["and", "the", "with", "for", "only", "generic", "revenue"].includes(
            token,
          ),
      )
  );
}

function sourceTypeSort(left: string, right: string) {
  return left.localeCompare(right);
}

export function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
}

export function candidateSourceHash(source: CandidateSourceInput) {
  return hashPayload({
    asOfDate: source.asOfDate,
    details: source.details,
    provider: source.provider,
    responseHash: source.responseHash,
    sourceKey: source.sourceKey,
    sourceType: source.sourceType,
    sourceUrlOrEndpoint: source.sourceUrlOrEndpoint,
    ticker: normalizeTicker(source.ticker),
  });
}

function sourceEntry(source: CandidateSourceInput): SourceDetailEntry {
  return {
    as_of_date: source.asOfDate,
    company_name: source.companyName,
    details: source.details,
    payload_id: source.payloadId,
    provider: source.provider,
    response_hash: source.responseHash,
    source_key: source.sourceKey,
    source_type: source.sourceType,
    source_url_or_endpoint: source.sourceUrlOrEndpoint,
    source_weight: source.sourceWeight,
    ticker: normalizeTicker(source.ticker),
  };
}

function existingSources(sourceDetail: unknown): SourceDetailEntry[] {
  const detail = asRecord(sourceDetail);
  const sources = Array.isArray(detail.sources) ? detail.sources : [];

  return sources
    .map((entry) => asRecord(entry))
    .flatMap((entry) => {
      const sourceKey = asString(entry.source_key);
      const sourceType = asString(entry.source_type);
      const ticker = asString(entry.ticker);

      if (!sourceKey || !sourceType || !ticker) {
        return [];
      }

      return [
        {
          as_of_date: asString(entry.as_of_date),
          company_name: asString(entry.company_name),
          details: asRecord(entry.details),
          payload_id: asString(entry.payload_id),
          provider: asString(entry.provider),
          response_hash: asString(entry.response_hash),
          source_key: sourceKey,
          source_type: sourceType,
          source_url_or_endpoint: asString(entry.source_url_or_endpoint),
          source_weight:
            typeof entry.source_weight === "number"
              ? entry.source_weight
              : undefined,
          ticker,
        },
      ];
    });
}

export function mergeCandidateSourceDetails(
  existingDetail: unknown,
  sources: CandidateSourceInput[],
  jobRunId?: string,
  generatedAt = new Date(),
): CandidateSourceDetail {
  const merged = new Map<string, SourceDetailEntry>();

  for (const entry of existingSources(existingDetail)) {
    merged.set(`${entry.source_type}:${entry.source_key}`, entry);
  }

  for (const source of sources) {
    const entry = sourceEntry(source);

    merged.set(`${entry.source_type}:${entry.source_key}`, entry);
  }

  const sourceEntries = [...merged.values()].sort((left, right) =>
    `${left.source_type}:${left.source_key}`.localeCompare(
      `${right.source_type}:${right.source_key}`,
    ),
  );
  const sourceTypes = [
    ...new Set(sourceEntries.map((entry) => entry.source_type)),
  ].sort(sourceTypeSort);

  return {
    generator_version: CANDIDATE_GENERATOR_VERSION,
    last_generated_at: generatedAt.toISOString(),
    last_job_run_id: jobRunId,
    source_count: sourceEntries.length,
    source_types: sourceTypes,
    sources: sourceEntries,
  };
}

export function sourceOfInclusionFromDetail(sourceDetail: unknown) {
  const sourceTypes = asRecord(sourceDetail).source_types;

  if (!Array.isArray(sourceTypes) || sourceTypes.length === 0) {
    // Defensive fallback only; normal persistence always passes at least one source.
    return CANDIDATE_SOURCE_TYPES.MANUAL_SEED_FOR_API_VALIDATION;
  }

  return sourceTypes.length === 1 ? String(sourceTypes[0]) : "MULTI_SOURCE";
}

export function hasProviderSource(sourceDetail: unknown) {
  return existingSources(sourceDetail).some(
    (source) =>
      source.source_type !==
      CANDIDATE_SOURCE_TYPES.MANUAL_SEED_FOR_API_VALIDATION,
  );
}

export function seedEtfsFromTheme(theme: ThemeSourceShape) {
  const seedEtfs = Array.isArray(theme.seedEtfs) ? theme.seedEtfs : [];

  return seedEtfs.flatMap((entry) => {
    const record = asRecord(entry);
    const symbol = asString(record.symbol);

    if (!symbol) {
      return [];
    }

    return [
      {
        holdingsEndpoint: asString(record.holdings_endpoint),
        provider: asString(record.provider) ?? "FMP",
        role: asString(record.role) ?? "candidate_seed",
        symbol: normalizeTicker(symbol),
      },
    ];
  });
}

export function manualSeedSourcesForTheme(
  theme: ThemeSourceShape,
  rows: ThemeCompanySeedRow[],
): CandidateSourceInput[] {
  const themeCode = theme.sourceThemeCode;

  if (!themeCode) {
    return [];
  }

  return rows
    .filter((row) => row.themeCode === themeCode)
    .map((row) => ({
      companyName: row.companyName,
      details: {
        api_retrievable: row.apiRetrievable,
        api_validation_priority: row.apiValidationPriority,
        candidate_rank_within_theme: row.candidateRankWithinTheme,
        candidate_role: row.candidateRole,
        initial_inclusion_method: row.initialInclusionMethod,
        must_pass_alpha_trend_gates: row.mustPassAlphaTrendGates,
        notes: row.notes,
        source_csv_row_number: row.sourceRowNumber,
      },
      sourceKey: `manual_seed:${themeCode}:${normalizeTicker(row.ticker)}`,
      sourceType: CANDIDATE_SOURCE_TYPES.MANUAL_SEED_FOR_API_VALIDATION,
      themeCode,
      themeId: theme.themeId,
      ticker: row.ticker,
    }));
}

export function etfHoldingSourcesForTheme(
  theme: ThemeSourceShape,
  etfSymbol: string,
  holdings: FmpEtfHolding[],
  payload: {
    payloadId?: string;
    responseHash?: string;
    sourceUrlOrEndpoint?: string;
  } = {},
): CandidateSourceInput[] {
  const themeCode = theme.sourceThemeCode ?? theme.themeId;

  return holdings.map((holding) => ({
    asOfDate: holding.asOfDate,
    companyName: holding.holdingName,
    details: {
      etf_symbol: normalizeTicker(etfSymbol),
      market_value: holding.marketValue,
      shares: holding.shares,
    },
    payloadId: payload.payloadId,
    provider: "FMP",
    responseHash: payload.responseHash,
    sourceKey: `etf_holding:${normalizeTicker(etfSymbol)}:${normalizeTicker(
      holding.symbol,
    )}`,
    sourceType: CANDIDATE_SOURCE_TYPES.SEED_ETF_HOLDING,
    sourceUrlOrEndpoint: payload.sourceUrlOrEndpoint,
    sourceWeight: holding.weight,
    themeCode,
    themeId: theme.themeId,
    ticker: holding.symbol,
  }));
}

function categoryLabels(theme: ThemeSourceShape) {
  const values = [
    ...(Array.isArray(theme.directBeneficiaryCategories)
      ? theme.directBeneficiaryCategories
      : []),
    ...(Array.isArray(theme.indirectBeneficiaryCategories)
      ? theme.indirectBeneficiaryCategories
      : []),
  ];

  return values
    .map((entry) => asRecord(entry))
    .flatMap((entry) => {
      const label =
        asString(entry.normalized_label) ?? asString(entry.display_label);

      return label ? [label] : [];
    });
}

function matchThemeCategory(theme: ThemeSourceShape, text: string) {
  const normalizedText = normalizeThemeLabel(text);

  for (const category of categoryLabels(theme)) {
    const normalizedCategory = normalizeThemeLabel(category);

    if (normalizedText.includes(normalizedCategory)) {
      return normalizedCategory;
    }

    const tokens = significantTokens(normalizedCategory);

    if (
      tokens.length > 0 &&
      tokens.every((token) => normalizedText.includes(token))
    ) {
      return normalizedCategory;
    }
  }

  return undefined;
}

export function fmpScreenerSourcesForTheme(
  theme: ThemeSourceShape,
  rows: FmpCompanyScreenerRow[],
  payload: {
    payloadId?: string;
    responseHash?: string;
    sourceUrlOrEndpoint?: string;
  } = {},
): CandidateSourceInput[] {
  const themeCode = theme.sourceThemeCode ?? theme.themeId;
  const sources: CandidateSourceInput[] = [];

  for (const row of rows) {
    const industryMatch = matchThemeCategory(theme, row.industry ?? "");
    const sectorMatch = matchThemeCategory(theme, row.sector ?? "");
    const companyMatch = matchThemeCategory(theme, row.companyName ?? "");
    const match = industryMatch ?? sectorMatch ?? companyMatch;

    if (!match) {
      continue;
    }

    sources.push({
      companyName: row.companyName,
      details: {
        company_name: row.companyName,
        exchange_short_name: row.exchangeShortName,
        industry: row.industry,
        market_cap: row.marketCap,
        matched_category: match,
        match_basis: industryMatch
          ? "industry"
          : sectorMatch
            ? "sector"
            : "company_name",
        sector: row.sector,
      },
      payloadId: payload.payloadId,
      provider: "FMP",
      responseHash: payload.responseHash,
      sourceKey: `fmp_screener:${match}:${normalizeTicker(row.symbol)}`,
      sourceType: industryMatch
        ? CANDIDATE_SOURCE_TYPES.FMP_SCREENER_INDUSTRY_MATCH
        : CANDIDATE_SOURCE_TYPES.FMP_SCREENER_SECTOR_MATCH,
      sourceUrlOrEndpoint: payload.sourceUrlOrEndpoint,
      themeCode,
      themeId: theme.themeId,
      ticker: row.symbol,
    });
  }

  return sources;
}
