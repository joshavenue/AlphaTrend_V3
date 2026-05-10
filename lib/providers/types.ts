import type { ApiCallStatus, ProviderName } from "@/lib/domain/types";

export type ProviderHttpMethod = "GET" | "POST";

export type ProviderRequestMetadata = {
  method: ProviderHttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export type ProviderResult<T> = {
  provider: ProviderName;
  endpoint: string;
  ok: boolean;
  status: ApiCallStatus;
  httpStatus?: number;
  durationMs: number;
  rowCount?: number;
  asOfDate?: string;
  fetchedAt: string;
  requestHash: string;
  responseHash?: string;
  payloadId?: string;
  data?: T;
  sanitizedRequestMetadata: ProviderRequestMetadata;
  sanitizedError?: string;
};

export type ProviderParser<T> = (payload: unknown) => T;

export type ProviderTextParser<T> = (payload: string) => T;

export type ProviderHealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "FAILING"
  | "STALE"
  | "UNCONFIGURED"
  | "LICENSE_BLOCKED";
