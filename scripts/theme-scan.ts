import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ProviderName } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/prisma";
import {
  runThemeScanOrchestration,
  type ThemeScanOrchestrationOptions,
} from "@/lib/ops/runner";

function failurePayload(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const operationalSummary =
    typeof error === "object" && error && "operationalSummary" in error
      ? (error as { operationalSummary?: unknown }).operationalSummary
      : undefined;

  return {
    error: message,
    operational_summary: operationalSummary,
    status: "FAILED",
  };
}

function parseBoolean(value: string) {
  if (["off", "false", "0", "no"].includes(value.toLowerCase())) {
    return false;
  }

  if (["on", "true", "1", "yes"].includes(value.toLowerCase())) {
    return true;
  }

  throw new Error(`Unsupported boolean value: ${value}`);
}

function readValue(argv: string[], index: number, arg: string) {
  if (arg.includes("=")) {
    return arg.split("=").slice(1).join("=");
  }

  const next = argv[index + 1];

  if (!next || next.startsWith("--")) {
    throw new Error(`Missing value for ${arg}`);
  }

  return next;
}

export function parseThemeScanArgs(argv: string[]) {
  const options: ThemeScanOrchestrationOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--all") {
      options.themeRef = undefined;
    } else if (arg === "--theme" || arg.startsWith("--theme=")) {
      options.themeRef = readValue(argv, index, arg);
      if (!arg.includes("=")) {
        index += 1;
      }
    } else if (arg === "--include-demand") {
      options.includeDemand = true;
    } else if (arg.startsWith("--demand=")) {
      options.includeDemand = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--advanced=")) {
      options.includeAdvanced = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--demand-provider=")) {
      options.demandProvider = arg
        .split("=")
        .slice(1)
        .join("=")
        .toUpperCase() as ProviderName;
    } else if (arg.startsWith("--candidate-fmp=")) {
      options.candidateIncludeFmp = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--manual-seeds=")) {
      options.candidateIncludeManualSeeds = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--exposure-fmp=")) {
      options.exposureIncludeFmp = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--exposure-sec=")) {
      options.exposureIncludeSec = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--fundamentals-fmp=")) {
      options.fundamentalsIncludeFmp = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--fundamentals-sec=")) {
      options.fundamentalsIncludeSec = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--price-fmp=")) {
      options.priceIncludeFmp = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--price-massive=")) {
      options.priceIncludeMassive = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--liquidity-fmp=")) {
      options.liquidityIncludeFmp = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--liquidity-massive=")) {
      options.liquidityIncludeMassive = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--liquidity-sec=")) {
      options.liquidityIncludeSec = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--fmp=")) {
      const enabled = parseBoolean(arg.split("=")[1]);
      options.candidateIncludeFmp = enabled;
      options.exposureIncludeFmp = enabled;
      options.fundamentalsIncludeFmp = enabled;
      options.priceIncludeFmp = enabled;
      options.liquidityIncludeFmp = enabled;
    } else if (arg.startsWith("--massive=")) {
      const enabled = parseBoolean(arg.split("=")[1]);
      options.priceIncludeMassive = enabled;
      options.liquidityIncludeMassive = enabled;
    } else if (arg.startsWith("--sec=")) {
      const enabled = parseBoolean(arg.split("=")[1]);
      options.exposureIncludeSec = enabled;
      options.fundamentalsIncludeSec = enabled;
      options.liquidityIncludeSec = enabled;
    } else {
      throw new Error(
        `Unknown job:theme-scan option "${arg}". Use --all, --theme=..., --include-demand, --advanced=off, --fmp=off, --massive=off, or layer-specific provider flags.`,
      );
    }
  }

  return options;
}

async function main() {
  const options = parseThemeScanArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  try {
    await prisma.$connect();

    const result = await runThemeScanOrchestration(prisma, options);

    console.log(
      JSON.stringify(
        {
          job_run_id: result.jobRunId,
          provider_calls: result.providerCalls,
          rows_read: result.rowsRead,
          rows_written: result.rowsWritten,
          scope_id: result.scopeId,
          stages: result.stages,
          status: result.status,
        },
        null,
        2,
      ),
    );

    process.exitCode = result.status === "FAILED" ? 1 : 0;
  } catch (error) {
    console.error(JSON.stringify(failurePayload(error), null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
