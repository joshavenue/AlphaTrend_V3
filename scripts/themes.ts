import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createPrismaClient } from "@/lib/db/prisma";
import { hashPayload, insertEvidence } from "@/lib/evidence";
import {
  buildThemeCatalog,
  THEME_LOADER_VERSION,
  type ThemeValidationIssue,
} from "@/lib/themes/catalog";
import { loadThemeDefinitions } from "@/lib/themes/persist";

const LOCK_KEY = "theme_definition:load";
const LOCK_TTL_MS = 30 * 60 * 1_000;
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

function shortError(error: string | undefined) {
  if (!error) {
    return undefined;
  }

  return error.length > 120 ? `${error.slice(0, 117)}...` : error;
}

async function acquireLock(
  prisma: ReturnType<typeof createPrismaClient>,
  jobRunId: string,
) {
  const now = new Date();

  await prisma.jobLock.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
      lockKey: LOCK_KEY,
    },
  });

  try {
    await prisma.jobLock.create({
      data: {
        expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
        jobRunId,
        lockKey: LOCK_KEY,
        ownerId: "theme-loader-cli",
      },
    });
  } catch {
    throw new Error("THEME_DEFINITION_LOAD is already running.");
  }
}

async function releaseLock(
  prisma: ReturnType<typeof createPrismaClient>,
  jobRunId: string,
) {
  await prisma.jobLock.deleteMany({
    where: {
      jobRunId,
      lockKey: LOCK_KEY,
    },
  });
}

async function writeThemeLoadEvidence(
  prisma: ReturnType<typeof createPrismaClient>,
  input: {
    activeMvpThemes: number;
    catalogLoadedThemes: number;
    catalogPath: string;
    jobRunId: string;
    sourceThemeCodes: string[];
    themesWritten: number;
    totalWarnings: number;
  },
) {
  const summary = {
    active_mvp_themes: input.activeMvpThemes,
    catalog_loaded_themes: input.catalogLoadedThemes,
    catalog_path: input.catalogPath,
    loader_version: THEME_LOADER_VERSION,
    source_theme_codes: input.sourceThemeCodes,
    themes_written: input.themesWritten,
    warnings: input.totalWarnings,
  };

  await insertEvidence(prisma, {
    entityId: "AlphaTrend_V3_theme_catalog.csv",
    entityType: "THEME_CATALOG",
    evidenceGrade: "B",
    jobRunId: input.jobRunId,
    metricName: "theme_definition_load_summary",
    metricValueNum: input.themesWritten,
    metricValueText: JSON.stringify({
      active_mvp_themes: input.activeMvpThemes,
      catalog_loaded_themes: input.catalogLoadedThemes,
      loader_version: THEME_LOADER_VERSION,
      warnings: input.totalWarnings,
    }),
    provider: "ALPHATREND_INTERNAL",
    sourcePayloadHash: hashPayload(summary),
    sourceUrlOrEndpoint: input.catalogPath,
  });

  return 1;
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
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: "THEME_DEFINITION_LOAD",
      scopeId: "AlphaTrend_V3_theme_catalog.csv",
      scopeType: "theme_catalog",
      status: "STARTED",
    },
  });

  try {
    await acquireLock(prisma, jobRun.jobRunId);

    const loaded = await loadThemeDefinitions(prisma, result.seeds);
    const warnings = [
      ...result.issues.filter((issue) => issue.severity === "WARNING"),
      ...loaded.warnings,
    ];
    const evidenceWritten = await writeThemeLoadEvidence(prisma, {
      activeMvpThemes: loaded.mvpActiveThemes,
      catalogLoadedThemes: loaded.catalogLoadedThemes,
      catalogPath,
      jobRunId: jobRun.jobRunId,
      sourceThemeCodes: result.seeds.map((seed) => seed.sourceThemeCode),
      themesWritten: loaded.themesWritten,
      totalWarnings: warnings.length,
    });

    await prisma.jobRun.update({
      data: {
        finishedAt: new Date(),
        providerCalls: 0,
        rowsRead: result.rows.length,
        rowsWritten: loaded.themesWritten + evidenceWritten,
        status: "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    printIssues(warnings);
    console.log(
      JSON.stringify(
        {
          active_mvp_themes: loaded.mvpActiveThemes,
          catalog_loaded_themes: loaded.catalogLoadedThemes,
          catalog_path: catalogPath,
          evidence_written: evidenceWritten,
          job_run_id: jobRun.jobRunId,
          themes_written: loaded.themesWritten,
          warnings: warnings.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(message),
        finishedAt: new Date(),
        providerCalls: 0,
        rowsRead: result.rows.length,
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    throw error;
  } finally {
    await releaseLock(prisma, jobRun.jobRunId);
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
