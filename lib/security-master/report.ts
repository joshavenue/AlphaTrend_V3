import type {
  PersistSecurityMasterResult,
  SecurityMasterSummary,
} from "@/lib/security-master/types";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatSecurityMasterReport(input: {
  jobRunId: string;
  summary: SecurityMasterSummary;
  persistence: PersistSecurityMasterResult;
  providerStatuses: Array<{
    provider: string;
    endpoint: string;
    status: string;
    rows: number;
    error?: string;
  }>;
}) {
  const providerRows = input.providerStatuses.map((row) =>
    [
      row.provider.padEnd(15),
      row.endpoint.padEnd(22),
      row.status.padEnd(14),
      String(row.rows).padStart(7),
      row.error ?? "",
    ].join(" | "),
  );

  return [
    `security_master_refresh ${input.jobRunId}`,
    "",
    "provider          | endpoint               | status         | rows    | error",
    "------------------|------------------------|----------------|---------|------",
    ...providerRows,
    "",
    `records_built:       ${formatNumber(input.summary.recordsBuilt)}`,
    `active_common:       ${formatNumber(input.summary.activeCommonStocks)}`,
    `etfs:                ${formatNumber(input.summary.etfs)}`,
    `adrs:                ${formatNumber(input.summary.adrs)}`,
    `delisted:            ${formatNumber(input.summary.delisted)}`,
    `review_required:     ${formatNumber(input.summary.reviewRequired)}`,
    `skipped_test_issues: ${formatNumber(input.summary.skippedTestIssues)}`,
    `warnings:            ${formatNumber(input.summary.warnings)}`,
    `missing_cik:         ${formatNumber(input.summary.missingCik)}`,
    `missing_figi:        ${formatNumber(input.summary.missingFigi)}`,
    "",
    `securities_written:  ${formatNumber(input.persistence.securitiesWritten)}`,
    `identifiers_written: ${formatNumber(input.persistence.identifiersWritten)}`,
    `job_items_written:   ${formatNumber(input.persistence.jobItemsWritten)}`,
    `evidence_written:    ${formatNumber(input.persistence.evidenceWritten)}`,
  ].join("\n");
}
