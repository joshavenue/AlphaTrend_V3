import { type CsvRecord, parseCsv, splitSemicolonList } from "@/lib/themes/csv";
import { THEME_REASON_CODES } from "@/lib/themes/reason-codes";
import type { ThemeValidationIssue } from "@/lib/themes/catalog";

export type ThemeCompanySeedRow = {
  apiRetrievable: string;
  apiValidationPriority: string;
  beneficiaryType: string;
  candidateRole: string;
  candidateRankWithinTheme: string;
  companyName: string;
  fmpFinancialStatementsEndpoints: string;
  fmpKeyMetricsEndpoint: string;
  fmpProfileEndpoint: string;
  fmpRatiosEndpoint: string;
  initialInclusionMethod: string;
  massiveDailyBarsEndpointTemplate: string;
  massiveTickerReferenceEndpoint: string;
  mustPassAlphaTrendGates: string;
  notes: string;
  openfigiMappingPayloadHint: string;
  sourceRowNumber: number;
  themeCode: string;
  ticker: string;
};

export type CompanySeedValidationOptions = {
  securityTickers?: ReadonlySet<string>;
};

export type CompanySeedValidationResult = {
  candidateRowsWritten: 0;
  issues: ThemeValidationIssue[];
  rows: ThemeCompanySeedRow[];
};

function value(record: CsvRecord, key: string) {
  return record.values[key]?.trim() ?? "";
}

function rowFromCsv(record: CsvRecord): ThemeCompanySeedRow {
  return {
    apiRetrievable: value(record, "api_retrievable"),
    apiValidationPriority: value(record, "api_validation_priority"),
    beneficiaryType: value(record, "beneficiary_type"),
    candidateRole: value(record, "candidate_role"),
    candidateRankWithinTheme: value(record, "candidate_rank_within_theme"),
    companyName: value(record, "company_name"),
    fmpFinancialStatementsEndpoints: value(
      record,
      "fmp_financial_statements_endpoints",
    ),
    fmpKeyMetricsEndpoint: value(record, "fmp_key_metrics_endpoint"),
    fmpProfileEndpoint: value(record, "fmp_profile_endpoint"),
    fmpRatiosEndpoint: value(record, "fmp_ratios_endpoint"),
    initialInclusionMethod: value(record, "initial_inclusion_method"),
    massiveDailyBarsEndpointTemplate: value(
      record,
      "massive_daily_bars_endpoint_template",
    ),
    massiveTickerReferenceEndpoint: value(
      record,
      "massive_ticker_reference_endpoint",
    ),
    mustPassAlphaTrendGates: value(record, "must_pass_alpha_trend_gates"),
    notes: value(record, "notes"),
    openfigiMappingPayloadHint: value(record, "openfigi_mapping_payload_hint"),
    sourceRowNumber: record.sourceRowNumber,
    themeCode: value(record, "theme_id"),
    ticker: value(record, "ticker"),
  };
}

function issueForRow(
  row: ThemeCompanySeedRow,
  code: string,
  message: string,
): ThemeValidationIssue {
  return {
    code,
    message,
    severity: "WARNING",
    sourceRowNumber: row.sourceRowNumber,
    themeCode: row.themeCode || undefined,
  };
}

function validateUrlHint(
  row: ThemeCompanySeedRow,
  field: string,
  value: string,
) {
  const issues: ThemeValidationIssue[] = [];

  for (const endpoint of splitSemicolonList(value)) {
    try {
      const url = new URL(endpoint);

      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("unsupported protocol");
      }
    } catch {
      issues.push(
        issueForRow(
          row,
          THEME_REASON_CODES.SEED_VALIDATION_WARNING_MALFORMED_PROVIDER_ENDPOINT_HINT,
          `${field} is not a valid provider endpoint URL: ${endpoint}`,
        ),
      );
    }
  }

  return issues;
}

function validateOpenFigiHint(row: ThemeCompanySeedRow) {
  if (!row.openfigiMappingPayloadHint) {
    return [];
  }

  try {
    const payload = JSON.parse(row.openfigiMappingPayloadHint) as {
      exchCode?: unknown;
      idType?: unknown;
      idValue?: unknown;
    };

    if (
      payload.idType !== "TICKER" ||
      typeof payload.idValue !== "string" ||
      typeof payload.exchCode !== "string"
    ) {
      throw new Error("missing required OpenFIGI fields");
    }

    if (payload.idValue.toUpperCase() !== row.ticker.toUpperCase()) {
      return [
        issueForRow(
          row,
          THEME_REASON_CODES.SEED_VALIDATION_WARNING_OPENFIGI_TICKER_MISMATCH,
          `openfigi_mapping_payload_hint idValue ${payload.idValue} does not match ticker ${row.ticker}.`,
        ),
      ];
    }

    return [];
  } catch {
    return [
      issueForRow(
        row,
        THEME_REASON_CODES.SEED_VALIDATION_WARNING_MALFORMED_OPENFIGI_HINT,
        "openfigi_mapping_payload_hint must be valid JSON with idType, idValue, and exchCode.",
      ),
    ];
  }
}

function validateProviderHints(row: ThemeCompanySeedRow) {
  const urlFields: Array<[string, string]> = [
    ["fmp_profile_endpoint", row.fmpProfileEndpoint],
    ["fmp_key_metrics_endpoint", row.fmpKeyMetricsEndpoint],
    ["fmp_ratios_endpoint", row.fmpRatiosEndpoint],
    ["fmp_financial_statements_endpoints", row.fmpFinancialStatementsEndpoints],
    ["massive_ticker_reference_endpoint", row.massiveTickerReferenceEndpoint],
    [
      "massive_daily_bars_endpoint_template",
      row.massiveDailyBarsEndpointTemplate,
    ],
  ];

  return [
    ...urlFields.flatMap(([field, value]) =>
      value ? validateUrlHint(row, field, value) : [],
    ),
    ...validateOpenFigiHint(row),
  ];
}

export function validateCompanySeedRows(
  source: string,
  options: CompanySeedValidationOptions = {},
): CompanySeedValidationResult {
  const rows = parseCsv(source).map(rowFromCsv);
  const issues: ThemeValidationIssue[] = [];

  for (const row of rows) {
    const required: Array<[keyof ThemeCompanySeedRow, string, string]> = [
      [
        "themeCode",
        "theme_id",
        THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_THEME_ID,
      ],
      [
        "ticker",
        "ticker",
        THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_TICKER,
      ],
      [
        "companyName",
        "company_name",
        THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_COMPANY_NAME,
      ],
      [
        "initialInclusionMethod",
        "initial_inclusion_method",
        THEME_REASON_CODES.SEED_VALIDATION_FAILED_MISSING_INITIAL_INCLUSION_METHOD,
      ],
    ];

    for (const [field, sourceName, code] of required) {
      if (!row[field]) {
        issues.push({
          code,
          message: `${sourceName} is required.`,
          severity: "ERROR",
          sourceRowNumber: row.sourceRowNumber,
          themeCode: row.themeCode || undefined,
        });
      }
    }

    if (row.apiRetrievable.toLowerCase() !== "yes") {
      issues.push({
        code: THEME_REASON_CODES.SEED_VALIDATION_WARNING_API_NOT_RETRIEVABLE,
        message:
          "api_retrievable is not yes; the row remains validation-only until provider mapping proves it.",
        severity: "WARNING",
        sourceRowNumber: row.sourceRowNumber,
        themeCode: row.themeCode || undefined,
      });
    }

    if (
      options.securityTickers &&
      row.ticker &&
      !options.securityTickers.has(row.ticker.toUpperCase())
    ) {
      issues.push(
        issueForRow(
          row,
          THEME_REASON_CODES.SEED_VALIDATION_WARNING_TICKER_NOT_IN_SECURITY_MASTER,
          `${row.ticker} cannot be mapped to the current security master.`,
        ),
      );
    }

    if (!row.mustPassAlphaTrendGates) {
      issues.push({
        code: THEME_REASON_CODES.SEED_VALIDATION_WARNING_MISSING_GATE_REQUIREMENT,
        message:
          "must_pass_alpha_trend_gates is missing; manual seed rows cannot bypass AlphaTrend gates.",
        severity: "WARNING",
        sourceRowNumber: row.sourceRowNumber,
        themeCode: row.themeCode || undefined,
      });
    }

    issues.push(...validateProviderHints(row));
  }

  return {
    candidateRowsWritten: 0,
    issues,
    rows,
  };
}
