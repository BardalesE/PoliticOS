import { defineConfig, devices } from "@playwright/test";
import { FRONTEND_URL } from "./tests/qa-env";

/**
 * Config separada para los specs cortos y deterministas de la auditoría de
 * calidad (Fase 13) — NO toca playwright.config.ts (el QA Agent manual,
 * headless:false, 15min, un solo spec serial). Esta corre headless, rápido,
 * pensada para CI: `npx playwright test --config=playwright.quality.config.ts`.
 */
export default defineConfig({
  testDir: "./tests/quality",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: FRONTEND_URL,
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: FRONTEND_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
