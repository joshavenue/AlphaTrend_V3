import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  hashAdminPassword,
  validateAdminPassword,
  verifyAdminPassword,
} from "@/lib/auth/password";
import { isAllowedMutationOrigin } from "@/lib/auth/origin";
import { getReasonMeta } from "@/lib/ui/reasons";

function readSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return readSourceFiles(path);
    }

    return path.endsWith(".tsx") || path.endsWith(".ts") ? [path] : [];
  });
}

describe("Phase 12 auth and UI contract", () => {
  it("hashes admin passwords and verifies without storing plaintext", async () => {
    const password = "correct horse battery staple";
    const hash = await hashAdminPassword(password);

    expect(hash).not.toBe(password);
    await expect(verifyAdminPassword(hash, password)).resolves.toBe(true);
    await expect(verifyAdminPassword(hash, "wrong password")).resolves.toBe(
      false,
    );
  });

  it("enforces the MVP admin password policy", () => {
    expect(validateAdminPassword("short", "admin@example.com")).toContain("14");
    expect(
      validateAdminPassword("admin@example.com", "admin@example.com"),
    ).toContain("must not equal");
    expect(validateAdminPassword("admin", "admin@example.com")).toContain("14");
    expect(
      validateAdminPassword("long-enough-secret", "admin@example.com"),
    ).toBe(null);
  });

  it("falls back safely for unknown reason codes", () => {
    expect(getReasonMeta("UNKNOWN_CODE")).toMatchObject({
      displayLabel: "Unrecognized reason",
      severity: "INFO",
    });
  });

  it("registers emitted reason codes used by the Phase 12 UI", () => {
    for (const code of [
      "FUNDAMENTAL_SEGMENT_REVENUE_SUPPORT",
      "PRICE_NON_PARTICIPANT",
      "PRICE_BROKEN",
      "VALUATION_INSUFFICIENT_DATA",
      "LIQUIDITY_EXPANDED_ELIGIBLE",
      "FRAGILITY_CONVERTIBLE_DEBT",
      "DISPERSION_SINGLE_NAME_RISK",
    ]) {
      expect(getReasonMeta(code).displayLabel).not.toBe("Unrecognized reason");
    }
  });

  it("uses Origin or Referer for same-origin mutation checks", () => {
    const base = {
      appBaseUrl: "https://alpha.solidmetrics.co",
      appEnv: "vercel-production",
      requestOrigin: "https://alpha.solidmetrics.co",
    };

    expect(
      isAllowedMutationOrigin({
        ...base,
        origin: "https://alpha.solidmetrics.co",
      }),
    ).toBe(true);
    expect(
      isAllowedMutationOrigin({
        ...base,
        referer: "https://alpha.solidmetrics.co/admin/jobs",
      }),
    ).toBe(true);
    expect(
      isAllowedMutationOrigin({
        ...base,
        origin: "https://example.com",
      }),
    ).toBe(false);
    expect(isAllowedMutationOrigin(base)).toBe(false);
    expect(
      isAllowedMutationOrigin({
        ...base,
        appEnv: "hetzner-dev",
        requestOrigin: "http://100.79.23.21:420",
      }),
    ).toBe(true);
  });

  it("keeps forbidden trading command wording out of app UI source", () => {
    const source = readSourceFiles(join(process.cwd(), "app"))
      .concat(readSourceFiles(join(process.cwd(), "components")))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/\bStrong Buy\b|\bBuy now\b|\bSell now\b/);
  });

  it("collapses T5 and T7 as reserved zero-contribution layers", () => {
    const source = readFileSync(
      join(process.cwd(), "components/ticker-report.tsx"),
      "utf8",
    );

    expect(source).toContain("T5 Ownership Flow and T7 Base Rate");
    expect(source).toContain("contribute 0 points today");
  });
});
