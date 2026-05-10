import type { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/config/env";
import { redactRecord, redactText } from "@/lib/config/redact";
import { hashPayload, hashRequestMetadata } from "@/lib/evidence/hash";
import { recordApiObservability } from "@/lib/evidence/observability";
import { storeProviderPayload } from "@/lib/evidence/payloads";
import type {
  ProviderHttpMethod,
  ProviderRequestMetadata,
  ProviderResult,
} from "@/lib/providers/types";

type ProviderDbClient = Pick<
  PrismaClient,
  "apiObservability" | "providerPayload"
>;

type ProviderFetchInput<T> = {
  prisma: ProviderDbClient;
  provider: ProviderResult<T>["provider"];
  endpoint: string;
  method?: ProviderHttpMethod;
  url: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
  timeoutMs?: number;
  retryCount?: number;
  jobRunId?: string;
  entityType?: string;
  entityId?: string;
  asOfDate?: string;
  parse: (payload: unknown) => T;
  rowCount?: (data: T) => number | undefined;
  validate?: (data: T) => string | undefined;
  usefulFailedPayload?: boolean;
};

type UnconfiguredProviderInput<T> = {
  prisma?: Pick<PrismaClient, "apiObservability">;
  provider: ProviderResult<T>["provider"];
  endpoint: string;
  envKey: string;
  jobRunId?: string;
};

function compactHeaders(headers?: Record<string, string | undefined>) {
  if (!headers) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function serializeBody(body: unknown) {
  if (body === undefined) {
    return undefined;
  }

  return typeof body === "string" ? body : JSON.stringify(body);
}

function buildRequestMetadata(input: {
  method: ProviderHttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}): ProviderRequestMetadata {
  return {
    body: input.body,
    headers: input.headers,
    method: input.method,
    url: input.url,
  };
}

function sanitizeRequestMetadata(
  requestMetadata: ProviderRequestMetadata,
): ProviderRequestMetadata {
  return redactRecord(requestMetadata);
}

function classifyStatus(httpStatus?: number) {
  if (httpStatus === 401 || httpStatus === 403) {
    return "LICENSE_BLOCKED" as const;
  }

  return "FAILED" as const;
}

export function isRetryableProviderResponse(
  method: ProviderHttpMethod,
  httpStatus?: number,
) {
  if (method !== "GET" || httpStatus === undefined) {
    return false;
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return false;
  }

  return httpStatus === 408 || httpStatus === 429 || httpStatus >= 500;
}

function parseResponsePayload(contentType: string | null, rawBody: string) {
  if (!rawBody) {
    return null;
  }

  if (contentType?.toLowerCase().includes("json")) {
    return JSON.parse(rawBody);
  }

  return rawBody;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function unconfiguredProviderResult<T>(
  input: UnconfiguredProviderInput<T>,
): Promise<ProviderResult<T>> {
  const fetchedAt = new Date();
  const requestMetadata = buildRequestMetadata({
    method: "GET",
    url: `provider://${input.provider}/${input.endpoint}`,
  });
  const sanitizedError = `UNCONFIGURED missing ${input.envKey}`;
  const requestHash = hashRequestMetadata(requestMetadata);

  if (input.prisma) {
    await recordApiObservability(input.prisma, {
      endpoint: input.endpoint,
      errorMessage: sanitizedError,
      jobRunId: input.jobRunId,
      provider: input.provider,
      requestHash,
    });
  }

  return {
    durationMs: 0,
    endpoint: input.endpoint,
    fetchedAt: fetchedAt.toISOString(),
    ok: false,
    provider: input.provider,
    requestHash,
    sanitizedError,
    sanitizedRequestMetadata: sanitizeRequestMetadata(requestMetadata),
    status: "UNCONFIGURED",
  };
}

export async function providerFetch<T>(
  input: ProviderFetchInput<T>,
): Promise<ProviderResult<T>> {
  const env = getEnv();
  const method = input.method ?? "GET";
  const headers = compactHeaders(input.headers);
  const body = input.body;
  const requestMetadata = buildRequestMetadata({
    body,
    headers,
    method,
    url: input.url,
  });
  const sanitizedRequestMetadata = sanitizeRequestMetadata(requestMetadata);
  const requestHash = hashRequestMetadata(requestMetadata);
  const timeoutMs = input.timeoutMs ?? env.PROVIDER_TIMEOUT_MS;
  const retryCount = input.retryCount ?? env.PROVIDER_MAX_RETRIES;
  const maxAttempts = method === "GET" ? retryCount + 1 : 1;
  const startedAt = Date.now();
  const fetchedAt = new Date();

  let latestError: string | undefined;
  let latestStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input.url, {
        body: serializeBody(body),
        headers,
        method,
        signal: controller.signal,
      });
      const rawBody = await response.text();
      const contentType = response.headers.get("content-type");
      const parsedPayload = parseResponsePayload(contentType, rawBody);
      const responseHash = hashPayload(parsedPayload);
      const durationMs = Date.now() - startedAt;
      latestStatus = response.status;

      if (!response.ok) {
        latestError = `HTTP ${response.status} ${response.statusText}`;

        if (
          attempt < maxAttempts &&
          isRetryableProviderResponse(method, response.status)
        ) {
          await sleep(Math.min(2 ** attempt * 250, 2_000));
          continue;
        }

        const shouldStorePayload =
          input.usefulFailedPayload !== false && parsedPayload !== null;
        const failedPayload = shouldStorePayload
          ? await storeProviderPayload(input.prisma!, {
              contentType: contentType ?? undefined,
              endpoint: input.endpoint,
              entityId: input.entityId,
              entityType: input.entityType,
              fetchedAt,
              httpStatus: response.status,
              payload: parsedPayload,
              provider: input.provider,
              requestMetadata,
            })
          : undefined;

        await recordApiObservability(input.prisma!, {
          durationMs,
          endpoint: input.endpoint,
          errorMessage: latestError,
          jobRunId: input.jobRunId,
          payloadId: failedPayload?.payloadId,
          provider: input.provider,
          requestHash,
          responseHash,
          rowCount: 0,
          statusCode: response.status,
        });

        return {
          durationMs,
          endpoint: input.endpoint,
          fetchedAt: fetchedAt.toISOString(),
          httpStatus: response.status,
          ok: false,
          payloadId: failedPayload?.payloadId,
          provider: input.provider,
          requestHash,
          responseHash,
          sanitizedError: redactText(latestError),
          sanitizedRequestMetadata,
          status: classifyStatus(response.status),
        };
      }

      const data = input.parse(parsedPayload);
      const rowCount = input.rowCount?.(data);
      const payload = await storeProviderPayload(input.prisma!, {
        contentType: contentType ?? undefined,
        endpoint: input.endpoint,
        entityId: input.entityId,
        entityType: input.entityType,
        fetchedAt,
        httpStatus: response.status,
        payload: parsedPayload,
        provider: input.provider,
        requestMetadata,
      });
      const validationError = input.validate?.(data);

      if (validationError) {
        await recordApiObservability(input.prisma!, {
          durationMs,
          endpoint: input.endpoint,
          errorMessage: validationError,
          jobRunId: input.jobRunId,
          payloadId: payload.payloadId,
          provider: input.provider,
          requestHash: payload.requestHash,
          responseHash: payload.responseHash,
          rowCount,
          statusCode: response.status,
        });

        return {
          asOfDate: input.asOfDate,
          data,
          durationMs,
          endpoint: input.endpoint,
          fetchedAt: fetchedAt.toISOString(),
          httpStatus: response.status,
          ok: false,
          payloadId: payload.payloadId,
          provider: input.provider,
          requestHash: payload.requestHash,
          responseHash: payload.responseHash,
          rowCount,
          sanitizedError: redactText(validationError),
          sanitizedRequestMetadata,
          status: "FAILED",
        };
      }

      await recordApiObservability(input.prisma!, {
        durationMs,
        endpoint: input.endpoint,
        jobRunId: input.jobRunId,
        payloadId: payload.payloadId,
        provider: input.provider,
        requestHash: payload.requestHash,
        responseHash: payload.responseHash,
        rowCount,
        statusCode: response.status,
      });

      return {
        asOfDate: input.asOfDate,
        data,
        durationMs,
        endpoint: input.endpoint,
        fetchedAt: fetchedAt.toISOString(),
        httpStatus: response.status,
        ok: true,
        payloadId: payload.payloadId,
        provider: input.provider,
        requestHash: payload.requestHash,
        responseHash: payload.responseHash,
        rowCount,
        sanitizedRequestMetadata,
        status: "SUCCESS",
      };
    } catch (error) {
      latestError =
        error instanceof Error ? error.message : JSON.stringify(error);

      if (attempt < maxAttempts) {
        await sleep(Math.min(2 ** attempt * 250, 2_000));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const durationMs = Date.now() - startedAt;
  await recordApiObservability(input.prisma!, {
    durationMs,
    endpoint: input.endpoint,
    errorMessage: latestError,
    jobRunId: input.jobRunId,
    provider: input.provider,
    requestHash,
    statusCode: latestStatus,
  });

  return {
    durationMs,
    endpoint: input.endpoint,
    fetchedAt: fetchedAt.toISOString(),
    httpStatus: latestStatus,
    ok: false,
    provider: input.provider,
    requestHash,
    sanitizedError: latestError ? redactText(latestError) : "Unknown error",
    sanitizedRequestMetadata,
    status: classifyStatus(latestStatus),
  };
}
