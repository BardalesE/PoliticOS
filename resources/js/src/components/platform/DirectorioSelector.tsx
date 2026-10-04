"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronDown, ChevronRight, FileText, MapPin, MessageCircle, MessagesSquare, Search, X } from "lucide-react";
import { PartyLogo } from "@/components/ui/PartyLogo";
import {
  DIRECTORY_TENANT,
  getCandidatos,
  prettyPlace,
  type CandidatoResumen,
  type DepartamentoDisp,
  type DistritoDisp,
  type FiltroLugar,
  type ProvinciaDisp,
  type Ubicaciones,
} from "@/lib/directorio";

/**
 * "Encuentra a tus candidatos": el usuario escribe o toca SU distrito y ve la
 * lista al instante. Solo se ofrecen lugares que ya tienen candidatos
 * publicados con su base de conocimiento lista (la regla la aplica el API).
 *
 * UX (2026-09-24):
 *  1. Buscador de texto sobre los distritos habilitados (sin tildes, parcial).
 *  2. Lugares como tarjetas grandes, no chips.
 *  3. Si hay UN solo distrito habilitado se preselecciona: nada de panel vacío.
 *  4. El selector en cascada queda plegado ("Buscar por departamento") para
 *     cuando haya muchos lugares.
 *
 * `ubicaciones === null` significa que el API no respondió (distinto de "no hay
 * lugares habilitados todavía").
 */

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_PEDIDOS ?? "").replace(/\D/g, "");
const PRIMARY = "rgb(var(--brand-primary-rgb))";
const MAX_LUGARES = 9;

const selectCls =
  "w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-[15px] text-ink-800 shadow-sm " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400";


/** "Cajamarca" == "cajamarca", "Chepén" == "chepen". */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Un lugar elegible: un distrito, o una provincia/región que tiene candidatos
 * de su propio nivel (alcalde provincial, gobernador regional).
 */
interface Lugar {
  key: string;
  nivel: "region" | "provincia" | "distrito";
  dep: DepartamentoDisp;
  prov: ProvinciaDisp | null;
  dist: DistritoDisp | null;
  titulo: string;
  subtitulo: string;
  /** Candidatos de ESTE nivel (los que se eligen aquí). */
  count: number;
  /** Candidatos de niveles superiores por los que también vota quien vive aquí. */
  arriba: number;
  /** "la provincia", "la región" o "la provincia y la región". */
  arribaDe: string;
  haystack: string;
}

const NIVEL_TITULO: Record<string, string> = {
  regional: "Gobierno regional",
  provincial: "Municipalidad provincial",
  distrital: "Municipalidad distrital",
};

function PedirTuLugar({ compact = false }: { compact?: boolean }) {
  if (!WHATSAPP) return null;
  const text = encodeURIComponent("Hola, quiero que carguen en PoliticOS a los candidatos de mi distrito: ");
  return (
    <a
      href={`https://wa.me/${WHATSAPP}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-black/15 bg-white font-bold text-ink-800 transition hover:bg-[#EAF3E6] ${
        compact ? "px-3.5 py-2 text-[13px]" : "px-5 py-3 text-[14px]"
      }`}
    >
      <MessageCircle size={compact ? 15 : 17} aria-hidden />
      ¿No ves tu distrito? Pide que lo carguemos
    </a>
  );
}

function LugarCard({ l, active, onPick }: { l: Lugar; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        className={`group flex w-full items-center gap-3 rounded-2xl p-3.5 text-left ring-1 transition
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          active ? "text-white ring-transparent shadow-md" : "bg-white text-ink-800 ring-black/10 hover:bg-[#EAF3E6] hover:ring-[#2F7D4F]/30"
        }`}
        style={active ? { background: PRIMARY } : undefined}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white/15" : "bg-[#EAF3E6]"}`}
          aria-hidden
        >
          <MapPin size={20} style={active ? undefined : { color: PRIMARY }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-snug">{l.titulo}</span>
          <span className={`block truncate text-[12px] ${active ? "text-white/80" : "text-ink-500"}`}>{l.subtitulo}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${active ? "bg-white" : "text-white"}`}
          style={active ? { color: PRIMARY } : { background: PRIMARY }}
          aria-label={`${l.count} ${l.count === 1 ? "candidato" : "candidatos"} de ${l.nivel === "region" ? "la región" : l.nivel === "provincia" ? "la provincia" : "el distrito"}`}
        >
          {l.count}
        </span>
      </button>
    </li>
  );
}

function conTenant(path: string, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (DIRECTORY_TENANT) p.set("tenant", DIRECTORY_TENANT);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

/** La tarjeta abre la ficha del candidato; "Preguntar" va directo al chat acotado a él. */
const fichaHref = (slug: string) => conTenant(`/candidato/${slug}`);
const chatHref  = (slug: string) => conTenant("/chat", { candidato: slug });

function CandidatoCard({ c }: { c: CandidatoResumen }) {
  return (
    <li className="min-w-0">
      <div
        className="group relative flex h-full flex-col rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:ring-[#2F7D4F]/30 motion-safe:hover:-translate-y-0.5
                   focus-within:ring-2 focus-within:ring-[#2F7D4F]/40 sm:p-4"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          {/* El símbolo del partido es la imagen principal: así lo reconoce la gente en la cédula */}
          <PartyLogo src={c.logo_url} party={c.party} name={c.name} size={64} />
          <span className="min-w-0 flex-1">
            {/* Enlace "estirado": toda la tarjeta abre la ficha (after:inset-0). */}
            <Link
              href={fichaHref(c.slug)}
              className="line-clamp-2 text-[15px] font-bold leading-snug text-ink-800 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] sm:text-[16px]"
            >
              {c.name}
            </Link>
            {c.perfil_completado && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
                <BadgeCheck size={12} aria-hidden /> Perfil completado
              </span>
            )}
            <span className="block text-[13px] leading-snug text-ink-500">{c.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-400">
              <span className="max-w-full truncate">{c.party}{c.list_number ? ` · N.º ${c.list_number}` : ""}</span>
              <span className="inline-flex items-center gap-1">
                <FileText size={12} aria-hidden />
                {c.documentos_count} {c.documentos_count === 1 ? "documento" : "documentos"}
              </span>
            </span>
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3">
          <span className="inline-flex flex-1 items-center gap-1 text-[13px] font-bold" style={{ color: PRIMARY }} aria-hidden>
            Ver perfil <ChevronRight size={15} className="transition group-hover:translate-x-0.5" />
          </span>
          <Link
            href={chatHref(c.slug)}
            aria-label={`Preguntar a la IA sobre ${c.name}`}
            className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-[#EAF3E6] px-3 py-1.5 text-[12px] font-bold text-[#2F7D4F] transition hover:bg-[#2F7D4F] hover:text-white
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <MessagesSquare size={14} aria-hidden /> Preguntar
          </Link>
        </div>
      </div>
    </li>
  );
}

export function DirectorioSelector({ ubicaciones }: { ubicaciones: Ubicaciones | null }) {
  const deps: DepartamentoDisp[] = useMemo(() => ubicaciones?.departamentos ?? [], [ubicaciones]);

  // Cobertura real: lugares con al menos un candidato visible (propio o en un nivel inferior).
  const totales = useMemo(() => ({
    departamentos: deps.length,
    provincias: deps.reduce((n, d) => n + d.provincias.length, 0),
    distritos: deps.reduce((n, d) => n + d.provincias.reduce((m, p) => m + p.distritos.length, 0), 0),
  }), [deps]);

  // Lugares elegibles aplanados: regiones y provincias con candidatos propios
  // (gobernador, alcalde provincial) y distritos. Cada distrito cuenta también
  // a los candidatos de su provincia y región: son los que ese vecino elige.
  const lugares: Lugar[] = useMemo(
    () =>
      deps.flatMap((dep) => {
        const out: Lugar[] = [];
        const reg = dep.regionales ?? 0;
        if (reg > 0) {
          out.push({
            key: `r${dep.id}`, nivel: "region", dep, prov: null, dist: null,
            titulo: `Región ${prettyPlace(dep.nombre)}`, subtitulo: "Gobierno regional", count: reg, arriba: 0, arribaDe: "",
            haystack: norm(`region ${dep.nombre} gobierno regional gobernador`),
          });
        }
        for (const prov of dep.provincias) {
          const pv = prov.provinciales ?? 0;
          if (pv > 0) {
            out.push({
              key: `p${prov.id}`, nivel: "provincia", dep, prov, dist: null,
              titulo: `Provincia de ${prettyPlace(prov.nombre)}`, subtitulo: `Municipalidad provincial · ${prettyPlace(dep.nombre)}`,
              count: pv, arriba: reg, arribaDe: "la región",
              haystack: norm(`provincia ${prov.nombre} ${dep.nombre}`),
            });
          }
          for (const dist of prov.distritos) {
            out.push({
              key: `d${dist.id}`, nivel: "distrito", dep, prov, dist,
              titulo: prettyPlace(dist.nombre), subtitulo: `${prettyPlace(prov.nombre)} · ${prettyPlace(dep.nombre)}`,
              count: dist.candidatos, arriba: pv + reg,
              arribaDe: pv > 0 && reg > 0 ? "la provincia y la región" : pv > 0 ? "la provincia" : "la región",
              haystack: norm(`${dist.nombre} ${prov.nombre} ${dep.nombre}`),
            });
          }
        }
        return out;
      }),
    [deps],
  );

  // Un solo lugar habilitado → preseleccionado (evita el panel vacío).
  const only = lugares.length === 1 ? lugares[0] : null;
  const [depId, setDepId]   = useState<number | null>(only?.dep.id ?? null);
  const [provId, setProvId] = useState<number | null>(only?.prov?.id ?? null);
  const [distId, setDistId] = useState<number | null>(only?.dist?.id ?? null);
  const [query, setQuery]   = useState("");

  const [candidatos, setCandidatos] = useState<CandidatoResumen[] | null>(null);
  const [loading, setLoading]       = useState(false);
  const [failed, setFailed]         = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const dep  = useMemo(() => deps.find((d) => d.id === depId) ?? null, [deps, depId]);
  const prov = useMemo(() => dep?.provincias.find((p) => p.id === provId) ?? null, [dep, provId]);

  const q = norm(query);
  const visibles = useMemo(
    () => (q ? lugares.filter((l) => l.haystack.includes(q)) : lugares).slice(0, MAX_LUGARES),
    [lugares, q],
  );

  function pickLugar(l: Lugar) {
    setDepId(l.dep.id); setProvId(l.prov?.id ?? null); setDistId(l.dist?.id ?? null);
    // En móvil la lista queda debajo: la traemos a la vista.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function pickDep(id: number | null) {
    const d = deps.find((x) => x.id === id) ?? null;
    setDepId(id);
    // Si solo hay una opción, se elige sola: menos clics.
    const p = d && d.provincias.length === 1 ? d.provincias[0] : null;
    setProvId(p?.id ?? null);
    setDistId(p && p.distritos.length === 1 ? p.distritos[0].id : null);
  }

  function pickProv(id: number | null) {
    const p = dep?.provincias.find((x) => x.id === id) ?? null;
    setProvId(id);
    setDistId(p && p.distritos.length === 1 ? p.distritos[0].id : null);
  }

  function limpiar() { setDepId(null); setProvId(null); setDistId(null); }

  // Lista de candidatos del nivel más específico elegido.
  const filtro: FiltroLugar | null =
    distId  ? { distrito_id: distId }
    : provId ? { provincia_id: provId }
    : depId  ? { departamento_id: depId }
    : null;
  const filtroKey = filtro ? JSON.stringify(filtro) : "";
  const selKey = distId ? `d${distId}` : provId ? `p${provId}` : depId ? `r${depId}` : "";

  useEffect(() => {
    if (!filtro) { setCandidatos(null); setFailed(false); return; }
    let alive = true;
    setLoading(true);
    setFailed(false);
    getCandidatos(filtro).then((res) => {
      if (!alive) return;
      setCandidatos(res ?? []);
      setFailed(res === null);
      setLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroKey]);

  // Del cargo más amplio al más local: región → provincia → distrito.
  // Solo los cargos que se eligen en el lugar escogido: la provincia muestra a sus
  // alcaldes provinciales (y la región a sus gobernadores), no a los distritales de
  // toda la provincia. El distrito sí ve todo por lo que vota (distrito + arriba).
  const delLugar = useMemo(() => {
    const permitidos = distId ? null : provId ? ["regional", "provincial"] : ["regional"];
    return (candidatos ?? []).filter((c) => !permitidos || permitidos.includes(c.ambito ?? "distrital"));
  }, [candidatos, distId, provId]);

  const grupos = useMemo(() => {
    const orden = ["regional", "provincial", "distrital"] as const;
    return orden
      .map((nivel) => ({ nivel, items: delLugar.filter((c) => (c.ambito ?? "distrital") === nivel) }))
      .filter((g) => g.items.length > 0);
  }, [delLugar]);

  const lugarLabel = [
    distId ? prov?.distritos.find((x) => x.id === distId)?.nombre : null,
    prov && !distId ? `provincia de ${prov.nombre}` : null,
    dep?.nombre,
  ].filter((n): n is string => !!n).map(prettyPlace).join(", ");

  return (
    <section id="directorio" className="mx-auto max-w-6xl px-3 pb-10 sm:px-5" aria-labelledby="directorio-title">
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#2F7D4F]/10 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>Paso 1 · Tu lugar de votación</p>
            <h2 id="directorio-title" className="mt-1 text-[clamp(24px,3vw,34px)] font-bold leading-tight text-ink-800">
              Encuentra a tus candidatos
            </h2>
            <p className="mt-1 max-w-xl text-[14px] text-ink-500">
              Los candidatos cambian según dónde votas. Busca tu distrito: solo mostramos lugares con información verificada.
            </p>
          </div>
        </div>

        {ubicaciones && ubicaciones.total_candidatos > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Cobertura del directorio">
            {[
              { n: ubicaciones.total_candidatos, uno: "Candidato", varios: "Candidatos" },
              { n: totales.departamentos, uno: "Región", varios: "Regiones" },
              { n: totales.provincias, uno: "Provincia", varios: "Provincias" },
              { n: totales.distritos, uno: "Distrito", varios: "Distritos" },
            ].map((t) => (
              <div key={t.varios} className="rounded-2xl bg-[#EAF3E6] px-4 py-3">
                <dd className="text-[24px] font-bold leading-none" style={{ color: PRIMARY }}>{t.n}</dd>
                <dt className="mt-1 text-[12px] font-semibold text-ink-600">{t.n === 1 ? t.uno : t.varios}</dt>
              </div>
            ))}
          </dl>
        )}

        {deps.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-[#EAF3E6] p-6 text-center">
            <MapPin size={28} className="mx-auto" style={{ color: PRIMARY }} aria-hidden />
            <p className="mt-2 text-[15px] font-semibold text-ink-700">
              {ubicaciones === null ? "No pudimos cargar los lugares disponibles." : "Estamos habilitando los primeros distritos."}
            </p>
            <p className="mt-1 text-[13px] text-ink-500">
              {ubicaciones === null ? "Intenta de nuevo en unos minutos." : "Cada lugar aparece cuando sus candidatos tienen su información cargada y revisada."}
            </p>
            <div className="mt-4"><PedirTuLugar /></div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
            {/* ── Selección de lugar ─────────────────────────────── */}
            <div className="space-y-4">
              <div>
                <label htmlFor="buscar-lugar" className="sr-only">Busca tu distrito</label>
                <div className="relative">
                  <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
                  <input
                    id="buscar-lugar"
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    placeholder="Escribe tu distrito, provincia o región"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-2xl border border-black/10 bg-[#F7FAF5] py-3.5 pl-11 pr-10 text-[15px] text-ink-800 shadow-inner
                               placeholder:text-ink-400 focus:border-[#2F7D4F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2F7D4F]/15"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Borrar búsqueda"
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                    >
                      <X size={16} aria-hidden />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-500">
                  {q ? `Resultados (${visibles.length})` : "Lugares disponibles"}
                </p>
                {visibles.length > 0 ? (
                  <ul className="space-y-2">
                    {visibles.map((l) => (
                      <LugarCard key={l.key} l={l} active={selKey === l.key} onPick={() => pickLugar(l)} />
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-2xl bg-[#F7FAF5] p-4 text-[14px] text-ink-500">
                    Aún no tenemos “{query}”. Estamos sumando distritos cada semana.
                  </p>
                )}
              </div>

              {/* Cascada completa, plegada: útil cuando haya muchos lugares */}
              <details className="group rounded-2xl ring-1 ring-black/10 open:bg-[#F7FAF5]">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[14px] font-semibold text-ink-700 [&::-webkit-details-marker]:hidden">
                  Buscar por departamento y provincia
                  <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-3 px-4 pb-4">
                  <div>
                    <label htmlFor="sel-dep" className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-ink-500">Departamento</label>
                    <select id="sel-dep" className={selectCls} value={depId ?? ""} onChange={(e) => pickDep(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Selecciona…</option>
                      {deps.map((d) => <option key={d.id} value={d.id}>{prettyPlace(d.nombre)} ({d.candidatos})</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sel-prov" className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-ink-500">Provincia</label>
                    <select id="sel-prov" className={selectCls} disabled={!dep} value={provId ?? ""} onChange={(e) => pickProv(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">{dep ? "Todas las provincias" : "Elige un departamento"}</option>
                      {dep?.provincias.map((p) => <option key={p.id} value={p.id}>{prettyPlace(p.nombre)} ({p.candidatos})</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sel-dist" className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-ink-500">Distrito</label>
                    <select id="sel-dist" className={selectCls} disabled={!prov || prov.distritos.length === 0} value={distId ?? ""} onChange={(e) => setDistId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">{prov ? "Todos los distritos" : "Elige una provincia"}</option>
                      {prov?.distritos.map((x) => <option key={x.id} value={x.id}>{prettyPlace(x.nombre)} ({x.candidatos})</option>)}
                    </select>
                  </div>
                </div>
              </details>

              <PedirTuLugar compact />
            </div>

            {/* ── Candidatos del lugar elegido ───────────────────── */}
            <div ref={resultsRef} aria-live="polite" className="scroll-mt-24">
              {!filtro ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl bg-[#F7FAF5] p-6 text-center ring-1 ring-[#2F7D4F]/10">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF3E6]" aria-hidden>
                    <MapPin size={26} style={{ color: PRIMARY }} />
                  </span>
                  <p className="text-[16px] font-bold text-ink-700">Elige tu distrito</p>
                  <p className="max-w-xs text-[14px] text-ink-500">Tócalo en la lista o escríbelo arriba y aquí verás quién postula.</p>
                </div>
              ) : loading ? (
                <ul className="space-y-3" aria-label="Cargando candidatos">
                  {[0, 1, 2].map((i) => <li key={i} className="h-24 animate-pulse rounded-2xl bg-[#EAF3E6]" />)}
                </ul>
              ) : failed ? (
                <p className="rounded-2xl bg-ink-100 p-6 text-center text-[14px] text-ink-500">No pudimos cargar los candidatos. Intenta de nuevo.</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>Paso 2 · Conócelos</p>
                    {!only && (
                      <button type="button" onClick={limpiar} className="text-[13px] font-semibold text-ink-500 underline-offset-2 hover:underline">
                        Cambiar lugar
                      </button>
                    )}
                  </div>
                  <h3 className="mb-3 text-[20px] font-bold leading-tight text-ink-800">
                    {delLugar.length} {delLugar.length === 1 ? "candidato" : "candidatos"} en {lugarLabel}
                  </h3>
                  {grupos.map((g) => (
                    <div key={g.nivel} className="mb-5 last:mb-0">
                      {grupos.length > 1 && (
                        <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-500">{NIVEL_TITULO[g.nivel]} · {g.items.length}</p>
                      )}
                      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {g.items.map((c) => <CandidatoCard key={c.id} c={c} />)}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
