import { randomUUID } from "node:crypto";

export type ApiMeta = {
  requestId: string;
  generatedAt: string;
  asOf?: string;
};

export type ApiSuccessEnvelope<T> = {
  ok: true;
  data: T;
  meta: ApiMeta;
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
    },
  };
}
