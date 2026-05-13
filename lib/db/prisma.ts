import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Prisma } from "@/generated/prisma/client";

const TEST_UNAVAILABLE_DATABASE_URL =
  "postgresql://v3_test_skip:v3_test_skip@127.0.0.1:1/v3_test_skip";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

function prismaLogLevels(): Prisma.LogLevel[] {
  if (process.env.NODE_ENV === "test") {
    return [];
  }

  return process.env.APP_ENV === "production" ? ["error"] : ["warn", "error"];
}

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    if (
      process.env.NODE_ENV === "test" &&
      process.env.V3_TEST_DATABASE_UNAVAILABLE === "1"
    ) {
      return new PrismaClient({
        adapter: new PrismaPg({
          connectionString: TEST_UNAVAILABLE_DATABASE_URL,
        }),
        log: [],
      });
    }

    throw new Error("DATABASE_URL is required to create a Prisma client.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
    }),
    log: prismaLogLevels(),
  });
}

export function getPrismaClient() {
  if (!globalForPrisma.prismaClient) {
    globalForPrisma.prismaClient = createPrismaClient();
  }

  return globalForPrisma.prismaClient;
}
