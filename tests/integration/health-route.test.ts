import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("health route", () => {
  it("returns status, environment, and presence-only env details", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.service).toBe("alphatrend-v3");
    expect(body.data.environment).toBeDefined();
    expect(body.data.env).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "DATABASE_URL",
          present: expect.any(Boolean),
        }),
      ]),
    );
    expect(body.meta.requestId).toMatch(/^req_/);
    expect(body.meta.generatedAt).toBeDefined();
  });
});
