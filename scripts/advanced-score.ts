import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  scoreAdvancedLayers,
  scoreBaseRateLayer,
  scoreOwnershipFlowLayer,
} from "@/lib/advanced/runner";
import { createPrismaClient } from "@/lib/db/prisma";

function parseArgs(argv: string[]) {
  const options: {
    layer?: "all" | "t5" | "t7";
    themeRef?: string;
    ticker?: string;
  } = {
    layer: "all",
  };

  for (const arg of argv) {
    if (arg === "--all") {
      options.themeRef = undefined;
    } else if (arg === "--layer=t5" || arg === "--layer=flow") {
      options.layer = "t5";
    } else if (arg === "--layer=t7" || arg === "--layer=base-rate") {
      options.layer = "t7";
    } else if (arg === "--layer=all") {
      options.layer = "all";
    } else if (arg.startsWith("--theme=")) {
      options.themeRef = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--ticker=")) {
      options.ticker = arg.split("=").slice(1).join("=");
    } else {
      throw new Error(
        `Unknown advanced:score option "${arg}". Use --all, --theme=..., --ticker=..., --layer=t5, --layer=t7, or --layer=all.`,
      );
    }
  }

  return options;
}

async function main() {
  const { layer, ...options } = parseArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  await prisma.$connect();

  try {
    const result =
      layer === "t5"
        ? await scoreOwnershipFlowLayer(prisma, options)
        : layer === "t7"
          ? await scoreBaseRateLayer(prisma, options)
          : await scoreAdvancedLayers(prisma, options);

    console.log(JSON.stringify(result, null, 2));
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
