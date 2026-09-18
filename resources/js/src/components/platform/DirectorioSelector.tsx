"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, MapPin, MessageCircle } from "lucide-react";
import {
  getCandidatos,
  prettyPlace,
  type CandidatoResumen,
  type DepartamentoDisp,
  type FiltroLugar,
  type Ubicaciones,
} from "@/lib/directorio";

/**
 * "Conoce a tus candidatos": selector en cascada que SOLO ofrece lugares que ya
 * tienen candidatos publicados con su base de conocimiento lista (la regla la
 * aplica el API; aquí no se filtra nada). Al elegir un lugar lista sus
 * candidatos y enlaza a la ficha de cada uno.
 *
 * `ubicaciones === null` significa que el API no respondió (distinto de "no hay
 * lugares habilitados todavía").
 */

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_PEDIDOS ?? "").replace(/\D/g, "");

const selectCls =
  "w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-[15px] text-ink-800 shadow-sm " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

function PedirTuLugar({ compact = false }: { compact?: boolean }) {
  if (!WHATSAPP) return null;
  const text = encodeURIComponent("Hola, quiero que carguen en PoliticOS a los candidatos de mi distrito: ");
  return (
    <a
      href={`https://wa.me/${WHATSAPP}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-black/15 bg-white font-bold text-ink-800 transition hover:bg-ink-100 ${
        compact ? "px-3.5 py-2 text-[13px]" : "px-5 py-3 text-[14px]"
      }`}
    >
      <MessageCircle size={compact ? 15 : 17} aria-hidden />
      ¿No ves tu distrito? Pide que lo carguemos
    </a>
  );
}

function CandidatoCard({ c }: { c: CandidatoResumen }) {
  return (
    <li className="min-w-0">
      <Link
        href={`/candidato/${c.slug}`}
        className="group flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:shadow-md motion-safe:hover:-translate-y-0.5
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {c.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-black/5" />
        ) : (
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-condensed text-[22px] text-white"
            style={{ background: "rgb(var(--brand-primary-rgb))" }}
            aria-hidden
          >
            {initials(c.name)}
          </span>
        )}
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
        <ArrowRight size={18} className="shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-600" aria-hidden />
      </Link>
    </li>
  );
}

export function DirectorioSelector({ ubicaciones }: { ubicaciones: Ubicaciones | null }) {
  const deps: DepartamentoDisp[] = ubicaciones?.departamentos ?? [];

  const [depId, setDepId]   = useState<number | null>(null);
  const [provId, setProvId] = useState<number | null>(null);
  const [distId, setDistId] = useState<number | null>(null);

  const [candidatos, setCandidatos] = useState<CandidatoResumen[] | null>(null);
  const [loading, setLoading]       = useState(false);
  const [failed, setFailed]         = useState(false);

  const dep   = useMemo(() => deps.find((d) => d.id === depId) ?? null, [deps, depId]);
  const prov  = useMemo(() => dep?.provincias.find((p) => p.id === provId) ?? null, [dep, provId]);

  // Atajos "disponibles ahora": todos los distritos habilitados, aplanados.
  const atajos = useMemo(
    () => deps.flatMap((d) => d.provincias.flatMap((p) => p.distritos.map((x) => ({ dep: d, prov: p, dist: x })))),
    [deps],
  );

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
    dep?.nombre,
    prov && (dep?.provincias.length ?? 0) > 1 ? prov.nombre : null,
    distId ? prov?.distritos.find((x) => x.id === distId)?.nombre : null,
  ].filter((n): n is string => !!n).map(prettyPlace).join(" · ");

  return (
    <section id="directorio" className="mx-auto max-w-6xl px-5 pb-10" aria-labelledby="directorio-title">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="directorio-title" className="text-[clamp(24px,3vw,34px)] font-bold leading-tight text-ink-800">
              Conoce a tus candidatos
            </h2>
            <p className="mt-1 text-[14px] text-ink-500">
              Los candidatos cambian según dónde votas. Solo mostramos lugares con información verificada y lista para consultar.
            </p>
          </div>
          {ubicaciones && ubicaciones.total_distritos > 0 && (
            <p className="rounded-full bg-ink-100 px-3 py-1.5 text-[12px] font-semibold text-ink-500">
              {ubicaciones.total_candidatos} {ubicaciones.total_candidatos === 1 ? "candidato" : "candidatos"} en {ubicaciones.total_distritos}{" "}
              {ubicaciones.total_distritos === 1 ? "distrito" : "distritos"}
            </p>
          )}
        </div>

        {deps.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-ink-100 p-6 text-center">
            <MapPin size={28} className="mx-auto text-ink-400" aria-hidden />
            <p className="mt-2 text-[15px] font-semibold text-ink-700">
              {ubicaciones === null ? "No pudimos cargar los lugares disponibles." : "Estamos habilitando los primeros distritos."}
            </p>
            <p className="mt-1 text-[13px] text-ink-500">
              {ubicaciones === null ? "Intenta de nuevo en unos minutos." : "Cada lugar aparece cuando sus candidatos tienen su información cargada y revisada."}
            </p>
            <div className="mt-4"><PedirTuLugar /></div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
            {/* Selección de lugar */}
            <div className="space-y-3">
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

              <div className="pt-2">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-500">Disponibles ahora</p>
                <div className="flex flex-wrap gap-2">
                  {atajos.slice(0, 8).map(({ dep: d, prov: p, dist: x }) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => { setDepId(d.id); setProvId(p.id); setDistId(x.id); }}
                      aria-pressed={distId === x.id}
                      className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1 transition ${
                        distId === x.id ? "text-white ring-transparent" : "bg-white text-ink-700 ring-black/10 hover:bg-ink-100"
                      }`}
                      style={distId === x.id ? { background: "rgb(var(--brand-primary-rgb))" } : undefined}
                    >
                      {prettyPlace(x.nombre)} · {x.candidatos}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2"><PedirTuLugar compact /></div>
            </div>

            {/* Candidatos del lugar elegido */}
            <div aria-live="polite">
              {!filtro ? (
                <div className="flex h-full min-h-[180px] items-center justify-center rounded-2xl border-2 border-dashed border-black/10 p-6 text-center text-[14px] text-ink-400">
                  Elige un lugar para ver a sus candidatos.
                </div>
              ) : loading ? (
                <div className="flex h-full min-h-[180px] items-center justify-center text-[14px] text-ink-400">Cargando candidatos…</div>
              ) : failed ? (
                <p className="rounded-2xl bg-ink-100 p-6 text-center text-[14px] text-ink-500">No pudimos cargar los candidatos. Intenta de nuevo.</p>
              ) : (
                <>
                  <p className="mb-3 text-[13px] font-semibold text-ink-500">
                    {lugarLabel}: {candidatos?.length ?? 0} {candidatos?.length === 1 ? "candidato" : "candidatos"}
                  </p>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
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
