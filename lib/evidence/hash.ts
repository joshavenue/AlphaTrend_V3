import { createHash } from "node:crypto";

import { redactRecord, redactText } from "@/lib/config/redact";

type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike };

function normalizeForJson(value: unknown): JsonLike {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, childValue]) => [key, normalizeForJson(childValue)]),
    );
  }

  return String(value);
}

export function stableStringify(value: unknown) {
  return JSON.stringify(normalizeForJson(value));
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPayload(payload: unknown) {
  return sha256Hex(stableStringify(payload));
}

export function hashRequestMetadata(requestMetadata: unknown) {
  const redactedRequest =
    typeof requestMetadata === "string"
      ? redactText(requestMetadata)
      : redactRecord(requestMetadata);

  return sha256Hex(stableStringify(redactedRequest));
}
