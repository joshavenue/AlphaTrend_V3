import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isRetryableProviderResponse,
  providerFetch,
  unconfiguredProviderResult,
} from "@/lib/providers/http";

describe("provider HTTP helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries idempotent GET calls for transient statuses only", () => {
    expect(isRetryableProviderResponse("GET", 429)).toBe(true);
    expect(isRetryableProviderResponse("GET", 500)).toBe(true);
    expect(isRetryableProviderResponse("GET", 402)).toBe(false);
    expect(isRetryableProviderResponse("GET", 403)).toBe(false);
    expect(isRetryableProviderResponse("POST", 500)).toBe(false);
  });

  it("records missing provider configuration as unconfigured, not failed", async () => {
    const prisma = {
      apiObservability: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await unconfiguredProviderResult({
      endpoint: "key_metrics",
      envKey: "FMP_API_KEY",
      prisma: prisma as never,
      provider: "FMP",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("UNCONFIGURED");
    expect(result.sanitizedError).toBe("UNCONFIGURED missing FMP_API_KEY");
    expect(prisma.apiObservability.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: "key_metrics",
          provider: "FMP",
          sanitizedError: "UNCONFIGURED missing FMP_API_KEY",
        }),
      }),
    );
  });

  it("preserves status diagnostics for malformed JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{bad-json", {
          headers: { "content-type": "application/json" },
          status: 200,
          statusText: "OK",
        }),
      ),
    );

    const prisma = {
      apiObservability: {
        create: vi.fn().mockResolvedValue({}),
      },
      providerPayload: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const result = await providerFetch({
      endpoint: "malformed_json",
      parse: (payload) => payload,
      prisma: prisma as never,
      provider: "SEC",
      retryCount: 0,
      url: "https://data.sec.gov/example.json",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.httpStatus).toBe(200);
    expect(result.responseHash).toEqual(expect.any(String));
    expect(result.sanitizedError).toContain("Response parse failed");
    expect(prisma.apiObservability.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseHash: expect.any(String),
          sanitizedError: expect.stringContaining("Response parse failed"),
          statusCode: 200,
        }),
      }),
    );
  });

  it("classifies plan-gated 402 responses without retrying parse failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Premium Query Parameter", {
        headers: { "content-type": "application/json" },
        status: 402,
        statusText: "Payment Required",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const prisma = {
      apiObservability: {
        create: vi.fn().mockResolvedValue({}),
      },
      providerPayload: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const result = await providerFetch({
      endpoint: "key_metrics",
      parse: (payload) => payload,
      prisma: prisma as never,
      provider: "FMP",
      retryCount: 2,
      url: "https://financialmodelingprep.com/stable/key-metrics?symbol=AAPL&apikey=raw-secret",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("LICENSE_BLOCKED");
    expect(result.httpStatus).toBe(402);
    expect(result.sanitizedError).toContain("Response parse failed");
  });

  it("preserves payload and status diagnostics when provider parsers throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { ok: true },
          {
            status: 200,
            statusText: "OK",
          },
        ),
      ),
    );

    const prisma = {
      apiObservability: {
        create: vi.fn().mockResolvedValue({}),
      },
      providerPayload: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...data,
            payloadId: "payload-1",
          }),
        ),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const result = await providerFetch({
      endpoint: "parser_error",
      parse: () => {
        throw new Error("parser failed FMP_API_KEY=raw-secret");
      },
      prisma: prisma as never,
      provider: "FMP",
      retryCount: 0,
      url: "https://financialmodelingprep.com/api/v3/example?apikey=raw-secret",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.httpStatus).toBe(200);
    expect(result.payloadId).toBe("payload-1");
    expect(result.sanitizedError).toBe("parser failed FMP_API_KEY=[REDACTED]");
    expect(prisma.apiObservability.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payloadId: "payload-1",
          responseHash: expect.any(String),
          sanitizedError: "parser failed FMP_API_KEY=[REDACTED]",
          statusCode: 200,
        }),
      }),
    );
  });
});
