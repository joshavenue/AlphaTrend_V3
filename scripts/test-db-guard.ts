import "dotenv/config";

import { evaluateTestDatabaseGuard } from "@/lib/testing/db-guard";
import {
  canReachDatabaseUrl,
  databaseEndpoint,
} from "@/lib/testing/db-reachability";

function hasFlag(flag: string) {
  return process.argv.slice(2).includes(flag);
}

const result = evaluateTestDatabaseGuard({
  requireDatabase: hasFlag("--require-db"),
});

if (!result.ok) {
  console.error(`[test-db-guard] ${result.reason}`);
  process.exit(1);
}

for (const warning of result.warnings) {
  console.warn(`[test-db-guard] ${warning}`);
}

if (result.databaseConfigured) {
  console.log(
    `[test-db-guard] database host=${result.host} database=${result.databaseName}`,
  );

  if (hasFlag("--require-db")) {
    const databaseUrl =
      process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
    const reachable = databaseUrl
      ? await canReachDatabaseUrl(databaseUrl)
      : false;

    if (!reachable) {
      const endpoint = databaseUrl ? databaseEndpoint(databaseUrl) : null;
      const target = endpoint
        ? `${endpoint.host}:${endpoint.port}/${endpoint.databaseName}`
        : "configured database";
      console.error(`[test-db-guard] database unreachable at ${target}`);
      process.exit(1);
    }
  }
} else {
  console.log("[test-db-guard] database not configured");
}
