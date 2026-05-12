export type PageCursor = {
  id: string;
  sort: string;
};

export type PaginationMeta = {
  hasMore: boolean;
  limit: number;
  nextCursor: string | null;
};

function isPageCursor(value: unknown): value is PageCursor {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "sort" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.sort === "string" &&
    value.sort.length > 0
  );
}

export function encodePageCursor(cursor: PageCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePageCursor(value?: string | null): PageCursor | null {
  if (!value) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;

    return isPageCursor(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function hasInvalidPageCursor(value?: string | null) {
  return Boolean(value && !decodePageCursor(value));
}

export function pageRows<T>(
  rows: T[],
  limit: number,
  cursorFor: (row: T) => PageCursor,
): { pagination: PaginationMeta; rows: T[] } {
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page.at(-1);

  return {
    pagination: {
      hasMore,
      limit,
      nextCursor: hasMore && last ? encodePageCursor(cursorFor(last)) : null,
    },
    rows: page,
  };
}
