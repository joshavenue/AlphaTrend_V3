import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateCompanySeedRows } from "@/lib/themes/company-seeds";

const DEFAULT_COMPANY_SEED_PATH = resolve(
  process.cwd(),
  "data/theme-seeds/AlphaTrend_V3_theme_company_seed_universe.csv",
);

function parseArgs(argv: string[]) {
  const [action = "validate", ...rest] = argv;
  const seedArg = rest.find((arg) => arg.startsWith("--seeds="));

  return {
    action,
    seedPath: seedArg
      ? resolve(seedArg.split("=").slice(1).join("="))
      : resolve(
          process.env.THEME_COMPANY_SEED_PATH ?? DEFAULT_COMPANY_SEED_PATH,
        ),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = await readFile(options.seedPath, "utf8");
  const result = validateCompanySeedRows(source);
  const errors = result.issues.filter((issue) => issue.severity === "ERROR");

  if (result.issues.length > 0) {
    console.table(
      result.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        row: issue.sourceRowNumber ?? "",
        severity: issue.severity,
        theme: issue.themeCode ?? "",
      })),
    );
  }

  if (options.action === "validate") {
    console.log(
      JSON.stringify(
        {
          candidate_rows_written: 0,
          errors: errors.length,
          seed_path: options.seedPath,
          seed_rows: result.rows.length,
          warnings: result.issues.length - errors.length,
        },
        null,
        2,
      ),
    );
  } else if (options.action === "load") {
    console.log(
      JSON.stringify(
        {
          candidate_rows_written: result.candidateRowsWritten,
          phase_boundary:
            "Phase 4 validates company seed rows but does not create investable theme candidates.",
          seed_path: options.seedPath,
          seed_rows: result.rows.length,
        },
        null,
        2,
      ),
    );
  } else {
    throw new Error(
      `Unknown theme seed action "${options.action}". Use validate or load.`,
    );
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
