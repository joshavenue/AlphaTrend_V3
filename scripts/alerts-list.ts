import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AlertSeverity } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/prisma";

function parseArgs(argv: string[]) {
  const options: {
    limit: number;
    severity?: AlertSeverity;
  } = {
    limit: 25,
  };

  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=").slice(1).join("="));
    } else if (arg.startsWith("--severity=")) {
      options.severity = arg.split("=").slice(1).join("=") as AlertSeverity;
    } else {
      throw new Error(
        `Unknown alerts:list option "${arg}". Use --limit=... or --severity=...`,
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
    const rows = await prisma.alert.findMany({
      include: {
        security: {
          select: {
            canonicalTicker: true,
          },
        },
        theme: {
          select: {
            sourceThemeCode: true,
            themeName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: Math.max(1, Math.min(200, options.limit)),
      where: {
        severity: options.severity,
      },
    });

    console.table(
      rows.map((row) => ({
        alert_id: row.alertId,
        created_at: row.createdAt.toISOString(),
        read: row.readAt ? "yes" : "no",
        severity: row.severity,
        theme: row.theme?.sourceThemeCode ?? row.theme?.themeName ?? "",
        ticker: row.security?.canonicalTicker ?? "",
        title: row.title,
        type: row.alertType,
      })),
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
