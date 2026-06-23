/**
 * politicos-qa-agent.spec.ts
 * Auditor QA Senior automatizado para PoliticOS.
 *
 * REGLAS (ver prompt original):
 *  - Solo lectura: NO modifica código fuente.
 *  - NO consume tokens del chatbot (FASE 5 omitida deliberadamente).
 *  - Credenciales SOLO desde .env (ver qa-env.ts).
 *  - Screenshot en cada página y cada error.
 *  - slowMo 300ms + headless:false (ver playwright.config.ts).
 *  - Si el provisioning falla → FASE 3 usa un tenant existente (reset-password).
 *
 * Corre serial con workers:1; el estado vive en el singleton QA (qa-collector.ts)
 * y el último test escribe los dos reportes.
 */
import { test, expect, type Page } from "@playwright/test";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  API_URL, FRONTEND_URL, SUPER_ADMIN_KEY, QA_TENANT,
  SRC_APP, SRC_COMPONENTS, JS_ROOT, FIXTURES_DIR,
} from "./qa-env";
import { QA, monitorPage, shot, type Severity } from "./qa-collector";

// ─── Estado compartido entre fases ─────────────────────────────────────────
const state = {
  provisionOk: false,
  loginSlug: QA_TENANT.slug,
  loginEmail: QA_TENANT.adminEmail,
  loginPassword: QA_TENANT.adminPassword,
  adminToken: "" as string,
  createdTenantId: 0 as number,
  otherTenantSlug: "" as string,
  xssFired: false,
};

const SQL_PAYLOAD = "'; DROP TABLE users; --";
const XSS_PAYLOAD = "<script>alert('xss')</script>";
const LONG_STRING = "A".repeat(500);

const ADMIN_MODULES = [
  "/admin", "/admin/onboarding", "/admin/candidate-profile", "/admin/hero-settings",
  "/admin/home-settings", "/admin/knowledge", "/admin/faqs", "/admin/team",
  "/admin/events", "/admin/gallery", "/admin/videos", "/admin/campaign-videos",
  "/admin/livestream", "/admin/districts", "/admin/proposals", "/admin/citizens",
  "/admin/chat-sessions", "/admin/intelligence", "/admin/attack-responses",
  "/admin/suggested-questions", "/admin/topics", "/admin/external-signals",
  "/admin/ai-settings", "/admin/users",
];

// ─── Utilidades de API directa (node fetch) ────────────────────────────────
async function saFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Super-Admin-Key": SUPER_ADMIN_KEY,
      ...(init.headers as Record<string, string>),
    },
  });
}

function withTenant(path: string, slug = state.loginSlug) {
  return path + (path.includes("?") ? "&" : "?") + "tenant=" + encodeURIComponent(slug);
}

/**
 * Cierra un modal de forma robusta. ESTOS MODALES NO RESPONDEN A "Escape":
 * cierran con el botón "×" del header o haciendo click en el backdrop.
 * (Un click por coordenadas no sirve: en /admin el sidebar está a la izquierda.)
 */
async function closeModal(page: Page) {
  try {
    const x = page.getByRole("button", { name: "×" });
    if (await x.count()) await x.first().click({ timeout: 2000 }).catch(() => {});
  } catch { /* noop */ }
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(250);
  const backdrop = page.locator("div.fixed.inset-0 > .absolute.inset-0").first();
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.click({ position: { x: 5, y: 5 }, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
}

/** Espera a que el dashboard SuperAdmin esté visible (no la pantalla de login). */
async function waitSuperAdminReady(page: Page): Promise<boolean> {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .getByRole("button", { name: /nuevo candidato|nuevo/i })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => {});
  return page
    .getByRole("button", { name: /nuevo candidato|nuevo/i })
    .first()
    .isVisible()
    .catch(() => false);
}

// ════════════════════════════════════════════════════════════════════════
test.describe.serial("PoliticOS QA Agent", () => {
  test.beforeAll(() => {
    QA.note(`Frontend=${FRONTEND_URL}  API=${API_URL}  SA_KEY=${SUPER_ADMIN_KEY ? "(cargada)" : "(VACÍA!)"}`);
    if (!SUPER_ADMIN_KEY) {
      QA.addFinding({
        title: "SUPER_ADMIN_KEY no encontrada en .env",
        severity: "Crítica", module: ".env",
        error: "qa-env no pudo leer SUPER_ADMIN_KEY del .env raíz.",
        repro: "Ejecutar el QA agent sin SUPER_ADMIN_KEY definida.",
        actual: "Las fases de SuperAdmin no pueden autenticarse.",
        expected: "SUPER_ADMIN_KEY presente en C:\\laragon\\www\\PoliticOS\\.env",
        fixPrompt: "Verifica que el archivo .env raíz contenga SUPER_ADMIN_KEY=... y que qa-env.ts lo lea correctamente.",
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // FASE 1 — Inventario estático
  // ─────────────────────────────────────────────────────────────────────
  test("FASE 1 — Inventario estático de módulos, rutas y formularios", async () => {
    test.setTimeout(120_000);

    const files: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx|ts)$/.test(name)) files.push(full);
      }
    };
    walk(SRC_APP);
    walk(SRC_COMPONENTS);

    const componentDefs = new Map<string, string[]>(); // nombre -> [archivos]
    let routeCount = 0, formCount = 0, componentCount = 0;

    for (const f of files) {
      const rel = relative(JS_ROOT, f).replace(/\\/g, "/");
      const src = readFileSync(f, "utf8");
      const isRoute = /[\\/]page\.tsx$/.test(f);
      const isLayout = /[\\/]layout\.tsx$/.test(f);
      const hasForm = /<form[\s>]/.test(src) || /onSubmit/.test(src) || /handleSubmit/.test(src);
      const inputs = (src.match(/<input|<textarea|<select|FormField/g) || []).length;

      if (isRoute) routeCount++;
      else if (!isLayout) componentCount++;
      if (hasForm) formCount++;

      // Registrar SOLO declaraciones de componentes vía `function Xxx(` (PascalCase).
      // Excluimos `const X =` (atrapa constantes ALL-CAPS como EMPTY/API/COLORS) y
      // los default-exports de páginas (`*Page`), que no son duplicación real.
      const defs = src.match(/function\s+([A-Z][A-Za-z0-9]+)\s*\(/g) || [];
      for (const d of defs) {
        const nm = d.replace(/function\s+/, "").replace(/\s*\($/, "");
        if (nm === nm.toUpperCase()) continue;     // descarta ALL-CAPS
        if (/Page$/.test(nm)) continue;            // descarta default export de ruta
        if (!componentDefs.has(nm)) componentDefs.set(nm, []);
        const arr = componentDefs.get(nm)!;
        if (!arr.includes(rel)) arr.push(rel);
      }

      const tipo = isRoute ? "Ruta (page)" : isLayout ? "Layout" : "Componente";
      QA.staticTableRows.push(
        `| \`${rel}\` | ${tipo} | ${hasForm ? `Sí (${inputs} campos)` : "No"} | ${
          isRoute ? `ruta /${rel.replace(/^src\/app\//, "").replace(/\/page\.tsx$/, "") || "(home)"}` : "—"
        } |`
      );
    }

    QA.staticSummary.push(
      `- Archivos .ts/.tsx analizados: **${files.length}**`,
      `- Rutas (page.tsx): **${routeCount}**`,
      `- Componentes: **${componentCount}**`,
      `- Archivos con formulario/handleSubmit: **${formCount}**`,
    );

    // Duplicados por nombre definido en >1 archivo
    for (const [nm, arr] of componentDefs) {
      if (arr.length > 1 && nm.length > 2) {
        QA.duplicates.push({
          area: `Componente \`${nm}\``,
          detail: `Definido en ${arr.length} archivos: ${arr.join(", ")}. Posible redundancia o falta de extracción a un módulo compartido.`,
        });
      }
    }

    // Duplicados concretos observados durante la lectura del código
    const saPage = join(SRC_APP, "superadmin", "page.tsx");
    if (existsSync(saPage)) {
      const sp = readFileSync(saPage, "utf8");
      if (/function CredRow/.test(sp) && /function CredentialField/.test(sp)) {
        QA.duplicates.push({
          area: "SuperAdmin — filas de credenciales",
          detail: "`CredRow` y `CredentialField` coexisten en superadmin/page.tsx con lógica de copiar/revelar casi idéntica. Unificar en un solo componente.",
        });
      }
      if (/function TenantRow/.test(sp) && /function TenantCard/.test(sp)) {
        QA.duplicates.push({
          area: "SuperAdmin — listado de tenants",
          detail: "`TenantRow` (desktop) y `TenantCard` (mobile) duplican toda la lógica de carga de stats y URLs. Extraer un hook `useTenantStats`.",
        });
      }
      if (/function Input\(/.test(sp) && existsSync(join(SRC_COMPONENTS, "admin", "FormField.tsx"))) {
        QA.duplicates.push({
          area: "Inputs de formulario",
          detail: "superadmin/page.tsx define `Input`/`Select` locales en vez de reutilizar `components/admin/FormField.tsx`.",
        });
      }
    }
    if (existsSync(join(JS_ROOT, "src", "lib", "mockResponses.ts"))) {
      QA.uxNotes.push("Existe `lib/mockResponses.ts` (respuestas mock) — verificar que no llegue a producción ni se sirva por error.");
    }

    QA.note(`FASE 1 OK — ${files.length} archivos, ${routeCount} rutas, ${formCount} con formulario, ${QA.duplicates.length} posibles duplicados.`);
    expect(files.length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────
  // FASE 2 — SuperAdmin
  // ─────────────────────────────────────────────────────────────────────
  test("FASE 2 — SuperAdmin: login, tabs, validación, provisioning", async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    const mon = monitorPage(page);

    // Pre-limpieza idempotente: si roberto-futuro-peru ya existe, lo borramos
    try {
      const res = await saFetch("/superadmin/tenants");
      if (res.ok) {
        const data = await res.json();
        const list = data.data ?? [];
        const prev = list.find((t: any) => t.slug === QA_TENANT.slug);
        if (prev) {
          await saFetch(`/superadmin/tenants/${prev.id}`, { method: "DELETE" });
          QA.note(`Pre-limpieza: tenant previo ${QA_TENANT.slug} (id ${prev.id}) eliminado.`);
        }
        state.otherTenantSlug = list.find((t: any) => t.slug !== QA_TENANT.slug)?.slug ?? "";
      }
    } catch (e) {
      QA.note(`Pre-check SA API falló: ${(e as Error).message}`);
    }

    // 1. Login SuperAdmin
    await page.goto("/superadmin/login");
    await page.getByPlaceholder(/sk-sa/i).fill(SUPER_ADMIN_KEY);
    await page.getByRole("button", { name: /acceder/i }).click();
    const onDashboard = await waitSuperAdminReady(page);
    await shot(page, "fase2-superadmin-dashboard");

    if (!onDashboard) {
      QA.addFinding({
        title: "Login SuperAdmin no redirige al dashboard",
        severity: "Crítica", module: "/superadmin/login",
        error: `URL tras login: ${page.url()}`,
        repro: "Ingresar SUPER_ADMIN_KEY válida y pulsar Acceder.",
        actual: "No se llega a /superadmin.",
        expected: "Redirección a /superadmin con el listado de tenants.",
        fixPrompt: "Revisa SuperAdminContext.login y la verificación con superadminApi.tenants.list; confirma que la SA key del .env coincide con la del backend (middleware X-Super-Admin-Key).",
      });
    }

    // 2. Tab Candidatos / Planes
    try {
      await page.getByRole("button", { name: /planes/i }).first().click();
      await page.waitForTimeout(800);
      await shot(page, "fase2-tab-planes");
      await page.getByRole("button", { name: /candidatos/i }).first().click();
      await page.waitForTimeout(500);
      await shot(page, "fase2-tab-candidatos");
    } catch (e) {
      QA.addFinding({
        title: "Tabs Candidatos/Planes no operativas",
        severity: "Media", module: "/superadmin",
        error: (e as Error).message,
        repro: "Click en los tabs Candidatos y Planes del dashboard SuperAdmin.",
        actual: "No se pudo alternar entre tabs.",
        expected: "Ambos tabs deben renderizar su contenido.",
        fixPrompt: "Verifica los botones de tab en superadmin/page.tsx (estados activeTab 'tenants'/'plans').",
      });
    }

    // 3. Validación de slug inválido
    try {
      await page.getByRole("button", { name: /nuevo candidato|nuevo/i }).first().click();
      await expect(page.getByRole("heading", { name: /nuevo candidato/i })).toBeVisible({ timeout: 10_000 });
      const slugInput = page.getByPlaceholder("james-cueva");
      await slugInput.fill("QA TEST!@#");
      await page.waitForTimeout(400);
      const sanitized = await slugInput.inputValue();
      await shot(page, "fase2-slug-invalido");
      if (sanitized === "QA TEST!@#") {
        QA.note("Slug inválido aceptado tal cual — el backend debería rechazarlo.");
      } else {
        QA.addFinding({
          title: "Slug inválido se auto-sanitiza en silencio (sin feedback de validación)",
          severity: "Media", module: "/superadmin (modal Nuevo Candidato)",
          error: `Entrada "QA TEST!@#" se transformó silenciosamente a "${sanitized}".`,
          repro: 'Abrir "Nuevo Candidato" y escribir "QA TEST!@#" en el campo Slug.',
          actual: `El input elimina caracteres inválidos sin avisar (queda "${sanitized}"), pudiendo crear un tenant con slug distinto al que el usuario cree.`,
          expected: "Mostrar un mensaje de validación claro indicando que el slug solo admite minúsculas, números y guiones, en vez de transformarlo en silencio.",
          fixPrompt: "En superadmin/page.tsx (handleSlugChange) muestra un hint/error visible cuando la entrada contiene caracteres inválidos, en lugar de removerlos silenciosamente. Añade validación visual (borde rojo + texto) bajo el campo Slug.",
        });
      }
      // cerrar modal
      await closeModal(page);
      await page.waitForTimeout(300);
    } catch (e) {
      QA.note(`Prueba de slug inválido no completada: ${(e as Error).message}`);
      await closeModal(page);
    }

    // 4. Provisionar candidato roberto-futuro-peru
    try {
      await page.getByRole("button", { name: /nuevo candidato|nuevo/i }).first().click();
      await expect(page.getByRole("heading", { name: /nuevo candidato/i })).toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder("james-cueva").fill(QA_TENANT.slug);
      await page.waitForTimeout(300);
      await page.getByPlaceholder("Campaña James Cueva").fill(QA_TENANT.name);
      await page.getByPlaceholder("admin@james.pe").fill(QA_TENANT.adminEmail);
      await page.getByPlaceholder(/Min\. 8/i).fill(QA_TENANT.adminPassword);
      await shot(page, "fase2-provision-form");

      await page.getByRole("button", { name: /provisionar candidato/i }).click();

      const success = page.getByText(/provisionado correctamente/i);
      const errorBox = page.locator("text=/error|falló|no se pudo/i");
      await Promise.race([
        success.waitFor({ state: "visible", timeout: 90_000 }),
        errorBox.first().waitFor({ state: "visible", timeout: 90_000 }),
      ]).catch(() => {});

      if (await success.isVisible().catch(() => false)) {
        state.provisionOk = true;
        await shot(page, "fase2-provision-success");
        QA.note(`Provisioning OK para ${QA_TENANT.slug}.`);
        await page.getByRole("button", { name: /^listo$/i }).click().catch(() => {});
        await page.waitForTimeout(1000);
      } else {
        const txt = await page.locator(".text-red-400, [class*='red']").first().textContent().catch(() => "");
        await shot(page, "fase2-provision-error");
        QA.addFinding({
          title: "Provisioning de candidato falló",
          severity: "Crítica", module: "/superadmin (Provisionar)",
          error: (txt || "Sin mensaje de error visible").trim().slice(0, 300),
          repro: `Provisionar slug=${QA_TENANT.slug}, plan=${QA_TENANT.plan} desde el modal.`,
          actual: "El provisioning no mostró pantalla de éxito.",
          expected: "Crear DB, migrar, sembrar y registrar el tenant en ~15s mostrando credenciales.",
          fixPrompt: "Depura el comando artisan de provisioning (TenantProvisionController / php artisan tenants:provision). Revisa logs de Laravel y permisos de creación de DB MySQL. Verifica que el endpoint /api/superadmin/tenants/provision no devuelva 500.",
        });
        await closeModal(page);
      }
    } catch (e) {
      QA.note(`Provisioning lanzó excepción: ${(e as Error).message}`);
      await closeModal(page);
    }

    // 5. Intento de duplicado
    if (state.provisionOk) {
      try {
        await page.getByRole("button", { name: /nuevo candidato|nuevo/i }).first().click();
        await page.getByPlaceholder("james-cueva").fill(QA_TENANT.slug);
        await page.waitForTimeout(200);
        await page.getByPlaceholder("Campaña James Cueva").fill(QA_TENANT.name);
        await page.getByPlaceholder("admin@james.pe").fill(QA_TENANT.adminEmail);
        await page.getByPlaceholder(/Min\. 8/i).fill(QA_TENANT.adminPassword);
        await page.getByRole("button", { name: /provisionar candidato/i }).click();
        await page.waitForTimeout(4000);
        const dupError = await page.locator("[class*='red']").first().isVisible().catch(() => false);
        const dupSuccess = await page.getByText(/provisionado correctamente/i).isVisible().catch(() => false);
        await shot(page, "fase2-duplicado");
        if (dupSuccess && !dupError) {
          QA.addFinding({
            title: "Se permite provisionar un slug duplicado",
            severity: "Alta", module: "/superadmin (Provisionar)",
            error: `Segundo provisioning de "${QA_TENANT.slug}" no fue rechazado.`,
            repro: "Provisionar dos veces el mismo slug.",
            actual: "El sistema no bloquea slugs duplicados con un error claro.",
            expected: "Rechazar con 'el slug ya existe' (validación unique en tenants.slug).",
            fixPrompt: "Agrega validación unique sobre tenants.slug en el provisioning (backend) y muestra el error en el modal de superadmin/page.tsx.",
          });
        } else {
          QA.note("Duplicado rechazado correctamente (mostró error).");
        }
        await closeModal(page);
        await page.waitForTimeout(300);
      } catch (e) {
        QA.note(`Prueba de duplicado no completada: ${(e as Error).message}`);
        await closeModal(page);
      }
    }

    // 6. Obtener id del tenant + revisar credenciales y stats vía API/UI
    try {
      const res = await saFetch("/superadmin/tenants");
      const data = await res.json();
      const t = (data.data ?? []).find((x: any) => x.slug === QA_TENANT.slug);
      if (t) {
        state.createdTenantId = t.id;
        // Credenciales
        const credRes = await saFetch(`/superadmin/tenants/${t.id}/credentials`);
        if (credRes.ok) {
          const creds = await credRes.json();
          const urls = [creds.admin_url, creds.chatbot_url].filter(Boolean).join(" ");
          if (/localhost:3000/.test(urls)) {
            QA.addFinding({
              title: "URLs de credenciales apuntan a localhost:3000",
              severity: "Media", module: "/superadmin (credenciales)",
              error: `admin_url=${creds.admin_url} chatbot_url=${creds.chatbot_url}`,
              repro: "Abrir el modal de credenciales de un tenant.",
              actual: "Las URLs entregadas al cliente usan localhost:3000 (hardcoded), inservibles en producción.",
              expected: "Construir URLs a partir del dominio configurado (subdominio del tenant, ej. roberto-futuro-peru.politicos.pe).",
              fixPrompt: "Reemplaza las URLs hardcodeadas 'http://localhost:3000' en el backend de credenciales y en superadmin/page.tsx por una base configurable (NEXT_PUBLIC_BASE_DOMAIN / APP_URL). Genera admin_url y chatbot_url según el dominio del tenant.",
            });
          }
        }
      }
    } catch (e) {
      QA.note(`No se pudieron leer credenciales vía API: ${(e as Error).message}`);
    }

    // UI: abrir modal de credenciales y stats de la fila
    if (state.provisionOk) {
      try {
        const row = page.locator("table tbody tr", { hasText: QA_TENANT.slug }).first();
        await row.getByTitle("Ver credenciales").click();
        await expect(page.getByText(/credenciales de acceso/i)).toBeVisible({ timeout: 10_000 });
        await shot(page, "fase2-modal-credenciales");
        await closeModal(page);
        await page.waitForTimeout(400);
        await row.getByTitle("Ver stats").click();
        await page.waitForTimeout(2500);
        await shot(page, "fase2-stats");
      } catch (e) {
        QA.note(`UI credenciales/stats no completada: ${(e as Error).message}`);
      }
    }

    // Errores globales capturados en el dashboard SA
    if (mon.httpErrors.length || mon.jsErrors.length) {
      QA.note(`SuperAdmin: http=${mon.httpErrors.length} js=${mon.jsErrors.length}`);
    }
    mon.detach();

    // Fallback de login si el provisioning falló: reset-password en un tenant existente
    if (!state.provisionOk && state.otherTenantSlug) {
      try {
        const res = await saFetch("/superadmin/tenants");
        const data = await res.json();
        const other = (data.data ?? []).find((x: any) => x.slug === state.otherTenantSlug);
        if (other) {
          const r = await saFetch(`/superadmin/tenants/${other.id}/reset-password`, { method: "POST" });
          if (r.ok) {
            const c = await r.json();
            state.loginSlug = other.slug;
            state.loginEmail = c.admin_email;
            state.loginPassword = c.admin_password;
            QA.note(`Fallback FASE 3: usando tenant existente ${other.slug} (password reseteada).`);
          }
        }
      } catch (e) {
        QA.note(`Fallback de tenant existente falló: ${(e as Error).message}`);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // FASE 3 — Admin del candidato: recorrido de todos los módulos
  // ─────────────────────────────────────────────────────────────────────
  test("FASE 3 — Admin: recorrido de módulos + persistencia + inputs maliciosos", async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);

    // Detectar XSS ejecutado en cualquier momento
    page.on("dialog", async (d) => {
      if (/xss/i.test(d.message())) state.xssFired = true;
      await d.dismiss().catch(() => {});
    });

    // Login admin (con reintentos: el primer login tras provisionar puede fallar por DB fría)
    const mon = monitorPage(page);
    const attemptLogin = async (): Promise<string> => {
      await page.goto(withTenant("/admin/login"), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.getByPlaceholder("admin@politicos.pe").fill(state.loginEmail).catch(() => {});
      await page.getByPlaceholder("••••••••").fill(state.loginPassword).catch(() => {});
      await page.getByRole("button", { name: /ingresar al panel/i }).click().catch(() => {});
      await page
        .waitForURL(
          (u) => {
            try {
              const p = new URL(u).pathname;
              return /^\/admin(\/|$)/.test(p) && p !== "/admin/login";
            } catch {
              return false;
            }
          },
          { timeout: 30_000 }
        )
        .catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
      return (await page.evaluate(() => localStorage.getItem("admin_token")).catch(() => "")) || "";
    };

    state.adminToken = await attemptLogin();
    if (!state.adminToken) {
      QA.note("Login admin: 1er intento sin token, reintentando…");
      await page.waitForTimeout(2500);
      state.adminToken = await attemptLogin();
    }
    await shot(page, "fase3-admin-dashboard");

    const loggedIn = !!state.adminToken && /\/admin/.test(page.url()) && !/login/.test(page.url());

    if (!loggedIn) {
      QA.addFinding({
        title: "No se pudo iniciar sesión como admin del candidato",
        severity: "Crítica", module: "/admin/login",
        error: `URL=${page.url()} token=${state.adminToken ? "sí" : "no"}`,
        repro: `Login en /admin/login?tenant=${state.loginSlug} con las credenciales provisionadas.`,
        actual: "El login no autentica ni guarda admin_token.",
        expected: "Autenticación correcta y redirección a /admin.",
        fixPrompt: "Verifica POST /api/auth/login con header X-Tenant; confirma que el seeder del provisioning crea el usuario admin con la contraseña indicada y rol 'admin'.",
      });
      mon.detach();
      return; // sin sesión, el recorrido no aporta
    }

    // Recorrido de todos los módulos
    for (const mod of ADMIN_MODULES) {
      const jsBefore = mon.jsErrors.length;
      const httpBefore = mon.httpErrors.length;
      const t0 = Date.now();
      let status: "OK" | "WARN" | "FAIL" = "OK";
      try {
        const resp = await page.goto(withTenant(mod), { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
        if (resp && resp.status() >= 400) status = "FAIL";
      } catch (e) {
        status = "FAIL";
        mon.jsErrors.push(`navegación: ${(e as Error).message}`);
      }
      const loadMs = Date.now() - t0;
      const jsErrs = mon.jsErrors.slice(jsBefore);
      const httpErrs = mon.httpErrors.slice(httpBefore);
      const empty = await page
        .getByText(/sin .*(todav|registr|datos)|no hay|aún no|a[úu]n sin|vac[íi]o|0 resultados|nada que mostrar/i)
        .first().isVisible().catch(() => false);

      await shot(page, `fase3${mod.replace(/\//g, "-")}`);

      if (jsErrs.length || httpErrs.length) status = status === "FAIL" ? "FAIL" : "WARN";
      const notes: string[] = [];
      if (loadMs > 3000) notes.push(`carga lenta ${loadMs}ms`);
      if (httpErrs.length) notes.push(`HTTP: ${httpErrs.slice(0, 3).join(" | ")}`);
      if (jsErrs.length) notes.push(`JS: ${jsErrs.slice(0, 2).join(" | ")}`);

      QA.recordModule({ module: mod, status, loadMs, httpErrors: httpErrs, jsErrors: jsErrs, empty, notes: notes.join("; ") });

      // Hallazgos por errores server-side
      const serverErr = httpErrs.find((h) => /\s5\d\d\s|^5\d\d\b| 500 /.test(h) || /\b50\d\b/.test(h));
      if (serverErr) {
        QA.addFinding({
          title: `Error de servidor (5xx) en ${mod}`,
          severity: "Crítica", module: mod,
          error: serverErr,
          repro: `Navegar a ${mod}?tenant=${state.loginSlug} autenticado como admin.`,
          actual: "El backend devuelve 5xx al cargar el módulo.",
          expected: "Respuesta 2xx con datos o estado vacío controlado.",
          fixPrompt: `Revisa el controlador/endpoint que sirve ${mod} en Laravel; captura el stack trace (storage/logs/laravel.log) y corrige la causa del 5xx.`,
        });
      } else if (status === "FAIL") {
        QA.addFinding({
          title: `Módulo ${mod} no carga correctamente`,
          severity: "Alta", module: mod,
          error: [...httpErrs.slice(0, 2), ...jsErrs.slice(0, 2)].join(" | ") || "Fallo de navegación",
          repro: `Navegar a ${mod}?tenant=${state.loginSlug} como admin.`,
          actual: "La página falla al cargar o lanza errores.",
          expected: "Carga correcta del módulo.",
          fixPrompt: `Depura ${mod}: revisa la consola del navegador y la respuesta del API asociado. Corrige el error de render/fetch.`,
        });
      } else if (jsErrs.length) {
        QA.addFinding({
          title: `Errores JS en consola — ${mod}`,
          severity: "Media", module: mod,
          error: jsErrs.slice(0, 3).join(" | "),
          repro: `Abrir ${mod} como admin y revisar la consola.`,
          actual: "Se registran errores JavaScript en consola.",
          expected: "Consola sin errores.",
          fixPrompt: `Corrige los errores JS de ${mod} mostrados en consola (posibles props undefined, fetch sin manejo, claves de React faltantes).`,
        });
      }
    }

    // ── Persistencia + inputs maliciosos en módulos representativos con formulario
    await probeFaqsMalicious(page);
    await probeProposalCreate(page);
    await probeKnowledgeUpload(page);

    if (state.xssFired) {
      QA.addFinding({
        title: "XSS ejecutado (alert disparado) en el panel admin",
        severity: "Crítica", module: "/admin (formularios)",
        error: `Payload ${XSS_PAYLOAD} ejecutó alert().`,
        repro: "Inyectar <script>alert('xss')</script> en un campo de texto y guardar/renderizar.",
        actual: "El contenido del usuario se ejecuta como script.",
        expected: "Escapar/sanitizar todo contenido renderizado; nunca ejecutar scripts inyectados.",
        fixPrompt: "Sanitiza y escapa el contenido renderizado en el panel admin (React ya escapa por defecto — revisa usos de dangerouslySetInnerHTML y de react-markdown sin sanitizar). Aplica una whitelist en el backend.",
      });
    }

    mon.detach();
  });

  // ─────────────────────────────────────────────────────────────────────
  // FASE 4 — Seguridad
  // ─────────────────────────────────────────────────────────────────────
  test("FASE 4 — Seguridad: auth guards, aislamiento de tenant, flood", async ({ page, context }) => {
    test.setTimeout(4 * 60 * 1000);

    // 1. /admin sin login → redirect
    await context.clearCookies();
    await page.goto(withTenant("/admin"));
    await page.waitForTimeout(2500);
    await shot(page, "fase4-admin-sin-login");
    if (!/\/admin\/login/.test(page.url())) {
      QA.addFinding({
        title: "/admin accesible sin autenticación",
        severity: "Crítica", module: "/admin",
        error: `URL final: ${page.url()}`,
        repro: "Abrir /admin sin sesión.",
        actual: "No redirige a /admin/login.",
        expected: "Redirección inmediata a /admin/login.",
        fixPrompt: "Refuerza AdminGuard (admin/layout.tsx) y protege también en el backend (middleware auth:sanctum + admin) cada endpoint /api/admin/*.",
      });
    } else {
      QA.note("Guard /admin OK → redirige a login.");
    }

    // 2. /superadmin sin key → redirect
    await page.goto("/superadmin");
    await page.waitForTimeout(2000);
    await shot(page, "fase4-superadmin-sin-key");
    const saLoginVisible = await page.getByPlaceholder(/sk-sa/i).isVisible().catch(() => false);
    if (!/\/superadmin\/login/.test(page.url()) && !saLoginVisible) {
      QA.addFinding({
        title: "/superadmin accesible sin SA key",
        severity: "Crítica", module: "/superadmin",
        error: `URL final: ${page.url()}`,
        repro: "Abrir /superadmin sin clave SA.",
        actual: "No redirige a /superadmin/login.",
        expected: "Redirección a /superadmin/login.",
        fixPrompt: "Verifica el guard de superadmin/layout.tsx y exige X-Super-Admin-Key en TODOS los endpoints /api/superadmin/* del backend.",
      });
    } else {
      QA.note("Guard /superadmin OK → exige clave.");
    }

    // 3. SA endpoints sin key (API directa)
    try {
      const r = await fetch(`${API_URL}/superadmin/tenants`, { headers: { Accept: "application/json" } });
      if (r.status !== 401 && r.status !== 403) {
        QA.addFinding({
          title: "Endpoint /api/superadmin/tenants no exige autenticación",
          severity: "Crítica", module: "API /superadmin/tenants",
          error: `Status sin SA key: ${r.status}`,
          repro: "GET /api/superadmin/tenants sin header X-Super-Admin-Key.",
          actual: `Devuelve ${r.status} (debería ser 401/403).`,
          expected: "401/403 sin la SA key.",
          fixPrompt: "Asegura el middleware de SA key en todas las rutas /superadmin del backend (routes/api.php).",
        });
      } else {
        QA.note(`API SA sin key → ${r.status} (correcto).`);
      }
    } catch (e) {
      QA.note(`Check API SA sin key falló: ${(e as Error).message}`);
    }

    // 4. Aislamiento de tenant: token de un tenant + header de otro
    if (state.adminToken && state.otherTenantSlug && state.otherTenantSlug !== state.loginSlug) {
      try {
        const r = await fetch(`${API_URL}/admin/proposals`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${state.adminToken}`,
            "X-Tenant": state.otherTenantSlug,
          },
        });
        QA.note(`Cross-tenant: token de ${state.loginSlug} + X-Tenant ${state.otherTenantSlug} → status ${r.status}`);
        if (r.status === 200) {
          QA.addFinding({
            title: "Posible fuga entre tenants: token aceptado con X-Tenant de otro tenant",
            severity: "Alta", module: "API /admin/* (multi-tenant)",
            error: `GET /admin/proposals con token de ${state.loginSlug} y X-Tenant=${state.otherTenantSlug} devolvió 200.`,
            repro: "Usar el Bearer token de un tenant con el header X-Tenant de otro.",
            actual: "El backend responde 200 en vez de rechazar el cruce.",
            expected: "El token debe estar ligado a su tenant; cruzar tenants debe dar 401/403.",
            fixPrompt: "Liga el token Sanctum al tenant que lo emitió y valida en el middleware multi-tenant que el X-Tenant coincida con el del token. Rechaza con 403 cuando no coincidan.",
          });
        }
      } catch (e) {
        QA.note(`Check aislamiento falló: ${(e as Error).message}`);
      }
    } else {
      QA.note("Aislamiento de tenant: omitido (sin segundo tenant o sin token).");
    }

    // 5. Flood: 20 requests rápidos a /api/candidate desde el browser
    try {
      await page.goto(withTenant("/"));
      const result = await page.evaluate(
        async ({ base, slug }) => {
          const codes: number[] = [];
          const calls = Array.from({ length: 20 }, () =>
            fetch(`${base}/candidate`, { headers: { "X-Tenant": slug, Accept: "application/json" } })
              .then((r) => r.status)
              .catch(() => 0)
          );
          const settled = await Promise.all(calls);
          codes.push(...settled);
          return codes;
        },
        { base: API_URL, slug: state.loginSlug }
      );
      const fives = result.filter((c) => c >= 500);
      QA.note(`Flood /api/candidate (20x): ${JSON.stringify(countBy(result))}`);
      await shot(page, "fase4-flood");
      if (fives.length) {
        QA.addFinding({
          title: "Errores 5xx bajo ráfaga de requests a /api/candidate",
          severity: "Alta", module: "API /candidate",
          error: `${fives.length}/20 respuestas 5xx`,
          repro: "Disparar 20 requests concurrentes a /api/candidate.",
          actual: "El endpoint devuelve 5xx bajo carga ligera.",
          expected: "Todas las respuestas 2xx/304; el endpoint debe soportar ráfagas básicas.",
          fixPrompt: "Revisa concurrencia/conexiones DB y caché del endpoint /candidate. Considera cache de respuesta por tenant y connection pooling.",
        });
      }
    } catch (e) {
      QA.note(`Flood test falló: ${(e as Error).message}`);
    }

    // Notas de escalabilidad observadas
    QA.scalabilityNotes.push(
      "Multi-tenant por base de datos separada: el provisioning crea una DB MySQL por candidato — revisar límite de conexiones y costo operativo al escalar a cientos de tenants.",
      "Caché GET in-memory de 30s en lib/api.ts es por-pestaña (no compartida) — no sustituye caché de servidor para alta concurrencia.",
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // FASE 5 — SKIP (no consumir tokens del chatbot)
  // ─────────────────────────────────────────────────────────────────────
  test("FASE 5 — Chatbot (OMITIDA: no consumir tokens)", async () => {
    QA.note("FASE 5 omitida deliberadamente — no se envían mensajes al chatbot (/chat).");
    QA.recordModule({ module: "/chat (FASE 5)", status: "SKIP", loadMs: 0, httpErrors: [], jsErrors: [], empty: false, notes: "Omitido para no consumir tokens del LLM." });
    expect(true).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────
  // FASE 6 — Cleanup
  // ─────────────────────────────────────────────────────────────────────
  test("FASE 6 — Cleanup: eliminar el candidato de prueba", async ({ page }) => {
    test.setTimeout(3 * 60 * 1000);
    if (!state.provisionOk) {
      QA.note("FASE 6: no se provisionó tenant nuevo; nada que limpiar vía UI.");
      // Aun así, intentar borrar por API si quedó registrado
      if (state.createdTenantId) {
        await saFetch(`/superadmin/tenants/${state.createdTenantId}`, { method: "DELETE" }).catch(() => {});
      }
      return;
    }
    try {
      await page.goto("/superadmin/login");
      await page.getByPlaceholder(/sk-sa/i).fill(SUPER_ADMIN_KEY);
      await page.getByRole("button", { name: /acceder/i }).click();
      await waitSuperAdminReady(page);

      const row = page.locator("table tbody tr", { hasText: QA_TENANT.slug }).first();
      await row.getByTitle("Eliminar").click();
      // Confirmación: escribir el slug
      const confirmInput = page.getByPlaceholder(QA_TENANT.slug);
      await confirmInput.fill(QA_TENANT.slug);
      // Botón de confirmación dentro del modal (bg-red-500), no los íconos de la fila
      await page.locator("button.bg-red-500").filter({ hasText: /eliminar/i }).first().click();
      await page.waitForTimeout(3500);
      await shot(page, "fase6-post-delete");

      const uiStillThere = await page.locator("table tbody tr", { hasText: QA_TENANT.slug }).count();

      // Verdad de la base: ¿sigue el tenant registrado?
      let dbStillThere = false;
      try {
        const res = await saFetch("/superadmin/tenants");
        const data = await res.json();
        dbStillThere = (data.data ?? []).some((x: any) => x.slug === QA_TENANT.slug);
      } catch { /* noop */ }

      // Garantizar limpieza real por API si la UI no lo logró
      if (dbStillThere) {
        const res = await saFetch("/superadmin/tenants");
        const data = await res.json();
        const t = (data.data ?? []).find((x: any) => x.slug === QA_TENANT.slug);
        if (t) await saFetch(`/superadmin/tenants/${t.id}`, { method: "DELETE" }).catch(() => {});
      }

      if (dbStillThere) {
        QA.addFinding({
          title: "DELETE de tenant no eliminó el registro",
          severity: "Alta", module: "/superadmin",
          error: `Tras confirmar el borrado, ${QA_TENANT.slug} seguía registrado en la base (verificado por API).`,
          repro: "Eliminar un tenant desde el modal de confirmación y consultar GET /api/superadmin/tenants.",
          actual: "El tenant persiste tras el borrado.",
          expected: "DELETE /api/superadmin/tenants/{id} elimina el registro y la lista se actualiza.",
          fixPrompt: "Revisa DELETE /api/superadmin/tenants/{id} (controlador SuperAdmin) y handleDeleted en superadmin/page.tsx.",
        });
      } else if (uiStillThere > 0) {
        QA.addFinding({
          title: "La lista no se refresca tras eliminar un tenant (sólo UI)",
          severity: "Baja", module: "/superadmin",
          error: `El tenant ya no existe en la base, pero la fila siguió visible ${"≥3.5s"} tras eliminar.`,
          repro: "Eliminar un tenant y observar la tabla sin recargar.",
          actual: "La fila eliminada permanece en pantalla un tiempo (no se filtra de inmediato).",
          expected: "La fila desaparece inmediatamente tras un DELETE 200.",
          fixPrompt: "Confirma que handleDeleted(id) filtra el estado `tenants` inmediatamente tras el DELETE en superadmin/page.tsx.",
        });
      } else {
        QA.note("Cleanup OK — el tenant desapareció de la lista y de la base.");
      }
    } catch (e) {
      QA.note(`Cleanup UI falló (${(e as Error).message}); intentando por API.`);
      try {
        const res = await saFetch("/superadmin/tenants");
        const data = await res.json();
        const t = (data.data ?? []).find((x: any) => x.slug === QA_TENANT.slug);
        if (t) await saFetch(`/superadmin/tenants/${t.id}`, { method: "DELETE" }).catch(() => {});
      } catch { /* noop */ }
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // FASE 7 — Generar reportes (siempre al final)
  // ─────────────────────────────────────────────────────────────────────
  test("FASE 7 — Generar reportes QA", async () => {
    QA.uxNotes.push(
      "24 módulos en el sidebar admin: evaluar agrupar por secciones (Contenido / Inteligencia / Configuración) para reducir carga cognitiva.",
      "El modal de credenciales muestra historial y reset en la misma vista — considerar separar acciones destructivas.",
    );
    QA.writeReports();
    QA.note("Reportes escritos en tests/reports/qa-report.md y qa-fixes-prompt.md");
    expect(QA.modules.length + QA.findings.length).toBeGreaterThan(0);
  });
});

// ─── Helpers de prueba de formularios (best-effort, nunca lanzan) ───────────

function countBy(arr: number[]) {
  return arr.reduce<Record<string, number>>((a, c) => ((a[c] = (a[c] || 0) + 1), a), {});
}

async function probeFaqsMalicious(page: Page) {
  try {
    await page.goto(withTenant("/admin/faqs"), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const addBtn = page.locator("button.bg-brand-600").first();
    await addBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (!(await addBtn.isVisible().catch(() => false))) {
      QA.note("FAQs: no se encontró botón de creación — probe omitido.");
      return;
    }
    await addBtn.click();
    await page.waitForTimeout(600);
    const textboxes = page.locator("input[type='text'], textarea, input:not([type])");
    const n = await textboxes.count();
    if (n === 0) { QA.note("FAQs: sin campos de texto en el formulario."); await closeModal(page); return; }
    // Inyectar SQL en el primero y XSS en el segundo (o el mismo)
    await textboxes.nth(0).fill(SQL_PAYLOAD).catch(() => {});
    await textboxes.nth(Math.min(1, n - 1)).fill(XSS_PAYLOAD).catch(() => {});
    let status5xx = false;
    const onResp = (r: import("@playwright/test").Response) => { if (r.status() >= 500) status5xx = true; };
    page.on("response", onResp);
    await page.getByRole("button", { name: /guardar|crear|a[ñn]adir|registrar|enviar/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    page.off("response", onResp);
    await shot(page, "fase3-faqs-malicioso");
    if (status5xx) {
      QA.addFinding({
        title: "Input malicioso provoca 5xx en FAQs",
        severity: "Alta", module: "/admin/faqs",
        error: `Payload SQL/XSS provocó respuesta 5xx al guardar.`,
        repro: `Crear FAQ con "${SQL_PAYLOAD}" / "${XSS_PAYLOAD}".`,
        actual: "El backend responde 5xx ante input malicioso (sin validación robusta).",
        expected: "Validar y sanitizar; responder 422 con mensaje, nunca 5xx.",
        fixPrompt: "Añade validación en el FormRequest de FAQs (longitud, tipos) y usa siempre Eloquent con bindings (ya parametriza SQL). Devuelve 422 ante datos inválidos.",
      });
    } else {
      QA.note("FAQs: input malicioso manejado sin 5xx.");
    }
    await closeModal(page);
  } catch (e) {
    QA.note(`probeFaqsMalicious: ${(e as Error).message}`);
    await closeModal(page);
  }
}

async function probeProposalCreate(page: Page) {
  try {
    await page.goto(withTenant("/admin/proposals"), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const addBtn = page.locator("button.bg-brand-600").first();
    await addBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (!(await addBtn.isVisible().catch(() => false))) { QA.note("Proposals: sin botón de creación."); return; }
    await addBtn.click();
    await page.waitForTimeout(600);
    const title = `QA Propuesta ${Date.now()}`;
    const tb = page.locator("input[type='text'], input:not([type])").first();
    await tb.fill(title).catch(() => {});
    const ta = page.locator("textarea").first();
    await ta.fill("Propuesta de prueba QA — texto largo: " + LONG_STRING).catch(() => {});
    // imagen opcional
    const fileInput = page.locator("input[type='file']").first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(join(FIXTURES_DIR, "foto-candidato.jpg")).catch(() => {});
    }
    await page.getByRole("button", { name: /guardar|crear|a[ñn]adir|registrar/i }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    await shot(page, "fase3-proposals-create");
    // Verificar persistencia: recargar y buscar el título
    await page.goto(withTenant("/admin/proposals"), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const persisted = await page.getByText(title.slice(0, 20)).first().isVisible().catch(() => false);
    if (persisted) QA.note("Proposals: creación persistió correctamente tras recargar.");
    else QA.note("Proposals: no se confirmó la persistencia (puede requerir campos obligatorios adicionales).");
  } catch (e) {
    QA.note(`probeProposalCreate: ${(e as Error).message}`);
    await closeModal(page);
  }
}

async function probeKnowledgeUpload(page: Page) {
  try {
    await page.goto(withTenant("/admin/knowledge"), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const fileInput = page.locator("input[type='file']").first();
    if (!(await fileInput.count())) {
      // tal vez detrás de un botón
      const addBtn = page.getByRole("button", { name: /subir|cargar|nuevo|agregar|documento|\+/i }).first();
      if (await addBtn.isVisible().catch(() => false)) { await addBtn.click(); await page.waitForTimeout(600); }
    }
    const fi = page.locator("input[type='file']").first();
    if (await fi.count()) {
      await fi.setInputFiles(join(FIXTURES_DIR, "plan-gobierno.pdf")).catch(() => {});
      await page.waitForTimeout(800);
      const titleBox = page.locator("input[type='text'], input:not([type])").first();
      if (await titleBox.count()) await titleBox.fill("Plan de Gobierno QA").catch(() => {});
      await page.getByRole("button", { name: /subir|guardar|cargar|enviar|indexar/i }).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      await shot(page, "fase3-knowledge-upload");
      QA.note("Knowledge: intento de carga de PDF realizado.");
    } else {
      QA.note("Knowledge: no se encontró input de archivo.");
    }
  } catch (e) {
    QA.note(`probeKnowledgeUpload: ${(e as Error).message}`);
  }
}
