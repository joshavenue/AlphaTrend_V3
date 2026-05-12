import { randomUUID } from "node:crypto";

export type ApiMeta = {
  requestId: string;
  generatedAt: string;
  asOf?: string;
  pagination?: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export type ApiSuccessEnvelope<T> = {
  ok: true;
  data: T;
  meta: ApiMeta;
};

export type ApiErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: Pick<ApiMeta, "requestId" | "generatedAt">;
};

export function createRequestId() {
  return `req_${randomUUID()}`;
}

export function successEnvelope<T>(
  data: T,
  meta: Partial<ApiMeta> = {},
): ApiSuccessEnvelope<T> {
  const generatedAt = meta.generatedAt ?? new Date().toISOString();

  return {
    ok: true,
    data,
    meta: {
      requestId: meta.requestId ?? createRequestId(),
      generatedAt,
      asOf: meta.asOf ?? generatedAt,
      pagination: meta.pagination,
    },
  };
}

export function errorEnvelope(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  meta: Partial<ApiMeta> = {},
): ApiErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      details,
      message,
    },
    meta: {
      requestId: meta.requestId ?? createRequestId(),
      generatedAt: meta.generatedAt ?? new Date().toISOString(),
    },
  };
}
