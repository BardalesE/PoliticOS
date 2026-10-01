"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, BadgeCheck, ChevronDown, ExternalLink, FileText, Loader2, MapPin, Pencil, Search, Trash2, X,
} from "lucide-react";
import { directorioAdmin, prettyPlace, type AdminCandidato, type QaEstadoGlobal } from "@/lib/directorio";
import { cn } from "@/lib/utils";
import { DocumentosPanel } from "./DocumentosPanel";
import { RegidoresPanel } from "./RegidoresPanel";
import { ControlCalidadPanel } from "./ControlCalidadPanel";

/**
 * Tabla del directorio agrupada por Departamento › Provincia › Distrito.
 * Una sola maqueta: en pantallas md+ cada fila es una grilla de columnas
 * (tabla); en móvil la misma fila se apila como tarjeta.
 */

type Estado = "todos" | "visibles" | "borradores" | "problemas";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-gray-50 disabled:text-gray-400";

// Columnas de la "tabla" (md+). Header y filas comparten la misma plantilla.
const COLS = "md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_8.5rem_6rem_10.5rem] md:items-center md:gap-4";

function estadoDe(c: AdminCandidato) {
  if (c.visible) return { t: "Visible", largo: "Publicado y visible", cls: "bg-green-50 text-green-700 ring-green-200" };
  if (c.estado_publicacion === "publicado") {
    return {
      t: "Oculto",
      largo: !c.departamento_id ? "Publicado, pero oculto: falta ubicación" : "Publicado, pero oculto: falta un documento listo",
      cls: "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }
  return { t: "Borrador", largo: "Borrador: aún no se ve en la web", cls: "bg-gray-50 text-gray-600 ring-gray-200" };
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Avatar({ c }: { c: AdminCandidato }) {
  return (
    <span className="relative shrink-0">
      {c.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.photo_url} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
          {c.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
        </span>
      )}
      {c.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.logo_url} alt="" className="absolute -bottom-1 -right-1.5 h-5 w-5 rounded bg-white object-contain p-px ring-1 ring-gray-200" />
      )}
    </span>
  );
}

/** Punto de color del último control de calidad (gris = nunca corrido). */
function QaPunto({ estado }: { estado: QaEstadoGlobal | null }) {
  const cls = estado === "aprobado" ? "bg-green-500" : estado === "fallas" ? "bg-red-500" : estado === "incompleto" ? "bg-amber-400" : "bg-gray-300";
  const txt = estado === "aprobado" ? "Control de calidad aprobado" : estado === "fallas" ? "Control de calidad con fallas"
    : estado === "incompleto" ? "Control de calidad incompleto" : "Sin control de calidad";
  return <span className={cn("ml-1 inline-block h-2 w-2 rounded-full align-middle", cls)} title={txt} aria-label={txt} />;
}

/** Detalle expandido de una fila: documentos del candidato o su lista de regidores. */
function PanelCandidato({ candidato, token, onChanged }: { candidato: AdminCandidato; token: string; onChanged: () => void }) {
  const [tab, setTab] = useState<"docs" | "regidores" | "calidad">("docs");
  const nReg = candidato.regidores?.length ?? 0;
  const tabCls = (on: boolean) =>
    cn("rounded-lg px-3 py-1.5 text-xs font-bold", on ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-800");
  return (
    <div className="space-y-2">
      <div className="inline-flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "docs"} className={tabCls(tab === "docs")} onClick={() => setTab("docs")}>
          Documentos
        </button>
        <button type="button" role="tab" aria-selected={tab === "regidores"} className={tabCls(tab === "regidores")} onClick={() => setTab("regidores")}>
          Regidores{nReg > 0 ? ` (${nReg})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "calidad"} className={tabCls(tab === "calidad")} onClick={() => setTab("calidad")}>
          Calidad <QaPunto estado={candidato.qa_estado ?? null} />
        </button>
      </div>
      {tab === "docs" && <DocumentosPanel candidato={candidato} token={token} onChanged={onChanged} />}
      {tab === "regidores" && <RegidoresPanel candidato={candidato} token={token} onChanged={onChanged} />}
      {tab === "calidad" && <ControlCalidadPanel candidato={candidato} token={token} onChanged={onChanged} />}
    </div>
  );
}

export function CandidatosTabla({
  rows, loading, token, onEdit, onChanged, act, openId, setOpenId,
}: {
  rows: AdminCandidato[];
  loading: boolean;
  token: string | null;
  onEdit: (c: AdminCandidato) => void;
  onChanged: () => void;
  act: (fn: () => Promise<unknown>, okText?: string) => void;
  openId: number | null;
  setOpenId: (id: number | null) => void;
}) {
  const [q, setQ] = useState("");
  const [dep, setDep] = useState("");
  const [prov, setProv] = useState("");
  const [dist, setDist] = useState("");
  const [estado, setEstado] = useState<Estado>("todos");

  // Opciones de filtro: solo lugares que tienen candidatos cargados.
  const deps  = useMemo(() => [...new Set(rows.map((r) => r.departamento).filter(Boolean) as string[])], [rows]);
  const provs = useMemo(
    () => [...new Set(rows.filter((r) => !dep || r.departamento === dep).map((r) => r.provincia).filter(Boolean) as string[])],
    [rows, dep],
  );
  const dists = useMemo(
    () => [...new Set(rows
      .filter((r) => (!dep || r.departamento === dep) && (!prov || r.provincia === prov))
      .map((r) => r.distrito).filter(Boolean) as string[])],
    [rows, dep, prov],
  );

  const filtradas = useMemo(() => {
    const needle = sinTildes(q.trim());
    return rows.filter((r) => {
      if (dep && r.departamento !== dep) return false;
      if (prov && r.provincia !== prov) return false;
      if (dist && r.distrito !== dist) return false;
      if (estado === "visibles" && !r.visible) return false;
      if (estado === "borradores" && r.estado_publicacion !== "borrador") return false;
      if (estado === "problemas" && !(r.documentos_fallidos > 0 || (r.estado_publicacion === "publicado" && !r.visible))) return false;
      if (needle && !sinTildes(`${r.name} ${r.party} ${r.title}`).includes(needle)) return false;
      return true;
    });
  }, [rows, q, dep, prov, dist, estado]);

  // El API ya viene ordenado por lugar: agrupar preservando ese orden.
  const grupos = useMemo(() => {
    const out: { key: string; dep: string | null; prov: string | null; dist: string | null; items: AdminCandidato[] }[] = [];
    for (const r of filtradas) {
      const key = !r.departamento ? "sin-lugar" : `${r.departamento}|${r.provincia ?? ""}|${r.distrito ?? ""}`;
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(r);
      else out.push({ key, dep: r.departamento, prov: r.provincia, dist: r.distrito, items: [r] });
    }
    return out;
  }, [filtradas]);

  const hayFiltros = q || dep || prov || dist || estado !== "todos";
  const limpiar = () => { setQ(""); setDep(""); setProv(""); setDist(""); setEstado("todos"); };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {/* Encabezado + filtros */}
      <div className="space-y-3 border-b border-gray-100 bg-gray-50/70 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Candidatos ({rows.length}) · visibles: {rows.filter((r) => r.visible).length}
          </p>
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800">
              <X size={12} /> Limpiar filtros ({filtradas.length} de {rows.length})
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <label className="relative col-span-2 lg:col-span-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              className={cn(selectCls, "pl-8")} placeholder="Buscar candidato o partido…" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Buscar candidato o partido"
            />
          </label>
          <select className={selectCls} value={dep} aria-label="Filtrar por departamento"
            onChange={(e) => { setDep(e.target.value); setProv(""); setDist(""); }}>
            <option value="">Departamento</option>
            {deps.map((d) => <option key={d} value={d}>{prettyPlace(d)}</option>)}
          </select>
          <select className={selectCls} value={prov} aria-label="Filtrar por provincia"
            onChange={(e) => { setProv(e.target.value); setDist(""); }}>
            <option value="">Provincia</option>
            {provs.map((p) => <option key={p} value={p}>{prettyPlace(p)}</option>)}
          </select>
          <select className={selectCls} value={dist} aria-label="Filtrar por distrito" onChange={(e) => setDist(e.target.value)}>
            <option value="">Distrito</option>
            {dists.map((d) => <option key={d} value={d}>{prettyPlace(d)}</option>)}
          </select>
          <select className={selectCls} value={estado} aria-label="Filtrar por estado" onChange={(e) => setEstado(e.target.value as Estado)}>
            <option value="todos">Todos los estados</option>
            <option value="visibles">Visibles</option>
            <option value="borradores">Borradores</option>
            <option value="problemas">Con problemas</option>
          </select>
        </div>
      </div>

      {/* Cabecera de columnas (solo md+) */}
      <div className={cn("hidden border-b border-gray-100 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400", COLS)}>
        <span>Candidato</span><span>Partido</span><span>Documentos</span><span>Estado</span><span className="text-right">Acciones</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-brand-400" /></div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-14 text-center text-sm text-gray-400">Aún no hay candidatos. Crea el primero con “Nuevo candidato”.</p>
      ) : grupos.length === 0 ? (
        <p className="px-5 py-14 text-center text-sm text-gray-400">Ningún candidato coincide con los filtros.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.key} aria-label={g.dist ? prettyPlace(g.dist) : g.prov ? `Provincia de ${prettyPlace(g.prov)}` : g.dep ? `Región ${prettyPlace(g.dep)}` : "Sin ubicación"}>
            <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-x-2 gap-y-0.5 border-y border-gray-100 bg-white/95 px-4 py-2 backdrop-blur">
              <MapPin size={13} className="text-brand-500" aria-hidden />
              {g.dist ? (
                <p className="text-xs text-gray-500">
                  {prettyPlace(g.dep ?? "")} › {prettyPlace(g.prov ?? "")} › <span className="font-bold text-gray-900">{prettyPlace(g.dist)}</span>
                </p>
              ) : g.prov ? (
                <p className="text-xs text-gray-500">
                  {prettyPlace(g.dep ?? "")} › <span className="font-bold text-gray-900">Provincia de {prettyPlace(g.prov)}</span>
                </p>
              ) : g.dep ? (
                <p className="text-xs font-bold text-gray-900">Región {prettyPlace(g.dep)} <span className="font-normal text-gray-500">· cargos regionales</span></p>
              ) : (
                <p className="text-xs font-bold text-amber-700">Sin ubicación asignada</p>
              )}
              <span className="text-[11px] text-gray-400">
                · {g.items.length} {g.items.length === 1 ? "candidato" : "candidatos"} · {g.items.filter((c) => c.visible).length} visibles
              </span>
            </div>

            <ul className="divide-y divide-gray-100">
              {g.items.map((c) => {
                const e = estadoDe(c);
                const abierto = openId === c.id;
                return (
                  <Fragment key={c.id}>
                    <li className={cn("px-4 py-3", COLS, abierto && "bg-brand-500/5")}>
                      {/* Candidato */}
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar c={c} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 text-sm font-bold text-gray-900">
                            <span className="truncate">{c.name}</span>
                            {c.tipo_cuenta === "cliente_pago" && (
                              <BadgeCheck size={14} className="shrink-0 text-brand-500" aria-label="Perfil completado" />
                            )}
                            {(c.tipo_cuenta === "cliente_pago" || c.qa_estado) && <QaPunto estado={c.qa_estado ?? null} />}
                          </p>
                          <p className="truncate text-xs text-gray-500">{c.title}</p>
                        </div>
                      </div>

                      {/* Partido */}
                      <p className="mt-2 truncate text-xs text-gray-600 md:mt-0" title={c.party}>
                        <span className="font-semibold text-gray-400 md:hidden">Partido: </span>
                        {c.party}{c.list_number ? ` · N.º ${c.list_number}` : ""}
                      </p>

                      {/* Documentos */}
                      <button
                        type="button" onClick={() => setOpenId(abierto ? null : c.id)} aria-expanded={abierto}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-lg text-left text-xs text-gray-700 hover:text-brand-600 md:mt-0"
                      >
                        <FileText size={13} className="shrink-0 text-gray-400" aria-hidden />
                        <span><b>{c.documentos_listos}</b>/{c.documentos_total} listos</span>
                        {c.documentos_procesando > 0 && <Loader2 size={11} className="animate-spin text-brand-500" aria-label="procesando" />}
                        {c.documentos_fallidos > 0 && <AlertCircle size={12} className="text-red-600" aria-label={`${c.documentos_fallidos} fallido(s)`} />}
                        <ChevronDown size={13} className={cn("transition-transform", abierto && "rotate-180")} aria-hidden />
                      </button>

                      {/* Estado */}
                      <div className="mt-2 md:mt-0">
                        <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1", e.cls)} title={e.largo}>
                          {e.t}
                        </span>
                      </div>

                      {/* Acciones */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold md:mt-0 md:flex-nowrap md:justify-end">
                        {c.estado_publicacion === "publicado" ? (
                          <button type="button" onClick={() => token && act(() => directorioAdmin.unpublish(token, c.id), "Quitado de la web.")}
                            className="rounded-lg bg-gray-100 px-3 py-1.5 hover:bg-gray-200">Quitar</button>
                        ) : (
                          <button type="button" onClick={() => token && act(() => directorioAdmin.publish(token, c.id), "Publicado.")}
                            className="rounded-lg bg-brand-500 px-3 py-1.5 text-white">Publicar</button>
                        )}
                        <button type="button" onClick={() => onEdit(c)} className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200" aria-label={`Editar ${c.name}`} title="Editar">
                          <Pencil size={13} />
                        </button>
                        {c.visible && c.slug && (
                          <Link href={`/candidato/${c.slug}`} target="_blank" className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200" aria-label={`Ver ficha de ${c.name}`} title="Ver ficha">
                            <ExternalLink size={13} />
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => token && confirm(`¿Eliminar a ${c.name}? Sus documentos se conservan sin candidato asignado.`) && act(() => directorioAdmin.remove(token, c.id), "Candidato eliminado.")}
                          className="ml-auto rounded-lg p-2 text-red-600 hover:bg-red-50 md:ml-0" aria-label={`Eliminar ${c.name}`} title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                    {abierto && token && (
                      <li className="bg-brand-500/5 px-4 pb-4">
                        <PanelCandidato candidato={c} token={token} onChanged={onChanged} />
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
