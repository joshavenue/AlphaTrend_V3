import type {
  BeneficiaryType,
  CandidateStatus,
} from "@/generated/prisma/client";
import { hashPayload } from "@/lib/evidence/hash";
import {
  T1_CAPS,
  T1_DISPLAY_GROUPS,
  T1_EXPOSURE_ALGORITHM_VERSION,
  T1_EXPOSURE_THRESHOLD_VERSION,
  T1_REASON_CODES,
} from "@/lib/exposure/constants";
import type {
  ExposureCategory,
  ExposureCategoryMatch,
  ExposureScoringInput,
  ExposureScoreComponents,
  ExposureScoreResult,
  ExposureSourceKind,
  ExposureTextSource,
} from "@/lib/exposure/types";

const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "of",
  "for",
  "with",
  "to",
  "in",
  "by",
  "from",
  "company",
  "companies",
  "technology",
  "technologies",
  "solutions",
  "services",
  "products",
  "platform",
  "business",
]);

const GENERIC_THEME_WORDS = new Set([
  "ai",
  "cloud",
  "defense",
  "energy",
  "industrial",
  "semiconductor",
  "software",
  "technology",
]);

const MATERIALITY_WORDS = [
  "core",
  "leading",
  "majority",
  "primary",
  "principal",
  "substantial",
];

const EARLY_STAGE_WORDS = [
  "early stage",
  "emerging",
  "exploratory",
  "partnership",
  "pilot",
  "small",
];

const END_MARKET_WORDS = [
  "aerospace",
  "data center",
  "defense",
  "electric utility",
  "government",
  "hyperscale",
  "military",
  "nuclear",
  "power",
  "reactor",
  "storage",
];

const GLOBAL_SYNONYMS: Record<string, string[]> = {
  "custom asic": ["application specific integrated circuit", "custom silicon"],
  drone: ["uav", "unmanned aircraft", "unmanned system"],
  eda: ["electronic design automation"],
  gpu: ["accelerator", "ai accelerator", "graphics processor"],
  hbm: ["high bandwidth memory"],
  nand: ["flash memory", "flash storage"],
  nuclear: ["reactor", "uranium fuel"],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function singularizeToken(token: string) {
  if (token.length <= 3) {
    return token;
  }

  if (token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

export function normalizeExposureText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}

function tokens(value: string) {
  return normalizeExposureText(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token));
}

function categoryLabel(entry: unknown) {
  const record = asRecord(entry);

  return (
    asString(record.normalized_label) ??
    asString(record.display_label) ??
    asString(record.label) ??
    asString(record.name) ??
    (typeof entry === "string" ? entry : undefined)
  );
}

function categorySynonyms(entry: unknown, normalizedLabel: string) {
  const record = asRecord(entry);
  const localSynonyms = Array.isArray(record.synonyms)
    ? record.synonyms.flatMap((value) =>
        typeof value === "string" ? [normalizeExposureText(value)] : [],
      )
    : [];
  const globalSynonyms = GLOBAL_SYNONYMS[normalizedLabel] ?? [];

  return [...new Set([...localSynonyms, ...globalSynonyms])].filter(Boolean);
}

function categoriesFrom(
  values: unknown,
  type: ExposureCategory["type"],
): ExposureCategory[] {
  const entries = Array.isArray(values) ? values : [];

  return entries.flatMap((entry) => {
    const label = categoryLabel(entry);

    if (!label) {
      return [];
    }

    const normalizedLabel = normalizeExposureText(label);

    return [
      {
        displayLabel: label,
        normalizedLabel,
        synonyms: categorySynonyms(entry, normalizedLabel),
        type,
      },
    ];
  });
}

function sourceDetails(sourceDetail: unknown) {
  const sources = asRecord(sourceDetail).sources;

  return Array.isArray(sources) ? sources.map(asRecord) : [];
}

function textSource(
  kind: ExposureSourceKind,
  label: string,
  text: string | undefined,
  provider?: ExposureTextSource["provider"],
): ExposureTextSource[] {
  const normalized = text?.trim();

  return normalized ? [{ kind, label, provider, text: normalized }] : [];
}

function exposureTextSources(input: ExposureScoringInput) {
  const sources: ExposureTextSource[] = [
    ...textSource(
      "company_name",
      "security.company_name",
      input.security.companyName,
    ),
  ];

  if (input.fmpProfile) {
    sources.push(
      ...textSource(
        "provider_profile",
        "fmp.profile.company_name",
        input.fmpProfile.companyName,
        "FMP",
      ),
      ...textSource(
        "provider_profile",
        "fmp.profile.industry",
        input.fmpProfile.industry,
        "FMP",
      ),
      ...textSource(
        "provider_profile",
        "fmp.profile.sector",
        input.fmpProfile.sector,
        "FMP",
      ),
      ...textSource(
        "provider_profile",
        "fmp.profile.description",
        input.fmpProfile.description,
        "FMP",
      ),
    );
  }

  if (input.secCompanyFacts?.revenueFactTags.length) {
    sources.push({
      kind: "sec_companyfacts",
      label: "sec.companyfacts.revenue_tags",
      provider: "SEC",
      text: input.secCompanyFacts.revenueFactTags.join(" "),
    });
  }

  if (input.manualSeed) {
    sources.push(
      ...textSource(
        "manual_seed",
        "manual_seed.beneficiary_type",
        input.manualSeed.beneficiaryType,
        "ALPHATREND_INTERNAL",
      ),
      ...textSource(
        "manual_seed",
        "manual_seed.candidate_role",
        input.manualSeed.candidateRole,
        "ALPHATREND_INTERNAL",
      ),
      ...textSource(
        "manual_seed",
        "manual_seed.notes",
        input.manualSeed.notes,
        "ALPHATREND_INTERNAL",
      ),
    );
  }

  for (const source of sourceDetails(input.candidate.sourceDetail)) {
    const details = asRecord(source.details);
    const sourceType = asString(source.source_type) ?? "unknown";
    const provider = asString(
      source.provider,
    ) as ExposureTextSource["provider"];
    const kind: ExposureSourceKind = sourceType.startsWith("FMP_SCREENER_")
      ? "provider_screener"
      : sourceType === "SEED_ETF_HOLDING"
        ? "seed_etf"
        : "manual_seed";

    sources.push(
      ...textSource(
        kind,
        `${sourceType}.company_name`,
        asString(source.company_name),
        provider,
      ),
      ...textSource(
        kind,
        `${sourceType}.candidate_role`,
        asString(details.candidate_role),
        provider,
      ),
      ...textSource(
        kind,
        `${sourceType}.beneficiary_type`,
        asString(details.beneficiary_type),
        provider,
      ),
      ...textSource(
        kind,
        `${sourceType}.industry`,
        asString(details.industry),
        provider,
      ),
      ...textSource(
        kind,
        `${sourceType}.sector`,
        asString(details.sector),
        provider,
      ),
      ...textSource(
        kind,
        `${sourceType}.matched_category`,
        asString(details.matched_category),
        provider,
      ),
      ...textSource(
        kind,
        `${sourceType}.notes`,
        asString(details.notes),
        provider,
      ),
    );
  }

  return sources;
}

function sourceIsProviderBusinessLine(source: ExposureTextSource) {
  return (
    source.kind === "provider_profile" || source.kind === "provider_screener"
  );
}

function sourceIsSectorOnly(source: ExposureTextSource) {
  return source.label.includes("sector") || source.label.includes("industry");
}

function sourceWeight(source: ExposureTextSource) {
  if (source.kind === "provider_profile") {
    return 4;
  }

  if (source.kind === "provider_screener") {
    return sourceIsSectorOnly(source) ? 2 : 3;
  }

  if (source.kind === "manual_seed") {
    return 1;
  }

  if (source.kind === "seed_etf") {
    return 1;
  }

  return 0;
}

function matchCategory(
  category: ExposureCategory,
  source: ExposureTextSource,
): ExposureCategoryMatch | undefined {
  const normalizedText = normalizeExposureText(source.text);

  if (
    category.normalizedLabel &&
    normalizedText.includes(category.normalizedLabel)
  ) {
    return {
      category,
      matchedText: category.normalizedLabel,
      source,
      strength: "phrase",
    };
  }

  for (const synonym of category.synonyms) {
    if (normalizedText.includes(synonym)) {
      return {
        category,
        matchedText: synonym,
        source,
        strength: "synonym",
      };
    }
  }

  const categoryTokens = tokens(category.normalizedLabel);
  const sourceTokens = new Set(tokens(normalizedText));
  const matchedTokens = categoryTokens.filter((token) =>
    sourceTokens.has(token),
  );

  if (categoryTokens.length === 1 && matchedTokens.length === 1) {
    return {
      category,
      matchedText: matchedTokens[0],
      source,
      strength: "token",
    };
  }

  if (categoryTokens.length === 2 && matchedTokens.length === 2) {
    return {
      category,
      matchedText: matchedTokens.join(" "),
      source,
      strength: "token",
    };
  }

  if (
    categoryTokens.length >= 3 &&
    matchedTokens.length / categoryTokens.length >= 0.6
  ) {
    return {
      category,
      matchedText: matchedTokens.join(" "),
      source,
      strength: "token",
    };
  }

  return undefined;
}

function bestMatchWeight(match: ExposureCategoryMatch) {
  const strength =
    match.strength === "phrase" ? 3 : match.strength === "synonym" ? 2 : 1;

  return sourceWeight(match.source) * 10 + strength;
}

function uniqueMatches(matches: ExposureCategoryMatch[]) {
  const byKey = new Map<string, ExposureCategoryMatch>();

  for (const match of matches) {
    const key = `${match.category.type}:${match.category.normalizedLabel}`;
    const existing = byKey.get(key);

    if (!existing || bestMatchWeight(match) > bestMatchWeight(existing)) {
      byKey.set(key, match);
    }
  }

  return [...byKey.values()];
}

function categoryMatches(
  categories: ExposureCategory[],
  sources: ExposureTextSource[],
) {
  return uniqueMatches(
    categories.flatMap((category) =>
      sources.flatMap((source) => {
        const match = matchCategory(category, source);

        return match ? [match] : [];
      }),
    ),
  );
}

function includesMateriality(text: string) {
  const normalized = normalizeExposureText(text);

  return MATERIALITY_WORDS.some((word) => normalized.includes(word));
}

function includesEarlyStage(text: string) {
  const normalized = normalizeExposureText(text);

  return EARLY_STAGE_WORDS.some((word) => normalized.includes(word));
}

function hasGenericKeywordOnly(matches: ExposureCategoryMatch[]) {
  return (
    matches.length > 0 &&
    matches.every(
      (match) =>
        GENERIC_THEME_WORDS.has(match.matchedText) ||
        GENERIC_THEME_WORDS.has(match.category.normalizedLabel),
    )
  );
}

function hasProviderDirectBusinessLine(matches: ExposureCategoryMatch[]) {
  return matches.some(
    (match) =>
      match.category.type === "direct" &&
      sourceIsProviderBusinessLine(match.source) &&
      !sourceIsSectorOnly(match.source),
  );
}

function hasManualOnlySupport(
  positiveMatches: ExposureCategoryMatch[],
  sources: ExposureTextSource[],
) {
  if (positiveMatches.length > 0) {
    return positiveMatches.every(
      (match) => match.source.kind === "manual_seed",
    );
  }

  const materialSources = sources.filter(
    (source) => source.kind !== "company_name" && source.text.trim(),
  );

  return (
    materialSources.length > 0 &&
    materialSources.every((source) => source.kind === "manual_seed")
  );
}

function sourceDetailHasProviderSource(sourceDetail: unknown) {
  return sourceDetails(sourceDetail).some((source) => {
    const sourceType = asString(source.source_type);

    return Boolean(
      sourceType && sourceType !== "MANUAL_SEED_FOR_API_VALIDATION",
    );
  });
}

function etfMembershipScore(input: ExposureScoringInput) {
  const seedEtfs = new Set(
    (Array.isArray(input.theme.seedEtfs) ? input.theme.seedEtfs : []).flatMap(
      (entry) => {
        const symbol = asString(asRecord(entry).symbol);

        return symbol ? [symbol.toUpperCase()] : [];
      },
    ),
  );
  const memberships = sourceDetails(input.candidate.sourceDetail).flatMap(
    (source) => {
      if (asString(source.source_type) !== "SEED_ETF_HOLDING") {
        return [];
      }

      const details = asRecord(source.details);
      const etfSymbol = asString(details.etf_symbol)?.toUpperCase();
      const weight =
        typeof source.source_weight === "number" ? source.source_weight : 0;

      return etfSymbol && seedEtfs.has(etfSymbol)
        ? [{ etfSymbol, weight }]
        : [];
    },
  );
  const meaningful = memberships.filter((membership) => membership.weight >= 1);
  const uniqueMeaningfulEtfs = new Set(
    meaningful.map((membership) => membership.etfSymbol),
  );

  if (uniqueMeaningfulEtfs.size >= 2) {
    return {
      reasonCode: T1_REASON_CODES.MULTI_ETF_INCLUDED,
      score: 10,
      text: [...uniqueMeaningfulEtfs].sort().join(", "),
    };
  }

  if (uniqueMeaningfulEtfs.size === 1) {
    return {
      reasonCode: T1_REASON_CODES.SEED_ETF_INCLUDED,
      score: 7,
      text: [...uniqueMeaningfulEtfs][0],
    };
  }

  if (memberships.length > 0) {
    return {
      reasonCode: T1_REASON_CODES.SEED_ETF_INCLUDED,
      score: 4,
      text: memberships.map((membership) => membership.etfSymbol).join(", "),
    };
  }

  return {
    score: 0,
  };
}

function sourceText(matches: ExposureCategoryMatch[]) {
  return matches.map((match) => match.source.text).join(" ");
}

function computeComponents(input: ExposureScoringInput) {
  const sources = exposureTextSources(input);
  const categories = [
    ...categoriesFrom(input.theme.excludedCategories, "excluded"),
    ...categoriesFrom(input.theme.directBeneficiaryCategories, "direct"),
    ...categoriesFrom(input.theme.indirectBeneficiaryCategories, "indirect"),
  ];
  const matches = categoryMatches(categories, sources);
  const directMatches = matches.filter(
    (match) => match.category.type === "direct",
  );
  const indirectMatches = matches.filter(
    (match) => match.category.type === "indirect",
  );
  const excludedMatches = matches.filter(
    (match) => match.category.type === "excluded",
  );
  const providerDirectMatches = directMatches.filter((match) =>
    sourceIsProviderBusinessLine(match.source),
  );
  const providerDirectBusinessLineMatches = providerDirectMatches.filter(
    (match) => !sourceIsSectorOnly(match.source),
  );
  const manualDirectMatches = directMatches.filter(
    (match) => match.source.kind === "manual_seed",
  );
  const providerIndirectMatches = indirectMatches.filter((match) =>
    sourceIsProviderBusinessLine(match.source),
  );
  const allPositiveMatches = [...directMatches, ...indirectMatches];
  const allPositiveSourceText = sourceText(allPositiveMatches);
  const etfScore = etfMembershipScore(input);
  const components: ExposureScoreComponents = {
    customer_end_market_fit: 0,
    etf_theme_basket_membership: etfScore.score,
    excluded_category_penalty: 0,
    management_filing_language_support: 0,
    product_business_line_match: 0,
    revenue_exposure_to_theme: 0,
    segment_disclosure_support: 0,
  };
  const componentReasons: Array<{
    metricName: keyof ExposureScoreComponents;
    metricValueText?: string;
    reasonCode: string;
    scoreImpact: number;
  }> = [];

  if (providerDirectBusinessLineMatches.length > 0) {
    const directText = sourceText(providerDirectBusinessLineMatches);
    components.revenue_exposure_to_theme = includesMateriality(directText)
      ? 28
      : 20;

    if (includesEarlyStage(directText)) {
      components.revenue_exposure_to_theme = Math.min(
        components.revenue_exposure_to_theme,
        20,
      );
    }

    components.product_business_line_match =
      providerDirectBusinessLineMatches.some(
        (match) => match.strength === "phrase",
      )
        ? 20
        : 16;
  } else if (providerDirectMatches.length > 0) {
    components.revenue_exposure_to_theme = 10;
    components.product_business_line_match = providerDirectMatches.some(
      (match) => match.strength === "phrase",
    )
      ? 8
      : 4;
  } else if (manualDirectMatches.length > 0) {
    components.revenue_exposure_to_theme = 20;
    components.product_business_line_match = 12;
  } else if (providerIndirectMatches.length > 0) {
    components.revenue_exposure_to_theme = 12;
    components.product_business_line_match = 12;
  } else if (indirectMatches.length > 0) {
    components.revenue_exposure_to_theme = 12;
    components.product_business_line_match = 8;
  } else if (allPositiveMatches.length > 0) {
    components.revenue_exposure_to_theme = 5;
    components.product_business_line_match = 4;
  }

  if (
    providerDirectBusinessLineMatches.some((match) =>
      END_MARKET_WORDS.some((word) =>
        normalizeExposureText(match.source.text).includes(word),
      ),
    )
  ) {
    components.customer_end_market_fit = 10;
  } else if (
    providerDirectBusinessLineMatches.length > 0 ||
    providerIndirectMatches.length > 0
  ) {
    components.customer_end_market_fit = 7;
  } else if (manualDirectMatches.length > 0 || indirectMatches.length > 0) {
    components.customer_end_market_fit = 4;
  }

  if (providerDirectBusinessLineMatches.length > 0) {
    components.management_filing_language_support =
      includesMateriality(allPositiveSourceText) ||
      END_MARKET_WORDS.some((word) =>
        normalizeExposureText(allPositiveSourceText).includes(word),
      )
        ? 5
        : 3;
  } else if (allPositiveMatches.length > 0) {
    components.management_filing_language_support = 1;
  }

  if (excludedMatches.length > 0) {
    components.excluded_category_penalty =
      directMatches.length === 0 ? -25 : indirectMatches.length > 0 ? -15 : -8;
  }

  if (components.revenue_exposure_to_theme > 0) {
    componentReasons.push({
      metricName: "revenue_exposure_to_theme",
      metricValueText: allPositiveMatches
        .map((match) => match.category.displayLabel)
        .join(", "),
      reasonCode:
        providerDirectMatches.length > 0 || manualDirectMatches.length > 0
          ? T1_REASON_CODES.REVENUE_MATERIALITY_SUPPORT
          : T1_REASON_CODES.NO_REVENUE_LINK,
      scoreImpact: components.revenue_exposure_to_theme,
    });
  }

  if (components.product_business_line_match > 0) {
    componentReasons.push({
      metricName: "product_business_line_match",
      metricValueText: allPositiveMatches
        .map((match) => match.category.displayLabel)
        .join(", "),
      reasonCode:
        directMatches.length > 0
          ? T1_REASON_CODES.BUSINESS_LINE_MATCH
          : T1_REASON_CODES.INDIRECT_CATEGORY_MATCH,
      scoreImpact: components.product_business_line_match,
    });
  }

  componentReasons.push({
    metricName: "segment_disclosure_support",
    reasonCode: T1_REASON_CODES.SEGMENT_DATA_MISSING,
    scoreImpact: 0,
  });

  if (etfScore.score > 0) {
    componentReasons.push({
      metricName: "etf_theme_basket_membership",
      metricValueText: etfScore.text,
      reasonCode: etfScore.reasonCode ?? T1_REASON_CODES.SEED_ETF_INCLUDED,
      scoreImpact: etfScore.score,
    });
  }

  if (components.customer_end_market_fit > 0) {
    componentReasons.push({
      metricName: "customer_end_market_fit",
      metricValueText: allPositiveMatches
        .map((match) => match.category.displayLabel)
        .join(", "),
      reasonCode: T1_REASON_CODES.CUSTOMER_END_MARKET_FIT,
      scoreImpact: components.customer_end_market_fit,
    });
  }

  if (components.management_filing_language_support > 0) {
    componentReasons.push({
      metricName: "management_filing_language_support",
      metricValueText: allPositiveMatches
        .map((match) => match.source.label)
        .join(", "),
      reasonCode: T1_REASON_CODES.FILING_LANGUAGE_SUPPORT,
      scoreImpact: components.management_filing_language_support,
    });
  }

  if (components.excluded_category_penalty < 0) {
    componentReasons.push({
      metricName: "excluded_category_penalty",
      metricValueText: excludedMatches
        .map((match) => match.category.displayLabel)
        .join(", "),
      reasonCode: T1_REASON_CODES.EXCLUDED_CATEGORY_MATCH,
      scoreImpact: components.excluded_category_penalty,
    });
  }

  return {
    componentReasons,
    components,
    directMatches,
    excludedMatches,
    hasProviderBackedSource:
      sourceDetailHasProviderSource(input.candidate.sourceDetail) ||
      Boolean(input.fmpProfile || input.secCompanyFacts),
    indirectMatches,
    manualOnlySupport: hasManualOnlySupport(allPositiveMatches, sources),
    matches,
    providerDirectMatches,
    providerDirectBusinessLineMatches,
    providerIndirectMatches,
    sources,
  };
}

function beneficiaryForScore(
  score: number,
  input: {
    directMatches: ExposureCategoryMatch[];
    excludedMatches: ExposureCategoryMatch[];
    indirectMatches: ExposureCategoryMatch[];
    sameSectorOnly: boolean;
  },
): BeneficiaryType {
  if (score >= 85) {
    return "MAJOR_BENEFICIARY";
  }

  if (score >= 70) {
    return "DIRECT_BENEFICIARY";
  }

  if (score >= 50) {
    return "PARTIAL_BENEFICIARY";
  }

  if (score >= 30) {
    return input.directMatches.length > 0 || input.indirectMatches.length > 0
      ? "INDIRECT_BENEFICIARY"
      : "NARRATIVE_ADJACENT";
  }

  if (input.excludedMatches.length > 0) {
    return "NARRATIVE_ADJACENT";
  }

  if (input.sameSectorOnly) {
    return "SAME_SECTOR_ONLY";
  }

  return input.directMatches.length > 0 || input.indirectMatches.length > 0
    ? "NARRATIVE_ADJACENT"
    : "UNRELATED";
}

function statusFor(
  score: number,
  beneficiaryType: BeneficiaryType,
  manualOnlySupport: boolean,
): CandidateStatus {
  if (manualOnlySupport) {
    return "REVIEW_REQUIRED";
  }

  if (
    score < 30 ||
    beneficiaryType === "NARRATIVE_ADJACENT" ||
    beneficiaryType === "SAME_SECTOR_ONLY" ||
    beneficiaryType === "UNRELATED"
  ) {
    return "REJECTED";
  }

  if (score < 50 || beneficiaryType === "INDIRECT_BENEFICIARY") {
    return "WATCH_ONLY";
  }

  return "ACTIVE";
}

function reasonCodesFor(input: {
  caps: string[];
  directMatches: ExposureCategoryMatch[];
  excludedMatches: ExposureCategoryMatch[];
  indirectMatches: ExposureCategoryMatch[];
  manualOnlySupport: boolean;
  sameSectorOnly: boolean;
}) {
  const reasonCodes = new Set<string>();

  if (input.directMatches.length > 0) {
    reasonCodes.add(T1_REASON_CODES.DIRECT_CATEGORY_MATCH);
  }

  if (input.indirectMatches.length > 0) {
    reasonCodes.add(T1_REASON_CODES.INDIRECT_CATEGORY_MATCH);
  }

  if (input.excludedMatches.length > 0) {
    reasonCodes.add(T1_REASON_CODES.EXCLUDED_CATEGORY_MATCH);
  }

  if (input.manualOnlySupport) {
    reasonCodes.add(T1_REASON_CODES.MANUAL_SEED_ONLY);
    reasonCodes.add(T1_REASON_CODES.MAPPING_REVIEW_REQUIRED);
  }

  if (input.sameSectorOnly) {
    reasonCodes.add(T1_REASON_CODES.SAME_SECTOR_ONLY);
  }

  for (const cap of input.caps) {
    if (cap === "keyword_only_cap") {
      reasonCodes.add(T1_REASON_CODES.KEYWORD_ONLY);
    }

    if (cap === "no_direct_or_indirect_category_cap") {
      reasonCodes.add(T1_REASON_CODES.NO_DIRECT_OR_INDIRECT_MATCH);
    }

    if (cap === "seed_etf_only_cap") {
      reasonCodes.add(T1_REASON_CODES.SEED_ETF_INCLUDED);
      reasonCodes.add(T1_REASON_CODES.NARRATIVE_ADJACENT);
    }
  }

  reasonCodes.add(T1_REASON_CODES.SEGMENT_DATA_MISSING);

  return [...reasonCodes].sort();
}

function matchedLabels(matches: ExposureCategoryMatch[]) {
  return [
    ...new Set(matches.map((match) => match.category.displayLabel)),
  ].sort();
}

export function scoreExposurePurity(
  input: ExposureScoringInput,
): ExposureScoreResult {
  const computed = computeComponents(input);
  const baseScore = Object.values(computed.components).reduce(
    (sum, value) => sum + value,
    0,
  );
  const caps: Array<{ label: string; value: number }> = [];
  const positiveMatches = [
    ...computed.directMatches,
    ...computed.indirectMatches,
  ];
  const keywordOnly = hasGenericKeywordOnly(positiveMatches);
  const sameSectorOnly =
    positiveMatches.length > 0 &&
    positiveMatches.every((match) => sourceIsSectorOnly(match.source)) &&
    computed.providerDirectBusinessLineMatches.length === 0;
  const seedEtfOnly =
    computed.components.etf_theme_basket_membership > 0 &&
    positiveMatches.length === 0;

  if (keywordOnly) {
    caps.push({ label: "keyword_only_cap", value: T1_CAPS.keywordOnly });
  }

  if (sameSectorOnly) {
    caps.push({ label: "same_sector_only_cap", value: T1_CAPS.sameSectorOnly });
  }

  if (positiveMatches.length === 0) {
    caps.push({
      label: "no_direct_or_indirect_category_cap",
      value: T1_CAPS.noDirectOrIndirectCategory,
    });
  }

  if (seedEtfOnly) {
    caps.push({ label: "seed_etf_only_cap", value: T1_CAPS.seedEtfOnly });
  }

  if (!hasProviderDirectBusinessLine(positiveMatches)) {
    caps.push({
      label: "no_revenue_or_business_line_evidence_cap",
      value: T1_CAPS.noRevenueOrBusinessLineEvidence,
    });
  }

  if (computed.manualOnlySupport) {
    caps.push({
      label: "manual_only_mapping_cap",
      value: T1_CAPS.manualOnlyMapping,
    });
  }

  if (
    computed.excludedMatches.length > 0 &&
    computed.providerDirectMatches.length === 0
  ) {
    caps.push({
      label: "excluded_category_dominates_cap",
      value: T1_CAPS.excludedCategoryDominates,
    });
  }

  const cappedScore = caps.reduce(
    (score, cap) => Math.min(score, cap.value),
    Math.max(0, Math.min(100, baseScore)),
  );
  const score = Math.round(cappedScore);
  const capsApplied = caps.map((cap) => cap.label);
  const beneficiaryType = beneficiaryForScore(score, {
    directMatches: computed.directMatches,
    excludedMatches: computed.excludedMatches,
    indirectMatches: computed.indirectMatches,
    sameSectorOnly,
  });
  const candidateStatus = statusFor(
    score,
    beneficiaryType,
    computed.manualOnlySupport,
  );
  const reasonCodes = reasonCodesFor({
    caps: capsApplied,
    directMatches: computed.directMatches,
    excludedMatches: computed.excludedMatches,
    indirectMatches: computed.indirectMatches,
    manualOnlySupport: computed.manualOnlySupport,
    sameSectorOnly,
  });
  const scoreDetail = {
    algorithm_version: T1_EXPOSURE_ALGORITHM_VERSION,
    beneficiary_type: beneficiaryType,
    caps_applied: capsApplied,
    components: computed.components,
    final_score: score,
    matched_categories: {
      direct: matchedLabels(computed.directMatches),
      excluded: matchedLabels(computed.excludedMatches),
      indirect: matchedLabels(computed.indirectMatches),
    },
    reason_codes: reasonCodes,
    threshold_version: T1_EXPOSURE_THRESHOLD_VERSION,
  };
  const evidenceDetails = [
    ...computed.componentReasons.map((detail) => ({
      metricName: `t1.${detail.metricName}`,
      metricValueText: detail.metricValueText,
      reasonCode: detail.reasonCode,
      scoreImpact: detail.scoreImpact,
    })),
    ...capsApplied.map((cap) => ({
      metricName: "t1.score_cap",
      metricValueText: cap,
      reasonCode:
        cap === "manual_only_mapping_cap"
          ? T1_REASON_CODES.MAPPING_REVIEW_REQUIRED
          : cap === "same_sector_only_cap"
            ? T1_REASON_CODES.SAME_SECTOR_ONLY
            : cap === "keyword_only_cap"
              ? T1_REASON_CODES.KEYWORD_ONLY
              : T1_REASON_CODES.NARRATIVE_ADJACENT,
      scoreImpact: 0,
    })),
    {
      metricName: "t1.exposure_purity_score",
      metricValueText: hashPayload(scoreDetail),
      reasonCode: reasonCodes[0] ?? T1_REASON_CODES.NARRATIVE_ADJACENT,
      scoreImpact: score,
    },
  ];

  return {
    beneficiaryType,
    candidateStatus,
    displayGroup: T1_DISPLAY_GROUPS[beneficiaryType],
    evidenceDetails,
    score,
    scoreDetail,
  };
}
