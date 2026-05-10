import { type CsvRecord, parseCsv } from "@/lib/themes/csv";
import type { ThemeValidationIssue } from "@/lib/themes/catalog";

export type ThemeCompanySeedRow = {
  apiRetrievable: string;
  candidateRankWithinTheme: string;
  companyName: string;
  initialInclusionMethod: string;
  mustPassAlphaTrendGates: string;
  notes: string;
  sourceRowNumber: number;
  themeCode: string;
  ticker: string;
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
    candidateRankWithinTheme: value(record, "candidate_rank_within_theme"),
    companyName: value(record, "company_name"),
    initialInclusionMethod: value(record, "initial_inclusion_method"),
    mustPassAlphaTrendGates: value(record, "must_pass_alpha_trend_gates"),
    notes: value(record, "notes"),
    sourceRowNumber: record.sourceRowNumber,
    themeCode: value(record, "theme_id"),
    ticker: value(record, "ticker"),
  };
}

export function validateCompanySeedRows(
  source: string,
): CompanySeedValidationResult {
  const rows = parseCsv(source).map(rowFromCsv);
  const issues: ThemeValidationIssue[] = [];

  for (const row of rows) {
    const required: Array<[keyof ThemeCompanySeedRow, string]> = [
      ["themeCode", "theme_id"],
      ["ticker", "ticker"],
      ["companyName", "company_name"],
      ["initialInclusionMethod", "initial_inclusion_method"],
    ];

    for (const [field, sourceName] of required) {
      if (!row[field]) {
        issues.push({
          code: `THEME_SEED_VALIDATION_FAILED_MISSING_${sourceName.toUpperCase()}`,
          message: `${sourceName} is required.`,
          severity: "ERROR",
          sourceRowNumber: row.sourceRowNumber,
          themeCode: row.themeCode || undefined,
        });
      }
    }

    if (row.apiRetrievable.toLowerCase() !== "yes") {
      issues.push({
        code: "THEME_SEED_VALIDATION_WARNING_API_NOT_RETRIEVABLE",
        message:
          "api_retrievable is not yes; the row remains validation-only until provider mapping proves it.",
        severity: "WARNING",
        sourceRowNumber: row.sourceRowNumber,
        themeCode: row.themeCode || undefined,
      });
    }

    if (!row.mustPassAlphaTrendGates) {
      issues.push({
        code: "THEME_SEED_VALIDATION_WARNING_MISSING_GATE_REQUIREMENT",
        message:
          "must_pass_alpha_trend_gates is missing; manual seed rows cannot bypass AlphaTrend gates.",
        severity: "WARNING",
        sourceRowNumber: row.sourceRowNumber,
        themeCode: row.themeCode || undefined,
      });
    }
  }

  return {
    candidateRowsWritten: 0,
    issues,
    rows,
  };
}
