import type { PrismaClient } from "@/generated/prisma/client";
import type {
  ThemeDefinitionSeed,
  ThemeValidationIssue,
} from "@/lib/themes/catalog";

type ThemeDefinitionDbClient = Pick<
  PrismaClient,
  "security" | "themeDefinition"
>;

export type ThemeLoadResult = {
  catalogLoadedThemes: number;
  mvpActiveThemes: number;
  themesWritten: number;
  warnings: ThemeValidationIssue[];
};

function seedEtfSymbols(seed: ThemeDefinitionSeed) {
  if (!Array.isArray(seed.seedEtfs)) {
    return [];
  }

  return seed.seedEtfs
    .map((entry) => {
      if (entry && typeof entry === "object" && "symbol" in entry) {
        return String(entry.symbol);
      }

      return "";
    })
    .filter(Boolean);
}

async function validateSeedEtfsExist(
  prisma: ThemeDefinitionDbClient,
  seeds: ThemeDefinitionSeed[],
) {
  const warnings: ThemeValidationIssue[] = [];
  const symbols = [...new Set(seeds.flatMap(seedEtfSymbols))];

  if (symbols.length === 0) {
    return warnings;
  }

  const securities = await prisma.security.findMany({
    select: {
      canonicalTicker: true,
    },
    where: {
      canonicalTicker: {
        in: symbols,
      },
      isEtf: true,
    },
  });
  const found = new Set(securities.map((security) => security.canonicalTicker));

  for (const seed of seeds) {
    for (const symbol of seedEtfSymbols(seed)) {
      if (!found.has(symbol)) {
        warnings.push({
          code: "THEME_VALIDATION_WARNING_SEED_ETF_NOT_IN_SECURITY_MASTER",
          message: `${symbol} is not present as an ETF in the current security master.`,
          severity: "WARNING",
          themeCode: seed.sourceThemeCode,
        });
      }
    }
  }

  return warnings;
}

export async function loadThemeDefinitions(
  prisma: ThemeDefinitionDbClient,
  seeds: ThemeDefinitionSeed[],
): Promise<ThemeLoadResult> {
  const warnings = await validateSeedEtfsExist(prisma, seeds);
  let themesWritten = 0;

  for (const seed of seeds) {
    await prisma.themeDefinition.upsert({
      create: seed,
      update: {
        candidateIndustries: seed.candidateIndustries,
        candidateScreenerRules: seed.candidateScreenerRules,
        defaultDashboardState: seed.defaultDashboardState,
        directBeneficiaryCategories: seed.directBeneficiaryCategories,
        economicMechanism: seed.economicMechanism,
        excludedCategories: seed.excludedCategories,
        indirectBeneficiaryCategories: seed.indirectBeneficiaryCategories,
        invalidationRules: seed.invalidationRules,
        liquidityRules: seed.liquidityRules,
        priceConfirmationRules: seed.priceConfirmationRules,
        pricingPowerPoints: seed.pricingPowerPoints,
        primaryDemandDrivers: seed.primaryDemandDrivers,
        requiredEconomicProof: seed.requiredEconomicProof,
        requiredFundamentalProof: seed.requiredFundamentalProof,
        seedEtfs: seed.seedEtfs,
        shortDescription: seed.shortDescription,
        sourceDetail: seed.sourceDetail,
        status: seed.status,
        supplyConstraints: seed.supplyConstraints,
        themeName: seed.themeName,
        themeSlug: seed.themeSlug,
        valuationRiskRules: seed.valuationRiskRules,
      },
      where: {
        sourceThemeCode: seed.sourceThemeCode,
      },
    });
    themesWritten += 1;
  }

  return {
    catalogLoadedThemes: seeds.filter(
      (seed) => seed.status === "CATALOG_LOADED",
    ).length,
    mvpActiveThemes: seeds.filter((seed) => seed.status === "ACTIVE_UNSCANNED")
      .length,
    themesWritten,
    warnings,
  };
}
