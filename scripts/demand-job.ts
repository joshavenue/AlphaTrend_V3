import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ProviderName } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/prisma";
import {
  fetchEconomicDemand,
  scoreEconomicDemandThemes,
} from "@/lib/demand/runner";

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
        `Unknown job:demand option "${arg}". Use --all, --theme=..., or --provider=...`,
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
    const fetchResult = await fetchEconomicDemand(prisma, options);
    const scoreResult = await scoreEconomicDemandThemes(prisma, {
      themeRef: options.themeRef,
    });

    console.log(
      JSON.stringify(
        {
          fetch: {
            evidence_written: fetchResult.evidenceWritten,
            feeds_fetched: fetchResult.feedsFetched,
            job_run_id: fetchResult.jobRunId,
            observations_written: fetchResult.observationsWritten,
            provider_calls: fetchResult.providerCalls,
            rows_read: fetchResult.rowsRead,
            rows_written: fetchResult.rowsWritten,
            warnings: fetchResult.warnings.length,
          },
          score: {
            evidence_written: scoreResult.evidenceWritten,
            job_run_id: scoreResult.jobRunId,
            rows_read: scoreResult.rowsRead,
            rows_written: scoreResult.rowsWritten,
            themes: scoreResult.themes,
            warnings: scoreResult.warnings.length,
          },
        },
        null,
        2,
      ),
    );

    const warnings = [...fetchResult.warnings, ...scoreResult.warnings];

    if (warnings.length > 0) {
      console.table(
        warnings.slice(0, 50).map((warning) => ({
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
