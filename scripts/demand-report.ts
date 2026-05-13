import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildDemandReport } from "@/lib/demand/report";

function parseArgs(argv: string[]) {
  const options: {
    themeRef?: string;
  } = {};

  for (const arg of argv) {
    if (arg.startsWith("--theme=")) {
      options.themeRef = arg.split("=").slice(1).join("=");
    } else {
      throw new Error(
        `Unknown demand:report option "${arg}". Use --theme=... or no options for all active themes.`,
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
    console.log(
      JSON.stringify(
        await buildDemandReport(prisma, options.themeRef),
        null,
        2,
      ),
    );
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
