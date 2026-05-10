import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createPrismaClient } from "@/lib/db/prisma";
import {
  buildThemeCatalog,
  type ThemeValidationIssue,
} from "@/lib/themes/catalog";
import { loadThemeDefinitions } from "@/lib/themes/persist";

const DEFAULT_CATALOG_PATH = resolve(
  process.cwd(),
  "data/theme-seeds/AlphaTrend_V3_theme_catalog.csv",
);

function parseArgs(argv: string[]) {
  const [action = "validate", ...rest] = argv;
  const catalogArg = rest.find((arg) => arg.startsWith("--catalog="));

  return {
    action,
    catalogPath: catalogArg
      ? resolve(catalogArg.split("=").slice(1).join("="))
      : resolve(process.env.THEME_CATALOG_PATH ?? DEFAULT_CATALOG_PATH),
  };
}

function hasErrors(issues: ThemeValidationIssue[]) {
  return issues.some((issue) => issue.severity === "ERROR");
}

function printIssues(issues: ThemeValidationIssue[]) {
  if (issues.length === 0) {
    return;
  }

  console.table(
    issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      row: issue.sourceRowNumber ?? "",
      severity: issue.severity,
      theme: issue.themeCode ?? "",
    })),
  );
}

async function validate(catalogPath: string) {
  const source = await readFile(catalogPath, "utf8");
  const result = buildThemeCatalog(source);

  printIssues(result.issues);

  console.log(
    JSON.stringify(
      {
        active_mvp_themes: result.seeds.filter(
          (seed) => seed.status === "ACTIVE_UNSCANNED",
        ).length,
        catalog_path: catalogPath,
        catalog_themes: result.seeds.length,
        errors: result.issues.filter((issue) => issue.severity === "ERROR")
          .length,
        warnings: result.issues.filter((issue) => issue.severity === "WARNING")
          .length,
      },
      null,
      2,
    ),
  );

  if (hasErrors(result.issues)) {
    process.exitCode = 1;
  }

  return result;
}

async function load(catalogPath: string) {
  const source = await readFile(catalogPath, "utf8");
  const result = buildThemeCatalog(source);

  if (hasErrors(result.issues)) {
    printIssues(result.issues);
    throw new Error("Theme catalog validation failed; load aborted.");
  }

  const prisma = createPrismaClient();

  await prisma.$connect();

  try {
    const loaded = await loadThemeDefinitions(prisma, result.seeds);
    const warnings = [
      ...result.issues.filter((issue) => issue.severity === "WARNING"),
      ...loaded.warnings,
    ];

    printIssues(warnings);
    console.log(
      JSON.stringify(
        {
          active_mvp_themes: loaded.mvpActiveThemes,
          catalog_loaded_themes: loaded.catalogLoadedThemes,
          catalog_path: catalogPath,
          themes_written: loaded.themesWritten,
          warnings: warnings.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function listThemes() {
  const prisma = createPrismaClient();

  await prisma.$connect();

  try {
    const themes = await prisma.themeDefinition.findMany({
      orderBy: {
        sourceThemeCode: "asc",
      },
      select: {
        defaultDashboardState: true,
        sourceThemeCode: true,
        status: true,
        themeName: true,
        themeSlug: true,
      },
    });

    console.table(
      themes.map((theme) => ({
        dashboard: theme.defaultDashboardState,
        name: theme.themeName,
        slug: theme.themeSlug,
        status: theme.status,
        theme: theme.sourceThemeCode ?? "",
      })),
    );
    console.log(JSON.stringify({ themes: themes.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.action === "validate") {
    await validate(options.catalogPath);
  } else if (options.action === "load") {
    await load(options.catalogPath);
  } else if (options.action === "list") {
    await listThemes();
  } else {
    throw new Error(
      `Unknown themes action "${options.action}". Use validate, load, or list.`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
