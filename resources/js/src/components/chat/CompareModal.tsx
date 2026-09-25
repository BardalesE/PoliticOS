"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Scale, X } from "lucide-react";
import { normalizeApiBase, tenantHeaders } from "@/lib/api";

/**
 * Comparador 1 vs 1: dos candidatos de la zona, un tema, dos columnas.
 * Cada columna sale de SUS documentos con la misma regla para ambos; los puntos
 * llevan su cita [S#] que abre el PDF resaltado (mismo visor del chat).
 */

const API = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

export interface CompareCandidate { slug: string; name: string; party?: string | null }

export interface CompareCitation {
  id: string;
  title: string;
  page: number | null;
  excerpt: string;
  url: string | null;
  document_id?: number | null;
}

interface Side {
  slug: string;
  name: string;
  party: string | null;
  found: boolean;
  points: string[];
  concrete: string;
  citations: CompareCitation[];
}

const TOPICS: { key: string; label: string; emoji: string }[] = [
  { key: "agricultura", label: "Agricultura",     emoji: "🌾" },
  { key: "salud",       label: "Salud",           emoji: "🏥" },
  { key: "educacion",   label: "Educación",       emoji: "📚" },
  { key: "agua",        label: "Agua y desagüe",  emoji: "💧" },
  { key: "seguridad",   label: "Seguridad",       emoji: "🛡️" },
  { key: "vias",        label: "Vías y transporte", emoji: "🛣️" },
  { key: "ambiente",    label: "Medio ambiente",  emoji: "♻️" },
  { key: "empleo",      label: "Empleo",          emoji: "💼" },
];

const CITE_RE = /\[\s*(S\d+(?:\s*,\s*S\d+)*)\s*\]/g;

/** Texto con sus etiquetas [S#] convertidas en botones que abren la fuente. */
function PointText({ text, citations, onCite }: { text: string; citations: CompareCitation[]; onCite: (c: CompareCitation) => void }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_RE)) {
    parts.push(text.slice(last, m.index));
    for (const id of m[1].match(/S\d+/g) ?? []) {
      const c = citations.find((x) => x.id === id);
      if (!c) continue;
      parts.push(
        <button key={`${m.index}-${id}`} type="button" onClick={() => onCite(c)}
          title={`${c.title}${c.page ? ` — pág. ${c.page}` : ""}`}
          className="mx-0.5 inline-flex -translate-y-0.5 items-center rounded bg-yellow-100 px-1 text-[10px] font-bold leading-4 text-yellow-800 ring-1 ring-yellow-300 hover:bg-yellow-200">
          {id}
        </button>,
      );
    }
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function Column({ side, onCite }: { side: Side; onCite: (c: CompareCitation) => void }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-4" aria-label={side.name}>
      <h3 className="text-[15px] font-bold leading-tight text-gray-900">{side.name}</h3>
      {side.party && <p className="mt-0.5 truncate text-[11px] text-gray-500">{side.party}</p>}

      {side.found ? (
        <>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-gray-700">
            {side.points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
                <span><PointText text={p} citations={side.citations} onCite={onCite} /></span>
              </li>
            ))}
          </ul>
          {side.concrete && (
            <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
              <span className="font-semibold text-gray-700">Detalle concreto: </span>
              <PointText text={side.concrete} citations={side.citations} onCite={onCite} />
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
          Sus documentos no mencionan propuestas sobre este tema.
        </p>
      )}
    </section>
  );
}

export default function CompareModal({
  candidates, initialA, onClose, onCite,
}: {
  candidates: CompareCandidate[];
  initialA: string | null;
  onClose: () => void;
  onCite: (c: CompareCitation) => void;
}) {
  const first  = initialA && candidates.some((c) => c.slug === initialA) ? initialA : candidates[0]?.slug ?? "";
  const [a, setA] = useState(first);
  const [b, setB] = useState(candidates.find((c) => c.slug !== first)?.slug ?? "");
  const [topic, setTopic] = useState<string | null>(null);
  const [sides, setSides] = useState<Side[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Si A y B quedan iguales, B pasa al siguiente disponible.
  useEffect(() => {
    if (a && a === b) setB(candidates.find((c) => c.slug !== a)?.slug ?? "");
  }, [a, b, candidates]);

  useEffect(() => {
    if (!topic || !a || !b || a === b) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setSides(null);
    fetch(`${API}/chat/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...tenantHeaders() },
      body: JSON.stringify({ a, b, topic }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || (r.status === 429 ? "Muchas comparaciones seguidas. Espera un minuto." : "No pudimos comparar ahora."));
        return j as { sides: Side[] };
      })
      .then((j) => alive && setSides(j.sides))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "No pudimos comparar ahora."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [a, b, topic]);

  const selectCls = "w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-[13px] font-semibold text-gray-800";

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Comparar candidatos">
      <button type="button" aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-gray-50 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
          <Scale size={18} className="text-brand-600" aria-hidden />
          <h2 className="flex-1 text-[15px] font-bold text-gray-900">Comparar 1 vs 1</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          {/* Quiénes */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <select aria-label="Primer candidato" className={selectCls} value={a} onChange={(e) => setA(e.target.value)}>
              {candidates.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            <span className="text-[12px] font-black text-gray-400">VS</span>
            <select aria-label="Segundo candidato" className={selectCls} value={b} onChange={(e) => setB(e.target.value)}>
              {candidates.filter((c) => c.slug !== a).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>

          {/* Tema */}
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-gray-400">¿Sobre qué tema?</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Tema">
            {TOPICS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTopic(t.key)} aria-pressed={topic === t.key}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  topic === t.key ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-brand-600/40"
                }`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {/* Resultado */}
          <div className="mt-4" aria-live="polite">
            {!topic && <p className="rounded-xl bg-white p-4 text-center text-[13px] text-gray-500">Elige un tema para ver qué propone cada uno.</p>}
            {loading && (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-2xl bg-white p-4">
                    <div className="h-4 w-2/3 rounded bg-gray-200" />
                    <div className="mt-4 h-3 w-full rounded bg-gray-100" /><div className="mt-2 h-3 w-5/6 rounded bg-gray-100" /><div className="mt-2 h-3 w-4/6 rounded bg-gray-100" />
                  </div>
                ))}
                <p className="flex items-center gap-2 text-[12px] text-gray-500 sm:col-span-2"><Loader2 size={14} className="animate-spin" /> Leyendo sus planes de gobierno…</p>
              </div>
            )}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
            {sides && (
              <div className="grid gap-3 sm:grid-cols-2">
                {sides.map((s) => <Column key={s.slug} side={s} onCite={onCite} />)}
              </div>
            )}
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
            Resumen automático hecho solo con los documentos de cada candidato y con la misma regla para ambos. No es una
            calificación. Toca una etiqueta <span className="rounded bg-yellow-100 px-1 font-bold text-yellow-800">S1</span> para ver el texto original resaltado.
          </p>
        </div>
      </div>
    </div>
  );
}
