import "dotenv/config";

import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 420);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const useBuiltApp = process.env.PLAYWRIGHT_USE_BUILD === "1";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  testDir: "./tests/ui",
  timeout: 60_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: useBuiltApp ? "npm run start" : "npm run dev",
    env: {
      APP_BASE_URL: baseURL,
      APP_ENV: process.env.APP_ENV ?? "playwright-test",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "phase15-playwright-secret",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      FMP_API_KEY: process.env.FMP_API_KEY ?? "phase15-secret-not-displayed",
      PORT: String(port),
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
  workers: 1,
});
