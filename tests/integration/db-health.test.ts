import { describe, expect, it } from "vitest";

import { checkDatabase } from "@/lib/db/health";

describe("database health", () => {
  it("returns unconfigured when DATABASE_URL is missing", async () => {
    await expect(checkDatabase("")).resolves.toEqual({
      status: "unconfigured",
      detail: "DATABASE_URL missing",
    });
  });

  it("opens a real database connection when DATABASE_URL is configured", async () => {
    if (!process.env.DATABASE_URL) {
      expect(process.env.DATABASE_URL).toBeFalsy();
      return;
    }

    await expect(checkDatabase(process.env.DATABASE_URL)).resolves.toEqual({
      status: "ok",
      detail: "connection opened",
    });
  });
});
