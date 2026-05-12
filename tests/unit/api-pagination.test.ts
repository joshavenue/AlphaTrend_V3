import { describe, expect, it } from "vitest";

import {
  decodePageCursor,
  encodePageCursor,
  hasInvalidPageCursor,
  pageRows,
} from "@/lib/api/pagination";

describe("API cursor pagination helpers", () => {
  it("round-trips opaque base64url cursors", () => {
    const cursor = {
      id: "f5bf4ef0-0c8a-4a2c-b44f-60c664dc5984",
      sort: "2026-05-12T10:00:00.000Z",
    };

    const encoded = encodePageCursor(cursor);

    expect(encoded).not.toContain(cursor.id);
    expect(decodePageCursor(encoded)).toEqual(cursor);
    expect(hasInvalidPageCursor(encoded)).toBe(false);
  });

  it("rejects malformed cursors", () => {
    expect(decodePageCursor("not-json")).toBe(null);
    expect(hasInvalidPageCursor("not-json")).toBe(true);
    expect(hasInvalidPageCursor(null)).toBe(false);
  });

  it("returns the next cursor from the last visible row", () => {
    const page = pageRows(
      [
        { id: "a", sort: "2026-05-12T10:00:00.000Z" },
        { id: "b", sort: "2026-05-12T09:00:00.000Z" },
        { id: "c", sort: "2026-05-12T08:00:00.000Z" },
      ],
      2,
      (row) => row,
    );

    expect(page.rows).toHaveLength(2);
    expect(page.pagination.hasMore).toBe(true);
    expect(decodePageCursor(page.pagination.nextCursor)).toEqual({
      id: "b",
      sort: "2026-05-12T09:00:00.000Z",
    });
  });
});
