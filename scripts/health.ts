import { envPresence, getEnv } from "@/lib/config/env";
import { redactRecord } from "@/lib/config/redact";
import { checkDatabase } from "@/lib/db/health";

async function main() {
  const env = getEnv();
  const database = await checkDatabase();

  console.log(
    JSON.stringify(
      redactRecord({
        status: "ok",
        service: "alphatrend-v3",
        version: process.env.npm_package_version ?? "0.1.0",
        environment: env.APP_ENV,
        baseUrl: env.APP_BASE_URL,
        database,
        env: envPresence(),
      }),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
