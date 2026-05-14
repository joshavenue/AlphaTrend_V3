import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPrismaClient } from "@/lib/db/prisma";
import {
  checkProviderSmokeGate,
  DEFAULT_PROVIDER_SMOKE_MAX_AGE_MINUTES,
  type ProviderSmokeGateOptions,
} from "@/lib/ops/provider-smoke-gate";

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

export function parseProviderSmokeGateArgs(argv: string[]) {
  const options: ProviderSmokeGateOptions = {
    maxAgeMinutes: DEFAULT_PROVIDER_SMOKE_MAX_AGE_MINUTES,
  };

  for (const arg of argv) {
    if (arg.startsWith("--max-age-minutes=")) {
      options.maxAgeMinutes = parsePositiveInteger(
        arg.split("=").slice(1).join("="),
        "max-age-minutes",
      );
    } else {
      throw new Error(
        `Unknown provider smoke gate option "${arg}". Use --max-age-minutes=180.`,
      );
    }
  }

  return options;
}

async function main() {
  const options = parseProviderSmokeGateArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  try {
    await prisma.$connect();

    const result = await checkProviderSmokeGate(prisma, options);

    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
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
