/**
 * qa-collector.ts
 * Estado compartido del QA Agent + utilidades de captura y generación de reportes.
 * El spec corre serial con workers:1, así que este singleton persiste en memoria
 * durante toda la corrida. El último test invoca writeReports().
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { REPORTS_DIR, SCREENSHOTS_DIR } from "./qa-env";

export type Severity = "Crítica" | "Alta" | "Media" | "Baja";

export interface Finding {
  id: number;
  title: string;
  severity: Severity;
  module: string;
  error: string;
  repro: string;
  actual: string;
  expected: string;
  fixPrompt: string;
}

export interface ModuleResult {
  module: string;
  status: "OK" | "WARN" | "FAIL" | "SKIP";
  loadMs: number;
  httpErrors: string[];
  jsErrors: string[];
  empty: boolean;
  notes: string;
}

export interface DuplicateNote {
  area: string;
  detail: string;
}

interface Scores {
  arquitectura: number;
  seguridad: number;
  escalabilidad: number;
  ux: number;
  performance: number;
}

class Collector {
  findings: Finding[] = [];
  modules: ModuleResult[] = [];
  duplicates: DuplicateNote[] = [];
  securityNotes: string[] = [];
  scalabilityNotes: string[] = [];
  uxNotes: string[] = [];
  staticTableRows: string[] = []; // markdown rows for FASE 1
  staticSummary: string[] = [];   // free-text lines for FASE 1
  log: string[] = [];
  scores: Partial<Scores> = {};
  private nextId = 1;

  addFinding(f: Omit<Finding, "id">): Finding {
    const finding: Finding = { id: this.nextId++, ...f };
    this.findings.push(finding);
    this.note(`FINDING #${finding.id} [${finding.severity}] ${finding.module} — ${finding.title}`);
    return finding;
  }

  recordModule(m: ModuleResult) {
    this.modules.push(m);
    this.note(
      `MÓDULO ${m.module} → ${m.status} (${m.loadMs}ms, http:${m.httpErrors.length}, js:${m.jsErrors.length}${m.empty ? ", vacío" : ""})`
    );
  }

  note(line: string) {
    const ts = new Date().toISOString().slice(11, 19);
    this.log.push(`[${ts}] ${line}`);
    // eslint-disable-next-line no-console
    console.log(`   · ${line}`);
  }

  // ─── Reportes ────────────────────────────────────────────────────────
  writeReports() {
    mkdirSync(REPORTS_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);

    writeFileSync(join(REPORTS_DIR, "qa-report.md"), this.buildReport(date), "utf8");
    writeFileSync(join(REPORTS_DIR, "qa-fixes-prompt.md"), this.buildFixes(date), "utf8");
    writeFileSync(
      join(REPORTS_DIR, "_qa-raw.json"),
      JSON.stringify(
        {
          findings: this.findings,
          modules: this.modules,
          duplicates: this.duplicates,
          security: this.securityNotes,
          scalability: this.scalabilityNotes,
          ux: this.uxNotes,
          scores: this.scores,
          log: this.log,
        },
        null,
        2
      ),
      "utf8"
    );
  }

  private bySeverity(sev: Severity) {
    return this.findings.filter((f) => f.severity === sev);
  }

  private findingList(sev: Severity): string {
    const items = this.bySeverity(sev);
    if (!items.length) return "_Ninguno detectado._\n";
    return (
      items
        .map(
          (f) =>
            `- **#${f.id} — ${f.title}** (\`${f.module}\`)\n  - Error: ${f.error}\n  - Actual: ${f.actual}\n  - Esperado: ${f.expected}`
        )
        .join("\n") + "\n"
    );
  }

  private deriveScores(): Scores {
    const crit = this.bySeverity("Crítica").length;
    const alta = this.bySeverity("Alta").length;
    const media = this.bySeverity("Media").length;
    const penalty = crit * 22 + alta * 10 + media * 4;

    // Piso de compilación en dev (~3.5s) + slowMo + video inflan los tiempos:
    // sólo puntúan los outliers reales (>6s). El listado del reporte sigue usando >3s.
    const slow = this.modules.filter((m) => m.loadMs > 6000).length;
    const failed = this.modules.filter((m) => m.status === "FAIL").length;

    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const auto: Scores = {
      arquitectura: clamp(90 - Math.min(this.duplicates.length, 8) * 3 - failed * 5),
      seguridad: clamp(95 - this.securityNotes.length * 8 - this.bySeverity("Crítica").length * 15),
      escalabilidad: clamp(90 - this.scalabilityNotes.length * 5 - slow * 6),
      ux: clamp(85 - this.uxNotes.length * 4 - penalty / 3),
      performance: clamp(90 - slow * 15),
    };
    // overrides manuales del spec ganan
    return { ...auto, ...this.scores } as Scores;
  }

  private buildReport(date: string): string {
    const s = this.deriveScores();
    const crit = this.bySeverity("Crítica").length;
    const alta = this.bySeverity("Alta").length;
    const media = this.bySeverity("Media").length;
    const baja = this.bySeverity("Baja").length;
    const overall = Math.round((s.arquitectura + s.seguridad + s.escalabilidad + s.ux + s.performance) / 5);

    const moduleRows =
      this.modules
        .map(
          (m) =>
            `| \`${m.module}\` | ${m.status} | ${m.loadMs}ms | http:${m.httpErrors.length} js:${m.jsErrors.length} | ${
              (m.empty ? "estado vacío. " : "") + (m.notes || "—")
            } |`
        )
        .join("\n") || "| _sin datos_ | — | — | — | — |";

    const slowRows =
      this.modules
        .filter((m) => m.loadMs > 3000)
        .map((m) => `- \`${m.module}\` — ${m.loadMs}ms`)
        .join("\n") || "_Ninguna página superó los 3s._";

    const dupRows =
      this.duplicates.map((d) => `- **${d.area}** — ${d.detail}`).join("\n") ||
      "_No se detectaron duplicados evidentes._";

    const secRows = this.securityNotes.map((n) => `- ${n}`).join("\n") || "_Sin hallazgos de seguridad registrados._";
    const scaleRows =
      this.scalabilityNotes.map((n) => `- ${n}`).join("\n") || "_Sin riesgos de escalabilidad registrados._";
    const uxRows = this.uxNotes.map((n) => `- ${n}`).join("\n") || "_Sin observaciones de UX registradas._";

    return `# PoliticOS QA Report — ${date}

> Generado automáticamente por \`politicos-qa-agent.spec.ts\`. Auditoría de solo lectura
> (no se modificó código fuente). Tokens del chatbot NO consumidos (FASE 5 omitida).

## Resumen Ejecutivo

- Módulos auditados: **${this.modules.length}**
- Hallazgos totales: **${this.findings.length}** — Críticos: ${crit} · Altos: ${alta} · Medios: ${media} · Menores: ${baja}
- Módulos con fallo (FAIL): **${this.modules.filter((m) => m.status === "FAIL").length}**
- Páginas lentas (>3s): **${this.modules.filter((m) => m.loadMs > 3000).length}**
- **Puntaje general: ${overall}/100**

## Problemas Críticos (bloqueadores)

${this.findingList("Crítica")}
## Problemas Altos

${this.findingList("Alta")}
## Problemas Medios

${this.findingList("Media")}
## Problemas Menores

${this.findingList("Baja")}
## Módulos Duplicados o Redundantes

${dupRows}

## Riesgos de Seguridad

${secRows}

## Riesgos de Escalabilidad

${scaleRows}

## UX — Qué eliminar, simplificar, reorganizar

${uxRows}

## Performance — Páginas lentas (+3s)

> ⚠️ **Medición en servidor de desarrollo**: los tiempos incluyen compilación
> on-demand de Next.js (piso ~3.5s en la primera visita a cada ruta), \`slowMo:300\`
> y grabación de video. No son representativos de producción. Trata como reales
> sólo los outliers (>6s, p.ej. \`/admin/intelligence\`, \`/admin/onboarding\`).
> Para medir producción: \`next build && next start\` y re-correr el sweep.

${slowRows}

## Tabla de módulos

| Módulo | Estado | Tiempo | Errores | Notas |
|--------|--------|--------|---------|-------|
${moduleRows}

## Inventario estático (FASE 1)

${this.staticSummary.join("\n") || "_sin datos_"}

| Ruta / Componente | Tipo | Formulario | Notas |
|-------------------|------|-----------|-------|
${this.staticTableRows.join("\n") || "| _sin datos_ | — | — | — |"}

## Puntaje General (0-100)

| Dimensión | Puntaje |
|-----------|---------|
| Arquitectura | ${s.arquitectura} |
| Seguridad | ${s.seguridad} |
| Escalabilidad | ${s.escalabilidad} |
| UX | ${s.ux} |
| Performance | ${s.performance} |
| **General** | **${overall}** |

---
_Log de ejecución: ${this.log.length} eventos. Ver \`_qa-raw.json\` y \`tests/screenshots/\`._
`;
  }

  private buildFixes(date: string): string {
    const head = `# PoliticOS — Prompts de Corrección (${date})

Un bloque por hallazgo, listo para pegar en Claude Code. Ordenados por severidad.

`;
    const order: Severity[] = ["Crítica", "Alta", "Media", "Baja"];
    const sorted = order.flatMap((sev) => this.bySeverity(sev));
    if (!sorted.length) {
      return head + "_No se registraron hallazgos que requieran corrección._\n";
    }
    const blocks = sorted
      .map(
        (f) => `---
## FIX #${f.id}: ${f.title}
**Severidad:** ${f.severity}
**Módulo:** ${f.module}
**Error:** ${f.error}
**Pasos para reproducir:** ${f.repro}
**Resultado actual:** ${f.actual}
**Resultado esperado:** ${f.expected}
**Prompt para Claude Code:**
${f.fixPrompt}
---`
      )
      .join("\n\n");
    return head + blocks + "\n";
  }
}

export const QA = new Collector();

// ─── Monitor de página: captura errores JS, HTTP y permite screenshots ─────

export interface PageMonitor {
  jsErrors: string[];
  httpErrors: string[];
  detach: () => void;
}

export function monitorPage(page: Page): PageMonitor {
  const jsErrors: string[] = [];
  const httpErrors: string[] = [];

  // Ruido de Next.js en modo dev (HMR / RSC) y de navegación — no son bugs de la app
  const DEV_NOISE =
    /favicon|Download the React DevTools|hydrat|RSC payload|hot-reloader|Falling back to browser navigation|HMR|__nextjs|webpack-internal/i;
  const onPageError = (err: Error) => {
    if (DEV_NOISE.test(err.message)) return;
    jsErrors.push(err.message);
  };
  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (DEV_NOISE.test(t)) return;
      jsErrors.push(t);
    }
  };
  const onResponse = (res: import("@playwright/test").Response) => {
    const st = res.status();
    if (st >= 400) httpErrors.push(`${st} ${res.request().method()} ${res.url()}`);
  };
  const onFailed = (req: import("@playwright/test").Request) => {
    const errText = req.failure()?.errorText ?? "?";
    // ERR_ABORTED = el cliente canceló el request (navegación/redirect), NO un fallo de servidor
    if (/ERR_ABORTED|interrupted|context was destroyed/i.test(errText)) return;
    httpErrors.push(`FAILED ${req.method()} ${req.url()} (${errText})`);
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);

  return {
    jsErrors,
    httpErrors,
    detach() {
      page.off("pageerror", onPageError);
      page.off("console", onConsole);
      page.off("response", onResponse);
      page.off("requestfailed", onFailed);
    },
  };
}

let shotSeq = 0;
export async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const safe = `${String(++shotSeq).padStart(3, "0")}-${name.replace(/[^a-z0-9-]+/gi, "_")}.png`;
  const path = join(SCREENSHOTS_DIR, safe);
  try {
    await page.screenshot({ path, fullPage: true });
  } catch {
    try {
      await page.screenshot({ path });
    } catch {
      /* página cerrada o en transición — ignorar */
    }
  }
  return path;
}
