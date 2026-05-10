import { describe, expect, it } from "vitest";

import { redactRecord, redactText } from "@/lib/config/redact";

describe("secret redaction", () => {
  it("redacts known env key assignments", () => {
    const output = redactText(
      "DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/alphatrend FMP_API_KEY=abc123",
    );

    expect(output).toContain("DATABASE_URL=[REDACTED]");
    expect(output).toContain("FMP_API_KEY=[REDACTED]");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("user:pass");
  });

  it("redacts secret object fields recursively", () => {
    const output = redactRecord({
      ok: true,
      nested: {
        AUTH_SECRET: "secret",
        message: "safe",
      },
    });

    expect(output).toEqual({
      ok: true,
      nested: {
        AUTH_SECRET: "[REDACTED]",
        message: "safe",
      },
    });
  });
});
