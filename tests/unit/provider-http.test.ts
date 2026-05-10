import { describe, expect, it, vi } from "vitest";

import {
  isRetryableProviderResponse,
  unconfiguredProviderResult,
} from "@/lib/providers/http";

describe("provider HTTP helpers", () => {
  it("retries idempotent GET calls for transient statuses only", () => {
    expect(isRetryableProviderResponse("GET", 429)).toBe(true);
    expect(isRetryableProviderResponse("GET", 500)).toBe(true);
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
});
