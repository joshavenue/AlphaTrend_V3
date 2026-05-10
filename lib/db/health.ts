import { sanitizeError } from "@/lib/config/logger";
import { createPrismaClient } from "@/lib/db/prisma";

export type DatabaseHealth =
  | {
      status: "unconfigured";
      detail: "DATABASE_URL missing";
    }
  | {
      status: "ok";
      detail: "connection opened";
    }
  | {
      status: "error";
      detail: string;
    };

export async function checkDatabase(
  databaseUrl = process.env.DATABASE_URL,
): Promise<DatabaseHealth> {
  if (!databaseUrl) {
    return {
      status: "unconfigured",
      detail: "DATABASE_URL missing",
    };
  }

  const client = createPrismaClient(databaseUrl);

  try {
    await client.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      detail: "connection opened",
    };
  } catch (error) {
    return {
      status: "error",
      detail: sanitizeError(error),
    };
  } finally {
    await client.$disconnect();
  }
}
