import { checkDatabase } from "@/lib/db/health";

async function main() {
  const database = await checkDatabase();
  console.log(JSON.stringify(database, null, 2));

  if (database.status === "error") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
