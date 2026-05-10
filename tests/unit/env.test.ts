import { describe, expect, it } from "vitest";

import { envPresence, parseEnv } from "@/lib/config/env";

describe("environment validation", () => {
  it("accepts expected Phase 0 variables", () => {
    const env = parseEnv({
      APP_ENV: "hetzner-dev",
      APP_BASE_URL: "http://100.79.23.21:420",
      LOG_LEVEL: "info",
      PROVIDER_TIMEOUT_MS: "30000",
      PROVIDER_MAX_RETRIES: "2",
      DATABASE_URL: "",
      FMP_API_KEY: "example",
    });

    expect(env.APP_ENV).toBe("hetzner-dev");
    expect(env.APP_BASE_URL).toBe("http://100.79.23.21:420");
    expect(env.PROVIDER_TIMEOUT_MS).toBe(30_000);
    expect(env.FMP_API_KEY).toBe("example");
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("rejects malformed timeout values", () => {
    expect(() =>
      parseEnv({
        APP_BASE_URL: "http://100.79.23.21:420",
        PROVIDER_TIMEOUT_MS: "not-a-number",
      }),
    ).toThrow();
  });

  it("reports env presence without exposing values", () => {
    const presence = envPresence({
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/alphatrend",
      FMP_API_KEY: "secret",
    });

    expect(presence).toContainEqual({
      name: "DATABASE_URL",
      present: true,
    });
    expect(JSON.stringify(presence)).not.toContain("secret");
    expect(JSON.stringify(presence)).not.toContain("postgresql://");
  });
});
