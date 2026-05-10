import { describe, expect, it } from "vitest";

import {
  freshnessScoreForDate,
  hashPayload,
  hashRequestMetadata,
  insertEvidence,
  reliabilityScoreForGrade,
} from "@/lib/evidence";

describe("evidence foundation helpers", () => {
  it("hashes semantically equal payloads the same way", () => {
    expect(hashPayload({ b: 2, a: 1 })).toBe(hashPayload({ a: 1, b: 2 }));
  });

  it("excludes API key values from request hashes", () => {
    const first = hashRequestMetadata(
      "https://example.com/v1/data?symbol=NVDA&apikey=first-secret",
    );
    const second = hashRequestMetadata(
      "https://example.com/v1/data?apikey=second-secret&symbol=NVDA",
    );

    expect(first).toBe(second);
  });

  it("maps freshness dates to the Phase 1 helper scale", () => {
    const now = new Date("2026-05-10T00:00:00.000Z");

    expect(
      freshnessScoreForDate(new Date("2026-05-09T00:00:00.000Z"), now),
    ).toBe(100);
    expect(
      freshnessScoreForDate(new Date("2026-04-20T00:00:00.000Z"), now),
    ).toBe(85);
    expect(
      freshnessScoreForDate(new Date("2026-02-20T00:00:00.000Z"), now),
    ).toBe(60);
    expect(
      freshnessScoreForDate(new Date("2025-01-01T00:00:00.000Z"), now),
    ).toBe(10);
  });

  it("maps evidence reliability grades to numeric scores", () => {
    expect(reliabilityScoreForGrade("A")).toBe(100);
    expect(reliabilityScoreForGrade("D")).toBe(30);
  });

  it("rejects evidence rows without payload provenance", async () => {
    await expect(
      insertEvidence({} as never, {
        metricName: "revenue",
        provider: "SEC",
      }),
    ).rejects.toThrow("Evidence requires payloadId or sourcePayloadHash.");
  });

  it("requires a reason code when evidence affects a score", async () => {
    await expect(
      insertEvidence({} as never, {
        metricName: "revenue",
        provider: "SEC",
        scoreImpact: 1,
        sourcePayloadHash: hashPayload({ ok: true }),
      }),
    ).rejects.toThrow("Evidence with scoreImpact requires a reasonCode.");
  });
});
