import { describe, expect, it } from "vitest";

import { evaluateTestDatabaseGuard } from "@/lib/testing/db-guard";
import { runUiSmoke } from "@/lib/testing/ui-smoke";

describe("Phase 15 test hardening guards", () => {
  it("blocks tests in production environments", () => {
    expect(
      evaluateTestDatabaseGuard({
        appEnv: "vercel-production",
        databaseUrl: "postgresql://user:secret@127.0.0.1:5432/alphatrend",
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("production environment"),
    });
  });

  it("blocks production-named database targets", () => {
    expect(
      evaluateTestDatabaseGuard({
        appEnv: "test",
        databaseUrl: "postgresql://user:secret@127.0.0.1:5432/alphatrend_prod",
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("production-named"),
    });
  });

  it("allows local or tailnet fixture databases", () => {
    expect(
      evaluateTestDatabaseGuard({
        appEnv: "hetzner-dev",
        databaseUrl: "postgresql://user:secret@127.0.0.1:5433/alphatrend",
      }),
    ).toMatchObject({
      databaseConfigured: true,
      host: "127.0.0.1",
      ok: true,
    });

    expect(
      evaluateTestDatabaseGuard({
        appEnv: "hetzner-dev",
        databaseUrl: "postgresql://user:secret@100.79.23.21:5433/alphatrend",
      }),
    ).toMatchObject({
      databaseConfigured: true,
      host: "100.79.23.21",
      ok: true,
    });
  });

  it("requires an explicit database for DB-only commands", () => {
    expect(
      evaluateTestDatabaseGuard({
        appEnv: "test",
        databaseUrl: "",
        requireDatabase: true,
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("required"),
    });
  });

  it("passes the static UI smoke contract", () => {
    const result = runUiSmoke(process.cwd());

    expect(result.ok).toBe(true);
    expect(result.checkedFiles).toBeGreaterThan(0);
  });
});
