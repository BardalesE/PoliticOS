import { test, expect } from "@playwright/test";

/**
 * Auditoría de calidad (Fase 13, skill playwright-expert): spec corto y
 * determinista para CI. Cubre el flujo crítico del chat rediseñado en la
 * Fase 8: aceptar el consentimiento y enviar un mensaje real, confirmando
 * que la burbuja del usuario aparece y que el asistente responde (sin
 * revisar el contenido exacto de la respuesta, que depende del LLM).
 */
test.describe("Chat — consentimiento y mensaje", () => {
  test("aceptar consentimiento y enviar un mensaje muestra la burbuja y una respuesta", async ({ page }) => {
    await page.goto("/chat");

    // Modal de consentimiento (ConsentModal) — Fase 8 lo re-vistió a chat-500.
    const acceptBtn = page.getByRole("button", { name: "Aceptar y conversar" });
    await expect(acceptBtn).toBeVisible({ timeout: 15_000 });
    await acceptBtn.click();

    const input = page.getByLabel("Escribe tu mensaje");
    await expect(input).toBeVisible({ timeout: 15_000 });

    // El flujo de registro conversacional puede interceptar el primer texto
    // libre (rifa/nombre/DNI) — este spec solo confirma que ALGO se envía y
    // ALGO responde, no valida el contenido conversacional en sí (cubierto
    // por politicos-qa-agent.spec.ts).
    await input.fill("hola");
    await page.getByLabel("Enviar mensaje").click();

    await expect(page.getByText("hola", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Debe aparecer al menos una burbuja de respuesta del asistente
    // (avatar circular con la inicial del candidato, agregado en Fase 8).
    await expect(page.locator(".bg-brand-500").first()).toBeVisible({ timeout: 20_000 });
  });
});
