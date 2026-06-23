import { defineConfig, devices } from "@playwright/test";
import { FRONTEND_URL } from "./tests/qa-env";

/**
 * Configuración del QA Agent de PoliticOS.
 * - headless: false  → para observar la ejecución (requisito del auditor)
 * - slowMo: 300ms    → simula un usuario real
 * - workers: 1       → el spec es serial y comparte estado en memoria
 * - webServer        → levanta `npm run dev` si :3000 no está arriba (reusa si ya corre)
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: ["politicos-qa-agent.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // FASE 3 recorre ~24 módulos en un solo test → timeout generoso
  timeout: 15 * 60 * 1000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "tests/reports/playwright-html" }],
  ],
  outputDir: "tests/reports/test-artifacts",
  use: {
    baseURL: FRONTEND_URL,
    headless: false,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    screenshot: "only-on-failure",
    video: "on",
    trace: "on",
    launchOptions: { slowMo: 300 },
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
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
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
