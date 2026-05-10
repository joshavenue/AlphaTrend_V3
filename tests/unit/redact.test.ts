import { describe, expect, it } from "vitest";

import {
  redactRecord,
  redactText,
  redactUrlSecrets,
} from "@/lib/config/redact";
import { hashRequestMetadata } from "@/lib/evidence/hash";

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

  it("redacts and canonicalizes secret URL query params", () => {
    const output = redactUrlSecrets(
      "https://example.com/provider?symbol=NVDA&apiKey=secret&token=other",
    );

    expect(output).toBe(
      "https://example.com/provider?apiKey=%5BREDACTED%5D&symbol=NVDA&token=%5BREDACTED%5D",
    );
    expect(output).not.toContain("secret");
    expect(output).not.toContain("other");
  });

  it("redacts provider-specific credential fields without over-redacting user ids", () => {
    const output = redactRecord({
      body: {
        normal: "safe",
        registrationkey: "bls-secret",
      },
      headers: {
        Accept: "application/json",
        "X-OPENFIGI-APIKEY": "openfigi-secret",
      },
      userId: "admin-user-1",
    });

    expect(output).toEqual({
      body: {
        normal: "safe",
        registrationkey: "[REDACTED]",
      },
      headers: {
        Accept: "application/json",
        "X-OPENFIGI-APIKEY": "[REDACTED]",
      },
      userId: "admin-user-1",
    });
  });

  it("redacts provider query credentials including BEA UserID", () => {
    const output = redactText(
      "https://apps.bea.gov/api/data?method=GETDATASETLIST&UserID=bea-secret",
    );

    expect(output).toBe(
      "https://apps.bea.gov/api/data?method=GETDATASETLIST&UserID=%5BREDACTED%5D",
    );
    expect(output).not.toContain("bea-secret");
  });

  it("keeps request hashes stable when only provider credential values change", () => {
    const first = hashRequestMetadata({
      body: { registrationkey: "first-bls-secret", seriesid: ["CUUR0000SA0"] },
      headers: { "X-OPENFIGI-APIKEY": "first-openfigi-secret" },
      method: "POST",
      url: "https://apps.bea.gov/api/data?UserID=first-bea-secret&method=GETDATASETLIST",
    });
    const second = hashRequestMetadata({
      body: { registrationkey: "second-bls-secret", seriesid: ["CUUR0000SA0"] },
      headers: { "X-OPENFIGI-APIKEY": "second-openfigi-secret" },
      method: "POST",
      url: "https://apps.bea.gov/api/data?UserID=second-bea-secret&method=GETDATASETLIST",
    });

    expect(first).toBe(second);
  });
});
