"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, MapPin, MessageCircle, MessagesSquare, Search, X } from "lucide-react";
import { PartySymbol } from "@/components/ui/PartySymbol";
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

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** "Cajamarca" == "cajamarca", "Chepén" == "chepen". */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface Lugar { dep: DepartamentoDisp; prov: ProvinciaDisp; dist: DistritoDisp; haystack: string }

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
          <span className="block truncate text-[15px] font-bold leading-snug">{prettyPlace(l.dist.nombre)}</span>
          <span className={`block truncate text-[12px] ${active ? "text-white/80" : "text-ink-500"}`}>
            {prettyPlace(l.prov.nombre)} · {prettyPlace(l.dep.nombre)}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${active ? "bg-white" : "text-white"}`}
          style={active ? { color: PRIMARY } : { background: PRIMARY }}
        >
          {l.dist.candidatos}
        </span>
      </button>
    </li>
  );
}

/** La home solo lleva al chat: tocar un candidato abre la conversación sobre él. */
function chatHref(slug: string): string {
  const p = new URLSearchParams();
  if (DIRECTORY_TENANT) p.set("tenant", DIRECTORY_TENANT);
  p.set("candidato", slug);
  return `/chat?${p.toString()}`;
}

function CandidatoCard({ c }: { c: CandidatoResumen }) {
  return (
    <li className="min-w-0">
      <Link
        href={chatHref(c.slug)}
        aria-label={`Preguntar a la IA sobre ${c.name}`}
        className="group flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:ring-[#2F7D4F]/30 motion-safe:hover:-translate-y-0.5
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="relative shrink-0">
          {c.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.photo_url} alt="" loading="lazy" className="h-16 w-16 rounded-full object-cover ring-2 ring-[#2F7D4F]/20" />
          ) : (
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full font-condensed text-[22px] text-white"
              style={{ background: PRIMARY }}
              aria-hidden
            >
              {initials(c.name)}
            </span>
          )}
          {/* El símbolo del partido: así lo reconoce la mayoría en la cédula */}
          <PartySymbol src={c.logo_url} party={c.party} size={30} className="absolute -bottom-1 -right-2" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold leading-snug text-ink-800">{c.name}</span>
          <span className="block text-[13px] leading-snug text-ink-500">{c.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-400">
            <span className="truncate">{c.party}{c.list_number ? ` · N.º ${c.list_number}` : ""}</span>
            <span className="inline-flex items-center gap-1">
              <FileText size={12} aria-hidden />
              {c.documentos_count} {c.documentos_count === 1 ? "documento" : "documentos"}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-center gap-0.5 text-[10px] font-bold text-ink-400 transition group-hover:text-[#2F7D4F]">
          <MessagesSquare size={18} aria-hidden />
          Preguntar
        </span>
      </Link>
    </li>
  );
}

export function DirectorioSelector({ ubicaciones }: { ubicaciones: Ubicaciones | null }) {
  const deps: DepartamentoDisp[] = useMemo(() => ubicaciones?.departamentos ?? [], [ubicaciones]);

  // Todos los distritos habilitados, aplanados y con texto normalizado para buscar.
  const lugares: Lugar[] = useMemo(
    () =>
      deps.flatMap((dep) =>
        dep.provincias.flatMap((prov) =>
          prov.distritos.map((dist) => ({
            dep, prov, dist,
            haystack: norm(`${dist.nombre} ${prov.nombre} ${dep.nombre}`),
          })),
        ),
      ),
    [deps],
  );

  // Un solo distrito habilitado → preseleccionado (evita el panel vacío).
  const only = lugares.length === 1 ? lugares[0] : null;
  const [depId, setDepId]   = useState<number | null>(only?.dep.id ?? null);
  const [provId, setProvId] = useState<number | null>(only?.prov.id ?? null);
  const [distId, setDistId] = useState<number | null>(only?.dist.id ?? null);
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
    setDepId(l.dep.id); setProvId(l.prov.id); setDistId(l.dist.id);
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

  const lugarLabel = [
    distId ? prov?.distritos.find((x) => x.id === distId)?.nombre : null,
    prov && (dep?.provincias.length ?? 0) > 1 && !distId ? prov.nombre : null,
    dep?.nombre,
  ].filter((n): n is string => !!n).map(prettyPlace).join(", ");

  return (
    <section id="directorio" className="mx-auto max-w-6xl px-5 pb-10" aria-labelledby="directorio-title">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#2F7D4F]/10 sm:p-8">
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
          {ubicaciones && ubicaciones.total_distritos > 0 && (
            <p className="rounded-full bg-[#EAF3E6] px-3 py-1.5 text-[12px] font-semibold" style={{ color: PRIMARY }}>
              {ubicaciones.total_candidatos} {ubicaciones.total_candidatos === 1 ? "candidato" : "candidatos"} en {ubicaciones.total_distritos}{" "}
              {ubicaciones.total_distritos === 1 ? "distrito" : "distritos"}
            </p>
          )}
        </div>

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
                      <LugarCard key={l.dist.id} l={l} active={distId === l.dist.id} onPick={() => pickLugar(l)} />
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
                    <select id="sel-dist" className={selectCls} disabled={!prov} value={distId ?? ""} onChange={(e) => setDistId(e.target.value ? Number(e.target.value) : null)}>
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
                    {candidatos?.length ?? 0} {candidatos?.length === 1 ? "candidato" : "candidatos"} en {lugarLabel}
                  </h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {candidatos?.map((c) => <CandidatoCard key={c.id} c={c} />)}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
