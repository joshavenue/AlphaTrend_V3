import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildThemeCatalog } from "@/lib/themes/catalog";
import { loadThemeDefinitions } from "@/lib/themes/persist";

const databaseUrl = process.env.DATABASE_URL;

describe("Phase 4 theme definition persistence", () => {
  let prisma: ReturnType<typeof createPrismaClient> | undefined;

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }

    prisma = createPrismaClient(databaseUrl);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("upserts theme definitions with provenance and default dashboard state", async () => {
    if (!databaseUrl || !prisma) {
      expect(databaseUrl).toBeUndefined();
      return;
    }

    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const themeCode = `P4${suffix}`;
    const csv =
      "theme_id,theme_name,theme_category,theme_mechanism,seed_etfs,direct_categories,excluded_categories,company_count_in_seed_csv,fmp_seed_etf_holdings_endpoints,api_generation_rule,default_dashboard_status,created_date\n" +
      `${themeCode},Phase 4 Test Theme ${suffix},Test / Theme,Specific economic demand creates a testable bottleneck,SMH,test direct supplier,generic unrelated software,0,https://financialmodelingprep.com/stable/etf/holdings?symbol=SMH,Seed from ETF then apply gates,neutral_until_scored,2026-05-08\n`;

    try {
      const catalog = buildThemeCatalog(
        csv,
        new Date("2026-05-10T00:00:00.000Z"),
      );

      expect(catalog.issues.some((issue) => issue.severity === "ERROR")).toBe(
        false,
      );

      const firstLoad = await loadThemeDefinitions(prisma, catalog.seeds);
      const secondLoad = await loadThemeDefinitions(prisma, catalog.seeds);

      expect(firstLoad.themesWritten).toBe(1);
      expect(secondLoad.themesWritten).toBe(1);

      const themes = await prisma.themeDefinition.findMany({
        where: {
          sourceThemeCode: themeCode,
        },
      });

      expect(themes).toHaveLength(1);
      expect(themes[0]).toMatchObject({
        defaultDashboardState: "INSUFFICIENT_EVIDENCE",
        sourceThemeCode: themeCode,
        status: "CATALOG_LOADED",
      });
      expect(themes[0].sourceDetail).toMatchObject({
        loader_version: "phase4_theme_loader_2026_05_10",
        source_theme_code: themeCode,
      });
    } finally {
      await prisma.themeDefinition.deleteMany({
        where: {
          sourceThemeCode: themeCode,
        },
      });
    }
  });
});
