import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ProviderName } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/prisma";
import {
  runDemandRefreshOrchestration,
  type DemandRefreshOrchestrationOptions,
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

export function parseDemandJobArgs(argv: string[]) {
  const options: DemandRefreshOrchestrationOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--all") {
      options.themeRef = undefined;
    } else if (arg === "--theme" || arg.startsWith("--theme=")) {
      options.themeRef = readValue(argv, index, arg);
      if (!arg.includes("=")) {
        index += 1;
      }
    } else if (arg === "--provider" || arg.startsWith("--provider=")) {
      options.provider = readValue(
        argv,
        index,
        arg,
      ).toUpperCase() as ProviderName;
      if (!arg.includes("=")) {
        index += 1;
      }
    } else if (arg.startsWith("--snapshots=")) {
      options.includeSnapshots = parseBoolean(arg.split("=")[1]);
    } else if (arg.startsWith("--alerts=")) {
      options.includeAlerts = parseBoolean(arg.split("=")[1]);
    } else {
      throw new Error(
        `Unknown job:demand option "${arg}". Use --all, --theme=..., --provider=..., --snapshots=off, or --alerts=off.`,
      );
    }
  }

  return options;
}

async function main() {
  const options = parseDemandJobArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  try {
    await prisma.$connect();

    const result = await runDemandRefreshOrchestration(prisma, options);

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
