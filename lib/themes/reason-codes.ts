export const THEME_REASON_CODES = {
  DIRECT_CATEGORIES_PRESENT: "THEME_DIRECT_CATEGORIES_PRESENT",
  EXCLUDED_CATEGORIES_PRESENT: "THEME_EXCLUDED_CATEGORIES_PRESENT",
  INVALIDATION_RULES_PRESENT: "THEME_INVALIDATION_RULES_PRESENT",
  MECHANISM_SPECIFIC: "THEME_MECHANISM_SPECIFIC",
  REQUIRED_PROOF_PRESENT: "THEME_REQUIRED_PROOF_PRESENT",
  SEED_SOURCE_PRESENT: "THEME_SEED_SOURCE_PRESENT",
  SEED_VALIDATION_FAILED_MISSING_COMPANY_NAME:
    "THEME_SEED_VALIDATION_FAILED_MISSING_COMPANY_NAME",
  SEED_VALIDATION_FAILED_MISSING_INITIAL_INCLUSION_METHOD:
    "THEME_SEED_VALIDATION_FAILED_MISSING_INITIAL_INCLUSION_METHOD",
  SEED_VALIDATION_FAILED_MISSING_THEME_ID:
    "THEME_SEED_VALIDATION_FAILED_MISSING_THEME_ID",
  SEED_VALIDATION_FAILED_MISSING_TICKER:
    "THEME_SEED_VALIDATION_FAILED_MISSING_TICKER",
  SEED_VALIDATION_WARNING_API_NOT_RETRIEVABLE:
    "THEME_SEED_VALIDATION_WARNING_API_NOT_RETRIEVABLE",
  SEED_VALIDATION_WARNING_MALFORMED_OPENFIGI_HINT:
    "THEME_SEED_VALIDATION_WARNING_MALFORMED_OPENFIGI_HINT",
  SEED_VALIDATION_WARNING_MALFORMED_PROVIDER_ENDPOINT_HINT:
    "THEME_SEED_VALIDATION_WARNING_MALFORMED_PROVIDER_ENDPOINT_HINT",
  SEED_VALIDATION_WARNING_MISSING_GATE_REQUIREMENT:
    "THEME_SEED_VALIDATION_WARNING_MISSING_GATE_REQUIREMENT",
  SEED_VALIDATION_WARNING_OPENFIGI_TICKER_MISMATCH:
    "THEME_SEED_VALIDATION_WARNING_OPENFIGI_TICKER_MISMATCH",
  SEED_VALIDATION_WARNING_TICKER_NOT_IN_SECURITY_MASTER:
    "THEME_SEED_VALIDATION_WARNING_TICKER_NOT_IN_SECURITY_MASTER",
  VALIDATION_FAILED_DUPLICATE_THEME_ID:
    "THEME_VALIDATION_FAILED_DUPLICATE_THEME_ID",
  VALIDATION_FAILED_DUPLICATE_THEME_SLUG:
    "THEME_VALIDATION_FAILED_DUPLICATE_THEME_SLUG",
  VALIDATION_FAILED_INVALID_CREATED_DATE:
    "THEME_VALIDATION_FAILED_INVALID_CREATED_DATE",
  VALIDATION_FAILED_INVALID_DASHBOARD_STATUS:
    "THEME_VALIDATION_FAILED_INVALID_DASHBOARD_STATUS",
  VALIDATION_FAILED_MISSING_CREATED_DATE:
    "THEME_VALIDATION_FAILED_MISSING_CREATED_DATE",
  VALIDATION_FAILED_MISSING_DEFAULT_DASHBOARD_STATUS:
    "THEME_VALIDATION_FAILED_MISSING_DEFAULT_DASHBOARD_STATUS",
  VALIDATION_FAILED_MISSING_DIRECT_CATEGORIES:
    "THEME_VALIDATION_FAILED_MISSING_DIRECT_CATEGORIES",
  VALIDATION_FAILED_MISSING_EXCLUDED_CATEGORIES:
    "THEME_VALIDATION_FAILED_MISSING_EXCLUDED_CATEGORIES",
  VALIDATION_FAILED_MISSING_INVALIDATION:
    "THEME_VALIDATION_FAILED_MISSING_INVALIDATION",
  VALIDATION_FAILED_MISSING_PROOF: "THEME_VALIDATION_FAILED_MISSING_PROOF",
  VALIDATION_FAILED_MISSING_SEED_ETFS:
    "THEME_VALIDATION_FAILED_MISSING_SEED_ETFS",
  VALIDATION_FAILED_MISSING_SEED_SOURCE:
    "THEME_VALIDATION_FAILED_MISSING_SEED_SOURCE",
  VALIDATION_FAILED_MISSING_THEME_ID:
    "THEME_VALIDATION_FAILED_MISSING_THEME_ID",
  VALIDATION_FAILED_MISSING_THEME_MECHANISM:
    "THEME_VALIDATION_FAILED_MISSING_THEME_MECHANISM",
  VALIDATION_FAILED_MISSING_THEME_NAME:
    "THEME_VALIDATION_FAILED_MISSING_THEME_NAME",
  VALIDATION_WARNING_DERIVED_ECONOMIC_PROOF:
    "THEME_VALIDATION_WARNING_DERIVED_ECONOMIC_PROOF",
  VALIDATION_WARNING_DERIVED_INVALIDATION_RULES:
    "THEME_VALIDATION_WARNING_DERIVED_INVALIDATION_RULES",
  VALIDATION_WARNING_EMPTY_INDIRECT_CATEGORIES:
    "THEME_VALIDATION_WARNING_EMPTY_INDIRECT_CATEGORIES",
  VALIDATION_WARNING_SEED_ETF_NOT_IN_SECURITY_MASTER:
    "THEME_VALIDATION_WARNING_SEED_ETF_NOT_IN_SECURITY_MASTER",
} as const;

export type ThemeReasonCode =
  (typeof THEME_REASON_CODES)[keyof typeof THEME_REASON_CODES];

type ThemeReasonSeverity =
  | "INFO"
  | "POSITIVE"
  | "CAUTION"
  | "WARNING"
  | "BLOCKER";

export type ThemeReasonCodeMetadata = {
  code: ThemeReasonCode;
  description: string;
  displayLabel: string;
  severity: ThemeReasonSeverity;
};

const metadata = (
  displayLabel: string,
  description: string,
  severity: ThemeReasonSeverity,
) => ({
  description,
  displayLabel,
  severity,
});

export const THEME_REASON_CODE_METADATA: Record<
  ThemeReasonCode,
  ThemeReasonCodeMetadata
> = {
  [THEME_REASON_CODES.DIRECT_CATEGORIES_PRESENT]: {
    code: THEME_REASON_CODES.DIRECT_CATEGORIES_PRESENT,
    ...metadata(
      "Direct categories present",
      "The theme definition includes at least one direct beneficiary category.",
      "INFO",
    ),
  },
  [THEME_REASON_CODES.EXCLUDED_CATEGORIES_PRESENT]: {
    code: THEME_REASON_CODES.EXCLUDED_CATEGORIES_PRESENT,
    ...metadata(
      "Excluded categories present",
      "The theme definition includes exclusions that help reject false positives.",
      "INFO",
    ),
  },
  [THEME_REASON_CODES.INVALIDATION_RULES_PRESENT]: {
    code: THEME_REASON_CODES.INVALIDATION_RULES_PRESENT,
    ...metadata(
      "Invalidation rules present",
      "The theme definition includes rules for weakening or invalidating the theme.",
      "INFO",
    ),
  },
  [THEME_REASON_CODES.MECHANISM_SPECIFIC]: {
    code: THEME_REASON_CODES.MECHANISM_SPECIFIC,
    ...metadata(
      "Mechanism specific",
      "The theme definition includes a testable economic mechanism.",
      "INFO",
    ),
  },
  [THEME_REASON_CODES.REQUIRED_PROOF_PRESENT]: {
    code: THEME_REASON_CODES.REQUIRED_PROOF_PRESENT,
    ...metadata(
      "Required proof present",
      "The theme definition includes economic proof requirements.",
      "INFO",
    ),
  },
  [THEME_REASON_CODES.SEED_SOURCE_PRESENT]: {
    code: THEME_REASON_CODES.SEED_SOURCE_PRESENT,
    ...metadata(
      "Seed source present",
      "The theme definition includes at least one seed source for candidate generation.",
      "INFO",
    ),
  },
  [THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_COMPANY_NAME]: {
    code: THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_COMPANY_NAME,
    ...metadata(
      "Seed company missing",
      "A company seed row is missing company_name.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_INITIAL_INCLUSION_METHOD]:
    {
      code: THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_INITIAL_INCLUSION_METHOD,
      ...metadata(
        "Seed inclusion method missing",
        "A company seed row is missing initial_inclusion_method.",
        "BLOCKER",
      ),
    },
  [THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_THEME_ID]: {
    code: THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_THEME_ID,
    ...metadata(
      "Seed theme id missing",
      "A company seed row is missing theme_id.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_TICKER]: {
    code: THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_TICKER,
    ...metadata(
      "Seed ticker missing",
      "A company seed row is missing ticker.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.SEED_VALIDATION_WARNING_API_NOT_RETRIEVABLE]: {
    code: THEME_REASON_CODES.SEED_VALIDATION_WARNING_API_NOT_RETRIEVABLE,
    ...metadata(
      "Seed API not retrievable",
      "A company seed row is not provider-retrievable and remains validation-only.",
      "WARNING",
    ),
  },
  [THEME_REASON_CODES.SEED_VALIDATION_WARNING_MALFORMED_OPENFIGI_HINT]: {
    code: THEME_REASON_CODES.SEED_VALIDATION_WARNING_MALFORMED_OPENFIGI_HINT,
    ...metadata(
      "Malformed OpenFIGI hint",
      "A company seed row has an OpenFIGI payload hint that cannot be parsed.",
      "WARNING",
    ),
  },
  [THEME_REASON_CODES.SEED_VALIDATION_WARNING_MALFORMED_PROVIDER_ENDPOINT_HINT]:
    {
      code: THEME_REASON_CODES.SEED_VALIDATION_WARNING_MALFORMED_PROVIDER_ENDPOINT_HINT,
      ...metadata(
        "Malformed provider endpoint",
        "A company seed row includes a provider endpoint hint that is not a valid URL.",
        "WARNING",
      ),
    },
  [THEME_REASON_CODES.SEED_VALIDATION_WARNING_MISSING_GATE_REQUIREMENT]: {
    code: THEME_REASON_CODES.SEED_VALIDATION_WARNING_MISSING_GATE_REQUIREMENT,
    ...metadata(
      "Gate requirement missing",
      "A company seed row does not explicitly state that AlphaTrend gates are required.",
      "WARNING",
    ),
  },
  [THEME_REASON_CODES.SEED_VALIDATION_WARNING_OPENFIGI_TICKER_MISMATCH]: {
    code: THEME_REASON_CODES.SEED_VALIDATION_WARNING_OPENFIGI_TICKER_MISMATCH,
    ...metadata(
      "OpenFIGI ticker mismatch",
      "A company seed row has an OpenFIGI ticker hint that does not match the seed ticker.",
      "WARNING",
    ),
  },
  [THEME_REASON_CODES.SEED_VALIDATION_WARNING_TICKER_NOT_IN_SECURITY_MASTER]: {
    code: THEME_REASON_CODES.SEED_VALIDATION_WARNING_TICKER_NOT_IN_SECURITY_MASTER,
    ...metadata(
      "Seed ticker unmapped",
      "A company seed ticker is not present in the current security master.",
      "WARNING",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_DUPLICATE_THEME_ID]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_DUPLICATE_THEME_ID,
    ...metadata(
      "Duplicate theme id",
      "The theme catalog contains duplicate theme_id values.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_DUPLICATE_THEME_SLUG]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_DUPLICATE_THEME_SLUG,
    ...metadata(
      "Duplicate theme slug",
      "The theme catalog contains theme names that map to the same slug.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_INVALID_CREATED_DATE]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_INVALID_CREATED_DATE,
    ...metadata(
      "Invalid created date",
      "A theme catalog row has an invalid created_date value.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_INVALID_DASHBOARD_STATUS]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_INVALID_DASHBOARD_STATUS,
    ...metadata(
      "Invalid dashboard status",
      "A theme catalog row has an unsupported default_dashboard_status value.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_CREATED_DATE]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_CREATED_DATE,
    ...metadata(
      "Created date missing",
      "A theme catalog row is missing created_date.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_DEFAULT_DASHBOARD_STATUS]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_DEFAULT_DASHBOARD_STATUS,
    ...metadata(
      "Dashboard status missing",
      "A theme catalog row is missing default_dashboard_status.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_DIRECT_CATEGORIES]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_DIRECT_CATEGORIES,
    ...metadata(
      "Direct categories missing",
      "A theme definition is missing direct beneficiary categories.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_EXCLUDED_CATEGORIES]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_EXCLUDED_CATEGORIES,
    ...metadata(
      "Excluded categories missing",
      "A theme definition is missing excluded categories.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_INVALIDATION]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_INVALIDATION,
    ...metadata(
      "Invalidation rules missing",
      "A theme definition is missing invalidation rules.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_PROOF]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_PROOF,
    ...metadata(
      "Required proof missing",
      "A theme definition is missing required economic proof.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_SEED_ETFS]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_SEED_ETFS,
    ...metadata(
      "Seed ETFs missing",
      "A theme catalog row is missing seed_etfs.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_SEED_SOURCE]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_SEED_SOURCE,
    ...metadata(
      "Seed source missing",
      "A theme definition has no ETF, industry, or screener seed source.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_THEME_ID]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_THEME_ID,
    ...metadata(
      "Theme id missing",
      "A theme catalog row is missing theme_id.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_THEME_MECHANISM]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_THEME_MECHANISM,
    ...metadata(
      "Theme mechanism missing",
      "A theme catalog row is missing theme_mechanism.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_FAILED_MISSING_THEME_NAME]: {
    code: THEME_REASON_CODES.VALIDATION_FAILED_MISSING_THEME_NAME,
    ...metadata(
      "Theme name missing",
      "A theme catalog row is missing theme_name.",
      "BLOCKER",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_WARNING_DERIVED_ECONOMIC_PROOF]: {
    code: THEME_REASON_CODES.VALIDATION_WARNING_DERIVED_ECONOMIC_PROOF,
    ...metadata(
      "Derived economic proof",
      "A non-MVP catalog theme is using derived economic proof until it is manually activated.",
      "WARNING",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_WARNING_DERIVED_INVALIDATION_RULES]: {
    code: THEME_REASON_CODES.VALIDATION_WARNING_DERIVED_INVALIDATION_RULES,
    ...metadata(
      "Derived invalidation rules",
      "A non-MVP catalog theme is using derived invalidation rules until it is manually activated.",
      "WARNING",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_WARNING_EMPTY_INDIRECT_CATEGORIES]: {
    code: THEME_REASON_CODES.VALIDATION_WARNING_EMPTY_INDIRECT_CATEGORIES,
    ...metadata(
      "Indirect categories empty",
      "A non-MVP catalog theme has no curated indirect beneficiary categories yet.",
      "WARNING",
    ),
  },
  [THEME_REASON_CODES.VALIDATION_WARNING_SEED_ETF_NOT_IN_SECURITY_MASTER]: {
    code: THEME_REASON_CODES.VALIDATION_WARNING_SEED_ETF_NOT_IN_SECURITY_MASTER,
    ...metadata(
      "Seed ETF unmapped",
      "A theme seed ETF is not present as an ETF in the current security master.",
      "WARNING",
    ),
  },
};

export function getThemeReasonCodeMetadata(code: ThemeReasonCode) {
  return THEME_REASON_CODE_METADATA[code];
}
