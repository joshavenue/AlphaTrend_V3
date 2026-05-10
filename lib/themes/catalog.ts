import type { Prisma } from "@/generated/prisma/client";
import {
  CURATED_MVP_THEME_DETAILS,
  MVP_THEME_CODES,
} from "@/lib/themes/curated-mvp";
import { type CsvRecord, parseCsv, splitSemicolonList } from "@/lib/themes/csv";
import { THEME_REASON_CODES } from "@/lib/themes/reason-codes";

export const THEME_LOADER_VERSION = "phase4_theme_loader_2026_05_10";

type ValidationSeverity = "ERROR" | "WARNING";

export type ThemeValidationIssue = {
  code: string;
  message: string;
  severity: ValidationSeverity;
  sourceRowNumber?: number;
  themeCode?: string;
};

export type ThemeCatalogCsvRow = {
  apiGenerationRule: string;
  companyCountInSeedCsv: string;
  createdDate: string;
  defaultDashboardStatus: string;
  directCategories: string;
  excludedCategories: string;
  fmpSeedEtfHoldingsEndpoints: string;
  seedEtfs: string;
  sourceRowNumber: number;
  themeCategory: string;
  themeCode: string;
  themeMechanism: string;
  themeName: string;
};

export type ThemeDefinitionSeed = {
  candidateIndustries: Prisma.InputJsonValue;
  candidateScreenerRules: Prisma.InputJsonValue;
  defaultDashboardState: "INSUFFICIENT_EVIDENCE";
  directBeneficiaryCategories: Prisma.InputJsonValue;
  economicMechanism: Prisma.InputJsonValue;
  excludedCategories: Prisma.InputJsonValue;
  indirectBeneficiaryCategories: Prisma.InputJsonValue;
  invalidationRules: Prisma.InputJsonValue;
  liquidityRules: Prisma.InputJsonValue;
  priceConfirmationRules: Prisma.InputJsonValue;
  pricingPowerPoints: Prisma.InputJsonValue;
  primaryDemandDrivers: Prisma.InputJsonValue;
  requiredEconomicProof: Prisma.InputJsonValue;
  requiredFundamentalProof: Prisma.InputJsonValue;
  seedEtfs: Prisma.InputJsonValue;
  shortDescription: string;
  sourceDetail: Prisma.InputJsonValue;
  sourceThemeCode: string;
  status: "ACTIVE_UNSCANNED" | "CATALOG_LOADED";
  supplyConstraints: Prisma.InputJsonValue;
  themeName: string;
  themeSlug: string;
  valuationRiskRules: Prisma.InputJsonValue;
};

function requiredValue(values: Record<string, string>, key: string) {
  return values[key]?.trim() ?? "";
}

function rowFromCsv(record: CsvRecord): ThemeCatalogCsvRow {
  return {
    apiGenerationRule: requiredValue(record.values, "api_generation_rule"),
    companyCountInSeedCsv: requiredValue(
      record.values,
      "company_count_in_seed_csv",
    ),
    createdDate: requiredValue(record.values, "created_date"),
    defaultDashboardStatus: requiredValue(
      record.values,
      "default_dashboard_status",
    ),
    directCategories: requiredValue(record.values, "direct_categories"),
    excludedCategories: requiredValue(record.values, "excluded_categories"),
    fmpSeedEtfHoldingsEndpoints: requiredValue(
      record.values,
      "fmp_seed_etf_holdings_endpoints",
    ),
    seedEtfs: requiredValue(record.values, "seed_etfs"),
    sourceRowNumber: record.sourceRowNumber,
    themeCategory: requiredValue(record.values, "theme_category"),
    themeCode: requiredValue(record.values, "theme_id"),
    themeMechanism: requiredValue(record.values, "theme_mechanism"),
    themeName: requiredValue(record.values, "theme_name"),
  };
}

export function slugifyThemeName(themeName: string) {
  return themeName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
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

export function normalizeThemeLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}

function categoryObjects(
  labels: string[],
  source: string,
  matchType: "direct" | "indirect",
): Prisma.InputJsonValue {
  return labels.map((label) => ({
    display_label: label,
    match_type: matchType,
    normalized_label: normalizeThemeLabel(label),
    source,
    synonyms: [],
  }));
}

function excludedCategoryObjects(labels: string[]): Prisma.InputJsonValue {
  return labels.map((label) => ({
    display_label: label,
    normalized_label: normalizeThemeLabel(label),
    penalty: "hard_or_strong",
    source: "theme_catalog_csv.excluded_categories",
  }));
}

function endpointForSymbol(symbol: string, endpoints: string[], index: number) {
  const exactEndpoint = endpoints.find((endpoint) => {
    try {
      return new URL(endpoint).searchParams.get("symbol") === symbol;
    } catch {
      return false;
    }
  });

  return (
    exactEndpoint ??
    endpoints[index] ??
    `https://financialmodelingprep.com/stable/etf/holdings?symbol=${symbol}`
  );
}

function seedEtfObjects(row: ThemeCatalogCsvRow): Prisma.InputJsonValue {
  const endpoints = splitSemicolonList(row.fmpSeedEtfHoldingsEndpoints);

  return splitSemicolonList(row.seedEtfs).map((symbol, index) => ({
    holdings_endpoint: endpointForSymbol(symbol, endpoints, index),
    provider: "FMP",
    role: "candidate_seed",
    symbol,
  }));
}

function proofObjects(values: string[], source: string): Prisma.InputJsonValue {
  return values.map((description) => ({
    description,
    evidence_grade_required: "B_or_better_preferred",
    proof_type: "theme_mechanism_validation",
    source,
  }));
}

function invalidationRuleObjects(
  values: string[],
  source: string,
): Prisma.InputJsonValue {
  return values.map((description) => ({
    description,
    rule: slugifyThemeName(description).replace(/-/g, "_").slice(0, 80),
    source,
  }));
}

function labeledRuleObjects(
  values: string[],
  source: string,
): Prisma.InputJsonValue {
  return values.map((label) => ({
    label,
    normalized_label: normalizeThemeLabel(label),
    source,
  }));
}

function requiredFundamentalProof(): Prisma.InputJsonValue {
  return [
    {
      direction: "positive_or_accelerating",
      metric: "revenue_growth",
    },
    {
      direction: "stable_or_improving",
      metric: "margin_or_cash_flow_quality",
    },
  ];
}

function defaultPriceConfirmationRules(): Prisma.InputJsonValue {
  return [
    {
      description:
        "Ticker price participation must be confirmed in Phase 8 before any positive expression decision.",
      rule: "phase8_price_participation_required",
    },
    {
      description:
        "Theme evidence must not be outweighed by price outrunning fundamentals or valuation support.",
      rule: "price_must_not_outrun_evidence",
    },
  ];
}

function defaultValuationRiskRules(): Prisma.InputJsonValue {
  return [
    {
      description:
        "High valuation does not reject a ticker by itself, but it can move the expression decision to watchlist or extended.",
      rule: "valuation_risk_affects_expression_not_theme_definition",
    },
  ];
}

function defaultLiquidityRules(): Prisma.InputJsonValue {
  return [
    {
      description:
        "Phase 6 and later phases must reject or quarantine low-liquidity, fragile, or dilution-heavy tickers before dashboard promotion.",
      rule: "liquidity_and_dilution_gates_required",
    },
  ];
}

function derivedEconomicProof(row: ThemeCatalogCsvRow) {
  return [
    {
      description: `Evidence must validate the mechanism: ${row.themeMechanism}`,
      evidence_grade_required: "B_or_better_preferred",
      proof_type: "theme_mechanism_validation",
      source: "derived_from_theme_mechanism",
    },
  ];
}

function derivedInvalidationRules() {
  return [
    {
      description:
        "Theme should weaken if required economic proof remains missing or contradicted.",
      rule: "theme_mechanism_not_supported_by_evidence",
      source: "derived_from_theme_mechanism",
    },
    {
      description:
        "Theme should weaken if direct beneficiaries do not show validating fundamentals.",
      rule: "direct_beneficiaries_fail_validation",
      source: "derived_from_theme_mechanism",
    },
  ];
}

export function validateCatalogRow(row: ThemeCatalogCsvRow) {
  const issues: ThemeValidationIssue[] = [];
  const requiredFields: Array<[keyof ThemeCatalogCsvRow, string]> = [
    ["themeCode", "theme_id"],
    ["themeName", "theme_name"],
    ["themeMechanism", "theme_mechanism"],
    ["directCategories", "direct_categories"],
    ["excludedCategories", "excluded_categories"],
    ["seedEtfs", "seed_etfs"],
    ["createdDate", "created_date"],
  ];

  for (const [field, sourceName] of requiredFields) {
    if (!String(row[field] ?? "").trim()) {
      issues.push({
        code: `THEME_VALIDATION_FAILED_MISSING_${sourceName.toUpperCase()}`,
        message: `${sourceName} is required.`,
        severity: "ERROR",
        sourceRowNumber: row.sourceRowNumber,
        themeCode: row.themeCode || undefined,
      });
    }
  }

  if (row.createdDate && Number.isNaN(Date.parse(row.createdDate))) {
    issues.push({
      code: "THEME_VALIDATION_FAILED_INVALID_CREATED_DATE",
      message: `created_date is invalid: ${row.createdDate}`,
      severity: "ERROR",
      sourceRowNumber: row.sourceRowNumber,
      themeCode: row.themeCode || undefined,
    });
  }

  return issues;
}

export function buildThemeDefinitionSeed(
  row: ThemeCatalogCsvRow,
  loadedAt = new Date(),
): { seed: ThemeDefinitionSeed; warnings: ThemeValidationIssue[] } {
  const curated = CURATED_MVP_THEME_DETAILS[row.themeCode];
  const directCategories = splitSemicolonList(row.directCategories);
  const excludedCategories = splitSemicolonList(row.excludedCategories);
  const sourceDetail = {
    company_count_in_seed_csv: Number(row.companyCountInSeedCsv) || null,
    created_date: row.createdDate,
    default_dashboard_status: row.defaultDashboardStatus,
    loader_version: THEME_LOADER_VERSION,
    loaded_at: loadedAt.toISOString(),
    mvp_cohort: MVP_THEME_CODES.includes(row.themeCode) ? "MVP_FIVE" : null,
    source_file: "AlphaTrend_V3_theme_catalog.csv",
    source_row_number: row.sourceRowNumber,
    source_theme_code: row.themeCode,
    theme_category: row.themeCategory,
  };
  const warnings: ThemeValidationIssue[] = [];

  if (!curated) {
    warnings.push(
      {
        code: "THEME_VALIDATION_WARNING_DERIVED_ECONOMIC_PROOF",
        message:
          "required_economic_proof is derived from the theme mechanism until this catalog theme is activated.",
        severity: "WARNING",
        sourceRowNumber: row.sourceRowNumber,
        themeCode: row.themeCode,
      },
      {
        code: "THEME_VALIDATION_WARNING_DERIVED_INVALIDATION_RULES",
        message:
          "invalidation_rules are derived placeholders until this catalog theme is activated.",
        severity: "WARNING",
        sourceRowNumber: row.sourceRowNumber,
        themeCode: row.themeCode,
      },
      {
        code: "THEME_VALIDATION_WARNING_EMPTY_INDIRECT_CATEGORIES",
        message:
          "indirect_beneficiary_categories are empty until this catalog theme is manually curated.",
        severity: "WARNING",
        sourceRowNumber: row.sourceRowNumber,
        themeCode: row.themeCode,
      },
    );
  }

  return {
    seed: {
      candidateIndustries: [],
      candidateScreenerRules: [
        {
          description: row.apiGenerationRule,
          rule_type: "catalog_api_generation_rule",
          source: "theme_catalog_csv.api_generation_rule",
        },
      ],
      defaultDashboardState: "INSUFFICIENT_EVIDENCE",
      directBeneficiaryCategories: categoryObjects(
        directCategories,
        "theme_catalog_csv.direct_categories",
        "direct",
      ),
      economicMechanism: {
        source: "theme_catalog_csv.theme_mechanism",
        steps: [
          {
            description: row.themeMechanism,
            order: 1,
          },
        ],
        summary: row.themeMechanism,
      },
      excludedCategories: excludedCategoryObjects(excludedCategories),
      indirectBeneficiaryCategories: categoryObjects(
        curated?.indirectCategories ?? [],
        "curated_mvp_theme_details.indirect_categories",
        "indirect",
      ),
      invalidationRules: curated
        ? invalidationRuleObjects(
            curated.invalidationRules,
            "curated_mvp_theme_details.invalidation_rules",
          )
        : derivedInvalidationRules(),
      liquidityRules: defaultLiquidityRules(),
      priceConfirmationRules: defaultPriceConfirmationRules(),
      pricingPowerPoints: labeledRuleObjects(
        curated?.pricingPowerPoints ?? [],
        "curated_mvp_theme_details.pricing_power_points",
      ),
      primaryDemandDrivers: [
        {
          description: row.themeMechanism,
          label: "derived_from_theme_mechanism",
          source: "theme_catalog_csv.theme_mechanism",
        },
      ],
      requiredEconomicProof: curated
        ? proofObjects(
            curated.requiredEconomicProof,
            "curated_mvp_theme_details.required_economic_proof",
          )
        : derivedEconomicProof(row),
      requiredFundamentalProof: requiredFundamentalProof(),
      seedEtfs: seedEtfObjects(row),
      shortDescription: row.themeMechanism,
      sourceDetail,
      sourceThemeCode: row.themeCode,
      status: MVP_THEME_CODES.includes(row.themeCode)
        ? "ACTIVE_UNSCANNED"
        : "CATALOG_LOADED",
      supplyConstraints: labeledRuleObjects(
        curated?.supplyConstraints ?? [],
        "curated_mvp_theme_details.supply_constraints",
      ),
      themeName: row.themeName,
      themeSlug: slugifyThemeName(row.themeName),
      valuationRiskRules: defaultValuationRiskRules(),
    },
    warnings,
  };
}

export function validateThemeDefinitionSeed(
  seed: ThemeDefinitionSeed,
): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];
  const sourceDetail = seed.sourceDetail as { source_row_number?: number };
  const sourceRowNumber = sourceDetail.source_row_number;
  const themeCode = seed.sourceThemeCode;

  if (!seed.economicMechanism) {
    issues.push({
      code: THEME_REASON_CODES.MECHANISM_SPECIFIC,
      message: "economic_mechanism is required.",
      severity: "ERROR",
      sourceRowNumber,
      themeCode,
    });
  }

  const jsonArrayFields: Array<{
    code: string;
    message: string;
    value: Prisma.InputJsonValue;
  }> = [
    {
      code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_DIRECT_CATEGORIES,
      message: "direct_beneficiary_categories must not be empty.",
      value: seed.directBeneficiaryCategories,
    },
    {
      code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_EXCLUDED_CATEGORIES,
      message: "excluded_categories must not be empty.",
      value: seed.excludedCategories,
    },
    {
      code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_PROOF,
      message: "required_economic_proof must not be empty.",
      value: seed.requiredEconomicProof,
    },
    {
      code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_INVALIDATION,
      message: "invalidation_rules must not be empty.",
      value: seed.invalidationRules,
    },
  ];

  for (const field of jsonArrayFields) {
    if (!Array.isArray(field.value) || field.value.length === 0) {
      issues.push({
        code: field.code,
        message: field.message,
        severity: "ERROR",
        sourceRowNumber,
        themeCode,
      });
    }
  }

  const hasSeedSource =
    (Array.isArray(seed.seedEtfs) && seed.seedEtfs.length > 0) ||
    (Array.isArray(seed.candidateIndustries) &&
      seed.candidateIndustries.length > 0) ||
    (Array.isArray(seed.candidateScreenerRules) &&
      seed.candidateScreenerRules.length > 0);

  if (!hasSeedSource) {
    issues.push({
      code: "THEME_VALIDATION_FAILED_MISSING_SEED_SOURCE",
      message:
        "At least one of seed_etfs, candidate_industries, or candidate_screener_rules is required.",
      severity: "ERROR",
      sourceRowNumber,
      themeCode,
    });
  }

  return issues;
}

export function buildThemeCatalog(
  source: string,
  loadedAt = new Date(),
): {
  issues: ThemeValidationIssue[];
  rows: ThemeCatalogCsvRow[];
  seeds: ThemeDefinitionSeed[];
} {
  const records = parseCsv(source);
  const rows = records.map(rowFromCsv);
  const issues: ThemeValidationIssue[] = [];
  const seeds: ThemeDefinitionSeed[] = [];

  for (const row of rows) {
    const rowIssues = validateCatalogRow(row);
    issues.push(...rowIssues);

    if (rowIssues.some((issue) => issue.severity === "ERROR")) {
      continue;
    }

    const { seed, warnings } = buildThemeDefinitionSeed(row, loadedAt);
    issues.push(...warnings, ...validateThemeDefinitionSeed(seed));
    seeds.push(seed);
  }

  return {
    issues,
    rows,
    seeds,
  };
}
