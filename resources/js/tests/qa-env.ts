/**
 * qa-env.ts
 * Lee credenciales y URLs SOLO desde los archivos .env del proyecto.
 * No contiene secretos hardcodeados. Usado por playwright.config.ts y el spec.
 *
 * Paths anclados a process.cwd() = resources/js (garantizado por `npm run qa:run`).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const JS_ROOT = process.cwd();                 // resources/js
export const PROJECT_ROOT = join(JS_ROOT, "..", ".."); // C:\laragon\www\PoliticOS
export const TESTS_DIR = join(JS_ROOT, "tests");
export const FIXTURES_DIR = join(TESTS_DIR, "fixtures");
export const REPORTS_DIR = join(TESTS_DIR, "reports");
export const SCREENSHOTS_DIR = join(TESTS_DIR, "screenshots");
export const SRC_APP = join(JS_ROOT, "src", "app");
export const SRC_COMPONENTS = join(JS_ROOT, "src", "components");

function parseEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const rootEnv = parseEnv(join(PROJECT_ROOT, ".env"));
const localEnv = parseEnv(join(JS_ROOT, ".env.local"));

// API Laravel (p.ej. http://localhost:8000/api)
export const API_URL =
  localEnv.NEXT_PUBLIC_API_URL ||
  (rootEnv.APP_URL ? rootEnv.APP_URL.replace(/\/$/, "") + "/api" : "http://localhost:8000/api");

// Origin de la API sin /api
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

// Frontend Next.js
export const FRONTEND_URL = (rootEnv.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

// SuperAdmin key
export const SUPER_ADMIN_KEY = rootEnv.SUPER_ADMIN_KEY || "";

// ─── Datos del candidato de prueba (FASE 2/3/6) ───────────────────────────
// El email y la contraseña los fija el propio test DURANTE el provisioning,
// por eso son deterministas: no son secretos externos, son entradas del test.
export const QA_TENANT = {
  slug: "roberto-futuro-peru",
  name: "Futuro Perú",
  plan: "starter" as const,
  adminEmail: "qa-admin@roberto-futuro-peru.pe",
  adminPassword: "QaTest2026!",
};

export const env = { rootEnv, localEnv };
