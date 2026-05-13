import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("health route", () => {
  it("returns a minimal public status response without env inventory", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.service).toBe("alphatrend-v3");
    expect(body.data.environment).toBeDefined();
    expect(body.data.database).toBeDefined();
    expect(body.data.time).toBeDefined();
    expect(body.data.baseUrl).toBeUndefined();
    expect(body.data.databaseDetail).toBeUndefined();
    expect(body.data.env).toBeUndefined();
    expect(body.meta.requestId).toMatch(/^req_/);
    expect(body.meta.generatedAt).toBeDefined();
  });
});
