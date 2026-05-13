import {
  canReachDatabaseUrl,
  databaseEndpoint,
} from "@/lib/testing/db-reachability";

const databaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
const requireDatabase = process.env.V3_REQUIRE_DATABASE === "1";

if (databaseUrl) {
  const reachable = await canReachDatabaseUrl(databaseUrl);

  if (!reachable) {
    const endpoint = databaseEndpoint(databaseUrl);
    const target = endpoint
      ? `${endpoint.host}:${endpoint.port}/${endpoint.databaseName}`
      : "configured database";
    const message = `Configured test database is unreachable at ${target}.`;

    if (requireDatabase) {
      throw new Error(message);
    }

    console.warn(`[vitest-db] ${message} DB-backed tests will skip.`);
    process.env.DATABASE_URL = "";
    process.env.DATABASE_URL_TEST = "";
    process.env.V3_TEST_DATABASE_UNAVAILABLE = "1";
  }
}
