import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPrismaClient } from "@/lib/db/prisma";
import { buildSnapshotReport } from "@/lib/snapshots/report";

function parseArgs(argv: string[]) {
  const options: {
    themeRef?: string;
  } = {};

  for (const arg of argv) {
    if (arg.startsWith("--theme=")) {
      options.themeRef = arg.split("=").slice(1).join("=");
    } else {
      throw new Error(
        `Unknown snapshots:report option "${arg}". Use --theme=... or no options for all active themes.`,
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
    const report = await buildSnapshotReport(prisma, options.themeRef);
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
