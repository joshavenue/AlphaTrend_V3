import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildPriceReport } from "@/lib/price/report";

function parseArgs(argv: string[]) {
  const themeArg = argv.find((arg) => arg.startsWith("--theme="));

  for (const arg of argv) {
    if (arg !== themeArg) {
      throw new Error(
        `Unknown price:report option "${arg}". Use --theme=... or no args.`,
      );
    }
  }

  return {
    themeRef: themeArg ? themeArg.split("=").slice(1).join("=") : undefined,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  await prisma.$connect();

  try {
    const report = await buildPriceReport(prisma, options.themeRef);

    console.log(JSON.stringify(report, null, 2));
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
