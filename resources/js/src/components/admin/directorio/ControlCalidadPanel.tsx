"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Play, ShieldCheck, Square, XCircle } from "lucide-react";
import {
  directorioAdmin,
  type AdminCandidato, type QaCaso, type QaEstadoCaso, type QaEstadoGlobal, type QaResultado, type QaResumenItem,
} from "@/lib/directorio";
import { cn } from "@/lib/utils";

/**
 * Control de calidad del chat de un candidato: le hace al chat real una batería de
 * preguntas y conversaciones y revisa cada respuesta con reglas fijas (citas propias,
 * no negar propuestas, hoja de vida, privacidad, neutralidad, firmeza).
 * Regla de trabajo: un candidato pagado no se comparte hasta que esto sale en verde.
 */

const PAUSA_MS = 3500;          // entre casos: cuida el límite por minuto del proveedor de IA
const ESPERA_REINTENTO_MS = 20000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ICONO: Record<QaEstadoCaso, ReactNode> = {
  ok: <CheckCircle2 size={16} className="text-green-600" aria-label="Correcto" />,
  falla: <XCircle size={16} className="text-red-600" aria-label="Falla" />,
  sin_respuesta: <AlertTriangle size={16} className="text-amber-600" aria-label="La IA no respondió" />,
};

const VEREDICTO: Record<QaEstadoGlobal, { texto: string; cls: string }> = {
  aprobado:   { texto: "Aprobado: listo para compartir", cls: "bg-green-50 text-green-800 ring-green-200" },
  fallas:     { texto: "Con fallas: no compartir todavía", cls: "bg-red-50 text-red-800 ring-red-200" },
  incompleto: { texto: "Incompleto: la IA no respondió en algunos casos, repite el control", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
};

function veredicto(items: { estado: QaEstadoCaso }[]): QaEstadoGlobal {
  if (items.some((r) => r.estado === "falla")) return "fallas";
  if (items.some((r) => r.estado === "sin_respuesta")) return "incompleto";
  return "aprobado";
}

function FilaCaso({ r }: { r: QaResultado }) {
  const [abierto, setAbierto] = useState(r.estado !== "ok");
  const fallas = r.checks.filter((c) => !c.ok);
  return (
    <li className="py-2">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        className="flex w-full items-center gap-2 text-left">
        {ICONO[r.estado]}
        <span className="flex-1 text-sm font-semibold text-gray-900">{r.titulo}</span>
        {fallas.length > 0 && <span className="text-[11px] font-semibold text-red-700">{fallas.length} {fallas.length === 1 ? "falla" : "fallas"}</span>}
        <ChevronDown size={14} className={cn("text-gray-400 transition-transform", abierto && "rotate-180")} aria-hidden />
      </button>
      {abierto && (
        <div className="mt-2 space-y-2 pl-6">
          {fallas.length > 0 && (
            <ul className="space-y-1">
              {fallas.map((f) => (
                <li key={f.nombre} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
                  <b>{f.nombre}.</b> {f.detalle}
                </li>
              ))}
            </ul>
          )}
          {r.turnos.map((t, i) => (
            <div key={i} className="rounded-lg bg-white p-2.5 text-xs ring-1 ring-gray-200">
              <p className="font-semibold text-gray-700">Vecino: {t.pregunta}</p>
              <p className="mt-1 whitespace-pre-wrap text-gray-600">{t.respuesta}</p>
              {t.citas.length > 0 && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Fuentes: {t.citas.map((c) => `${c.id ?? ""} ${c.title ?? ""}${c.page ? ` p.${c.page}` : ""}`).join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export function ControlCalidadPanel({ candidato, token, onChanged }: { candidato: AdminCandidato; token: string; onChanged: () => void }) {
  const [casos, setCasos] = useState<QaCaso[] | null>(null);
  const [ultimo, setUltimo] = useState<{ estado: QaEstadoGlobal | null; at: string | null; resumen: QaResumenItem[] } | null>(null);
  const [resultados, setResultados] = useState<QaResultado[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [actual, setActual] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelar = useRef(false);

  useEffect(() => {
    let vivo = true;
    directorioAdmin.qaCasos(token, candidato.id)
      .then((r) => { if (vivo) { setCasos(r.casos); setUltimo(r.ultimo); } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar el control."));
    return () => { vivo = false; };
  }, [token, candidato.id]);

  async function correr() {
    if (!casos) return;
    cancelar.current = false;
    setCorriendo(true); setError(null); setResultados([]);
    const hechos: QaResultado[] = [];
    try {
      for (let i = 0; i < casos.length; i++) {
        if (cancelar.current) break;
        if (i > 0) await sleep(PAUSA_MS);
        const caso = casos[i];
        setActual(caso.titulo);
        // Un caso que revienta en el servidor no corta la corrida: queda como ⚠️ con la causa.
        const ejecutar = () => directorioAdmin.qaEjecutar(token, candidato.id, caso.id).catch((e): QaResultado => ({
          id: caso.id, titulo: caso.titulo, estado: "sin_respuesta", turnos: [],
          checks: [{ nombre: "El caso se ejecutó", ok: false, detalle: e instanceof Error ? e.message : "Error del servidor." }],
        }));
        let r = await ejecutar();
        if (r.estado === "sin_respuesta" && !cancelar.current) {   // un reintento: suele ser el límite por minuto
          setActual(`${caso.titulo} (reintentando…)`);
          await sleep(ESPERA_REINTENTO_MS);
          r = await ejecutar();
        }
        hechos.push(r);
        setResultados([...hechos]);
      }
      if (!cancelar.current && hechos.length === casos.length) {
        const resumen: QaResumenItem[] = hechos.map((r) => ({
          id: r.id, titulo: r.titulo, estado: r.estado,
          fallas: r.checks.filter((c) => !c.ok).map((c) => `${c.nombre}: ${c.detalle}`.slice(0, 300)),
        }));
        const g = await directorioAdmin.qaGuardar(token, candidato.id, resumen);
        setUltimo({ estado: g.estado, at: g.at, resumen });
        onChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "El control se interrumpió.");
    } finally {
      setCorriendo(false); setActual(null);
    }
  }

  const total = casos?.length ?? 0;
  const enCurso = resultados.length > 0 ? veredicto(resultados) : null;
  const final: QaEstadoGlobal | null = !corriendo && resultados.length === total && total > 0 ? veredicto(resultados) : null;
  const mostrado = final ?? (resultados.length === 0 ? ultimo?.estado ?? null : null);

  return (
    <div className="space-y-3 rounded-xl bg-gray-50 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><ShieldCheck size={16} className="text-brand-500" /> Control de calidad del chat</p>
          <p className="text-[11px] text-gray-500">
            {total} casos reales (preguntas y conversaciones). Tarda unos {Math.max(1, Math.round((total * 10) / 60))} min. No se guarda en las métricas.
          </p>
        </div>
        {corriendo ? (
          <button type="button" onClick={() => { cancelar.current = true; }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-2 text-xs font-bold text-gray-700">
            <Square size={13} /> Detener
          </button>
        ) : (
          <button type="button" onClick={correr} disabled={!casos}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
            <Play size={13} /> {ultimo?.estado ? "Volver a correr" : "Correr control"}
          </button>
        )}
      </div>

      {mostrado && (
        <p className={cn("rounded-lg px-3 py-2 text-xs font-bold ring-1", VEREDICTO[mostrado].cls)}>
          {VEREDICTO[mostrado].texto}
          {!final && ultimo?.at && <span className="font-normal"> · último control {new Date(ultimo.at).toLocaleString("es-PE")}</span>}
        </p>
      )}

      {corriendo && (
        <div className="space-y-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${total ? (resultados.length / total) * 100 : 0}%` }} />
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Loader2 size={11} className="animate-spin" /> {resultados.length}/{total} · {actual}
            {enCurso === "fallas" && <span className="font-semibold text-red-700"> · ya hay fallas</span>}
          </p>
        </div>
      )}

      {resultados.length > 0 ? (
        <ul className="divide-y divide-gray-200 rounded-xl bg-white px-3 ring-1 ring-gray-200">
          {resultados.map((r) => <FilaCaso key={r.id} r={r} />)}
        </ul>
      ) : ultimo?.resumen?.length ? (
        <ul className="divide-y divide-gray-200 rounded-xl bg-white px-3 ring-1 ring-gray-200">
          {ultimo.resumen.map((r) => (
            <li key={r.id} className="py-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">{ICONO[r.estado]} {r.titulo}</p>
              {r.fallas?.map((f) => <p key={f} className="mt-1 pl-6 text-xs text-red-700">{f}</p>)}
            </li>
          ))}
        </ul>
      ) : null}

      {error && <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle size={13} /> {error}</p>}
    </div>
  );
}
