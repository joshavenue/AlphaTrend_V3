import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { evaluateAlerts } from "@/lib/alerts/runner";
import { createPrismaClient } from "@/lib/db/prisma";

function parseArgs(argv: string[]) {
  const options: {
    themeRef?: string;
  } = {};

  for (const arg of argv) {
    if (arg === "--all") {
      options.themeRef = undefined;
    } else if (arg.startsWith("--theme=")) {
      options.themeRef = arg.split("=").slice(1).join("=");
    } else {
      throw new Error(
        `Unknown alerts:evaluate option "${arg}". Use --all or --theme=...`,
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
    const result = await evaluateAlerts(prisma, options);

    console.log(
      JSON.stringify(
        {
          alerts_created: result.alertsCreated,
          baselines_created: result.baselinesCreated,
          changes_suppressed: result.changesSuppressed,
          job_run_id: result.jobRunId,
          rows_read: result.rowsRead,
          rows_written: result.rowsWritten,
          signal_states_written: result.signalStatesWritten,
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
