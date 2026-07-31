import { test, expect } from "@playwright/test";
import { SUPER_ADMIN_KEY } from "../qa-env";

/**
 * Auditoría de calidad (Fase 13, skill playwright-expert): spec corto y
 * determinista para CI. Cubre el login de SuperAdmin (Fase 7 del rediseño)
 * con la key real leída de .env (nunca hardcodeada — ver qa-env.ts).
 */
test.describe("SuperAdmin — login", () => {
  test.skip(!SUPER_ADMIN_KEY, "SUPER_ADMIN_KEY no configurada en .env — se omite este spec.");

  test("login con la key correcta entra al dashboard de tenants", async ({ page }) => {
    await page.goto("/superadmin/login");

    await page.locator("#superadmin-key").fill(SUPER_ADMIN_KEY);
    await page.getByRole("button", { name: "Acceder" }).click();

    await expect(page).toHaveURL(/\/superadmin\/?$/, { timeout: 15_000 });
    await expect(page.getByText("PLATFORM OWNER")).toBeVisible();
  });

  test("login con key incorrecta muestra error y no entra", async ({ page }) => {
    await page.goto("/superadmin/login");

    await page.locator("#superadmin-key").fill("sk-sa-clave-invalida-000");
    await page.getByRole("button", { name: "Acceder" }).click();

    await expect(page).toHaveURL(/\/superadmin\/login/);
    await expect(page.getByText(/clave incorrecta|acceso denegado/i)).toBeVisible({ timeout: 10_000 });
  });
});
