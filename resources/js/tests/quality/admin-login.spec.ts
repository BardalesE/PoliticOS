import { test, expect } from "@playwright/test";

/**
 * Auditoría de calidad (Fase 13, skill playwright-expert): spec corto y
 * determinista para CI — NO reemplaza politicos-qa-agent.spec.ts (recorrido
 * manual completo, headless:false, 15min). Cubre solo el flujo crítico:
 * login del panel admin con las credenciales por defecto documentadas en
 * CLAUDE.md ("Credenciales de admin por defecto").
 */
test.describe("Admin — login", () => {
  test("login con credenciales válidas entra al dashboard", async ({ page }) => {
    await page.goto("/admin/login");

    await page.locator("#admin-login-email").fill("admin@politicos.pe");
    await page.locator("#admin-login-password").fill("Admin2024!");
    await page.getByRole("button", { name: "Ingresar al panel" }).click();

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15_000 });
  });

  test("login con contraseña incorrecta muestra error y no entra", async ({ page }) => {
    await page.goto("/admin/login");

    await page.locator("#admin-login-email").fill("admin@politicos.pe");
    await page.locator("#admin-login-password").fill("clave-incorrecta-123");
    await page.getByRole("button", { name: "Ingresar al panel" }).click();

    await expect(page).toHaveURL(/\/admin\/login/);
    // No aserta el texto exacto del mensaje (depende de cómo el backend
    // forme la respuesta de ValidationException) — solo que se muestra
    // ALGÚN error visible y que el login no deja pasar.
    await expect(page.locator(".bg-red-50")).toBeVisible({ timeout: 10_000 });
  });
});
