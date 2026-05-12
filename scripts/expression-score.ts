import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPrismaClient } from "@/lib/db/prisma";
import { scoreThemeExpressions } from "@/lib/expression/runner";

function parseArgs(argv: string[]) {
  const options: {
    themeRef?: string;
    ticker?: string;
  } = {};

  for (const arg of argv) {
    if (arg === "--all") {
      options.themeRef = undefined;
    } else if (arg.startsWith("--theme=")) {
      options.themeRef = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--ticker=")) {
      options.ticker = arg.split("=").slice(1).join("=");
    } else {
      throw new Error(
        `Unknown expression:score option "${arg}". Use --all, --theme=..., or --ticker=...`,
      );
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  await prisma.$connect();

  try {
    const result = await scoreThemeExpressions(prisma, options);

    console.log(
      JSON.stringify(
        {
          candidates_scored: result.candidatesScored,
          evidence_written: result.evidenceWritten,
          job_run_id: result.jobRunId,
          rows_read: result.rowsRead,
          rows_written: result.rowsWritten,
          themes: result.themes,
          warnings: result.warnings.length,
        },
        null,
        2,
      ),
    );

    if (result.warnings.length > 0) {
      console.table(
        result.warnings.slice(0, 50).map((warning) => ({
          code: warning.code,
          message: warning.message,
          severity: warning.severity,
          theme: warning.themeCode ?? "",
          ticker: warning.ticker ?? "",
        })),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
