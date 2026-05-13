import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ProviderName } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/prisma";
import { fetchEconomicDemand } from "@/lib/demand/runner";

function parseArgs(argv: string[]) {
  const options: {
    provider?: ProviderName;
    themeRef?: string;
  } = {};

  for (const arg of argv) {
    if (arg === "--all") {
      options.themeRef = undefined;
    } else if (arg.startsWith("--theme=")) {
      options.themeRef = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--provider=")) {
      options.provider = arg
        .split("=")
        .slice(1)
        .join("=")
        .toUpperCase() as ProviderName;
    } else {
      throw new Error(
        `Unknown demand:fetch option "${arg}". Use --all, --theme=..., or --provider=...`,
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
    const result = await fetchEconomicDemand(prisma, options);

    console.log(
      JSON.stringify(
        {
          evidence_written: result.evidenceWritten,
          feeds_fetched: result.feedsFetched,
          job_run_id: result.jobRunId,
          observations_written: result.observationsWritten,
          provider_calls: result.providerCalls,
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
          feed: warning.feedId ?? "",
          message: warning.message,
          severity: warning.severity,
          theme: warning.themeCode ?? "",
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
