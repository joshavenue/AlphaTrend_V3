import { describe, expect, it } from "vitest";

import { successEnvelope } from "@/lib/api/envelope";

describe("API envelope helpers", () => {
  it("carries pagination metadata for list responses", () => {
    const envelope = successEnvelope([], {
      generatedAt: "2026-05-12T00:00:00.000Z",
      pagination: {
        hasMore: true,
        limit: 2,
        nextCursor: "theme-2",
      },
    });

    expect(envelope.meta.pagination).toEqual({
      hasMore: true,
      limit: 2,
      nextCursor: "theme-2",
    });
  });
});
