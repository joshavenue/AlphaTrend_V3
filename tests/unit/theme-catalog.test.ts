import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildThemeCatalog, normalizeThemeLabel } from "@/lib/themes/catalog";
import { validateCompanySeedRows } from "@/lib/themes/company-seeds";
import { parseCsv, splitSemicolonList } from "@/lib/themes/csv";

const catalogPath = resolve(
  process.cwd(),
  "data/theme-seeds/AlphaTrend_V3_theme_catalog.csv",
);
const companySeedPath = resolve(
  process.cwd(),
  "data/theme-seeds/AlphaTrend_V3_theme_company_seed_universe.csv",
);

describe("theme catalog CSV transform", () => {
  it("parses quoted CSV fields and semicolon lists deterministically", () => {
    const records = parseCsv(
      'theme_id,theme_name,theme_mechanism,seed_etfs\nT001,"AI, Compute","GPU, ASIC demand",SMH;SOXX;AIQ\n',
    );

    expect(records).toHaveLength(1);
    expect(records[0].values.theme_name).toBe("AI, Compute");
    expect(splitSemicolonList(records[0].values.seed_etfs)).toEqual([
      "SMH",
      "SOXX",
      "AIQ",
    ]);
  });

  it("maps T001 source_theme_code separately from the database UUID", () => {
    const catalog = buildThemeCatalog(
      readFileSync(catalogPath, "utf8"),
      new Date("2026-05-10T00:00:00.000Z"),
    );
    const seed = catalog.seeds.find((item) => item.sourceThemeCode === "T001");

    expect(seed).toBeDefined();
    expect(seed?.sourceThemeCode).toBe("T001");
    expect(seed?.themeSlug).toBe("ai-semiconductor-compute");
    expect(seed?.status).toBe("ACTIVE_UNSCANNED");
    expect(seed?.defaultDashboardState).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("keeps the MVP activation count and catalog backlog deterministic", () => {
    const catalog = buildThemeCatalog(readFileSync(catalogPath, "utf8"));

    expect(
      catalog.seeds.filter((seed) => seed.status === "ACTIVE_UNSCANNED"),
    ).toHaveLength(5);
    expect(
      catalog.seeds.filter((seed) => seed.status === "CATALOG_LOADED"),
    ).toHaveLength(30);
  });

  it("normalizes direct categories to matchable labels", () => {
    expect(normalizeThemeLabel("GPUs")).toBe("gpu");
    expect(normalizeThemeLabel("custom ASICs")).toBe("custom asic");

    const catalog = buildThemeCatalog(readFileSync(catalogPath, "utf8"));
    const seed = catalog.seeds.find((item) => item.sourceThemeCode === "T001");
    const directCategories = seed?.directBeneficiaryCategories as Array<{
      display_label: string;
      normalized_label: string;
    }>;

    expect(directCategories).toContainEqual(
      expect.objectContaining({
        display_label: "GPUs",
        normalized_label: "gpu",
      }),
    );
  });

  it("uses curated first-five MVP proof and exclusion detail", () => {
    const catalog = buildThemeCatalog(readFileSync(catalogPath, "utf8"));
    const storage = catalog.seeds.find(
      (item) => item.sourceThemeCode === "T002",
    );
    const directCategories = storage?.directBeneficiaryCategories as Array<{
      display_label: string;
    }>;
    const exclusions = storage?.excludedCategories as Array<{
      display_label: string;
    }>;
    const proof = storage?.requiredEconomicProof as Array<{
      source: string;
    }>;

    expect(directCategories).toContainEqual(
      expect.objectContaining({ display_label: "enterprise SSD" }),
    );
    expect(exclusions).toContainEqual(
      expect.objectContaining({
        display_label: "AI software without storage revenue",
      }),
    );
    expect(proof.every((item) => item.source.includes("curated_mvp"))).toBe(
      true,
    );
  });

  it("fails validation when required categories or proof fields are empty", () => {
    const invalidCatalog =
      "theme_id,theme_name,theme_category,theme_mechanism,seed_etfs,direct_categories,excluded_categories,company_count_in_seed_csv,fmp_seed_etf_holdings_endpoints,api_generation_rule,default_dashboard_status,created_date\n" +
      "T999,Broken Theme,Test,Specific mechanism,SMH,,generic software,0,https://financialmodelingprep.com/stable/etf/holdings?symbol=SMH,Seed from ETF,neutral_until_scored,2026-05-08\n";
    const catalog = buildThemeCatalog(invalidCatalog);

    expect(catalog.issues).toContainEqual(
      expect.objectContaining({
        code: "THEME_VALIDATION_FAILED_MISSING_DIRECT_CATEGORIES",
        severity: "ERROR",
      }),
    );
    expect(catalog.seeds).toHaveLength(0);
  });

  it("fails validation for unsupported dashboard defaults", () => {
    const invalidCatalog =
      "theme_id,theme_name,theme_category,theme_mechanism,seed_etfs,direct_categories,excluded_categories,company_count_in_seed_csv,fmp_seed_etf_holdings_endpoints,api_generation_rule,default_dashboard_status,created_date\n" +
      "T999,Broken Theme,Test,Specific mechanism,SMH,test direct supplier,generic unrelated software,0,https://financialmodelingprep.com/stable/etf/holdings?symbol=SMH,Seed from ETF,hot_buy_now,2026-05-08\n";
    const catalog = buildThemeCatalog(invalidCatalog);

    expect(catalog.issues).toContainEqual(
      expect.objectContaining({
        code: "THEME_VALIDATION_FAILED_INVALID_DASHBOARD_STATUS",
        severity: "ERROR",
      }),
    );
    expect(catalog.seeds).toHaveLength(0);
  });

  it("fails validation for duplicate source theme codes", () => {
    const duplicateCatalog =
      "theme_id,theme_name,theme_category,theme_mechanism,seed_etfs,direct_categories,excluded_categories,company_count_in_seed_csv,fmp_seed_etf_holdings_endpoints,api_generation_rule,default_dashboard_status,created_date\n" +
      "T998,First Theme,Test,Specific mechanism,SMH,test direct supplier,generic unrelated software,0,https://financialmodelingprep.com/stable/etf/holdings?symbol=SMH,Seed from ETF,neutral_until_scored,2026-05-08\n" +
      "T998,Second Theme,Test,Specific mechanism,SMH,test direct supplier,generic unrelated software,0,https://financialmodelingprep.com/stable/etf/holdings?symbol=SMH,Seed from ETF,neutral_until_scored,2026-05-08\n";
    const catalog = buildThemeCatalog(duplicateCatalog);

    expect(catalog.issues).toContainEqual(
      expect.objectContaining({
        code: "THEME_VALIDATION_FAILED_DUPLICATE_THEME_ID",
        severity: "ERROR",
      }),
    );
    expect(catalog.seeds).toHaveLength(1);
  });

  it("warns when non-MVP catalog themes still use derived proof placeholders", () => {
    const catalog = buildThemeCatalog(readFileSync(catalogPath, "utf8"));

    expect(catalog.seeds).toHaveLength(35);
    expect(catalog.issues).toContainEqual(
      expect.objectContaining({
        code: "THEME_VALIDATION_WARNING_DERIVED_ECONOMIC_PROOF",
        severity: "WARNING",
        themeCode: "T003",
      }),
    );
  });
});

describe("theme company seed universe boundary", () => {
  it("validates manual company seed rows without creating investable candidates", () => {
    const result = validateCompanySeedRows(
      readFileSync(companySeedPath, "utf8"),
    );

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.candidateRowsWritten).toBe(0);
    expect(result.issues.some((issue) => issue.severity === "ERROR")).toBe(
      false,
    );
  });

  it("warns when company seed provider hints or security mapping are not usable", () => {
    const csv =
      "theme_id,ticker,company_name,initial_inclusion_method,api_retrievable,must_pass_alpha_trend_gates,fmp_profile_endpoint,openfigi_mapping_payload_hint\n" +
      'T001,ZZZ,Example Co,manual_seed_for_api_validation,yes,T1 gates,not-a-url,"{""idType"":""TICKER"",""idValue"":""BAD"",""exchCode"":""US""}"\n';
    const result = validateCompanySeedRows(csv, {
      securityTickers: new Set(["NVDA"]),
    });

    expect(result.candidateRowsWritten).toBe(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "THEME_SEED_VALIDATION_WARNING_MALFORMED_PROVIDER_ENDPOINT_HINT",
        severity: "WARNING",
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "THEME_SEED_VALIDATION_WARNING_OPENFIGI_TICKER_MISMATCH",
        severity: "WARNING",
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "THEME_SEED_VALIDATION_WARNING_TICKER_NOT_IN_SECURITY_MASTER",
        severity: "WARNING",
      }),
    );
  });
});
