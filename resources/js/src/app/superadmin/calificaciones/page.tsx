"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";
import { useSuperAdmin } from "@/context/SuperAdminContext";
import { superadminApi, ApiError, type FeedbackAdminItem, type FeedbackAdminList } from "@/lib/api";

/**
 * Calificaciones de PoliticOS en vivo (se actualiza sola cada 15 s).
 * Moderación: un comentario solo aparece en la home si aquí se marca "Mostrar".
 */

const REFRESH_MS = 15_000;

function Estrellas({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= n ? "fill-amber-400 text-amber-400" : "text-gray-300"} aria-hidden />
      ))}
    </span>
  );
}

const fmt = (d: string) => new Date(d.replace(" ", "T")).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });

function Item({ r, saKey, onChanged }: { r: FeedbackAdminItem; saKey: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<"pub" | "del" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tieneTexto = !!r.comment?.trim();

  async function togglePublicado() {
    setBusy("pub"); setErr(null);
    try { await superadminApi.feedback.setPublicado(saKey, r.id, !r.publicado); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo guardar."); }
    finally { setBusy(null); }
  }

  async function borrar() {
    if (!confirm("¿Borrar esta calificación? Deja de contar en el promedio. No se puede deshacer.")) return;
    setBusy("del"); setErr(null);
    try { await superadminApi.feedback.remove(saKey, r.id); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo borrar."); }
    finally { setBusy(null); }
  }

  return (
    <li className={`rounded-2xl border bg-white p-4 ${r.stars <= 2 ? "border-red-200" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Estrellas n={r.stars} />
        {r.publicado && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Visible en la home</span>}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{r.context === "home" ? "Inicio" : "Chat"}</span>
        {r.candidate_slug && <span className="text-[11px] text-gray-500">candidato: {r.candidate_slug}</span>}
        {r.tenant_slug && <span className="text-[11px] text-gray-400">tenant: {r.tenant_slug}</span>}
        <span className="ml-auto text-[11px] text-gray-400">{fmt(r.created_at)}</span>
      </div>
      {tieneTexto
        ? <p className="mt-2 whitespace-pre-wrap text-[15px] leading-snug text-gray-800">{r.comment}</p>
        : <p className="mt-2 text-xs italic text-gray-400">Sin comentario</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {tieneTexto && (
          <button type="button" onClick={togglePublicado} disabled={busy !== null}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
              r.publicado ? "border border-gray-300 text-gray-700 hover:bg-gray-50" : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}>
            {busy === "pub" ? <Loader2 size={14} className="animate-spin" /> : r.publicado ? <EyeOff size={14} /> : <Eye size={14} />}
            {r.publicado ? "Ocultar de la home" : "Mostrar en la home"}
          </button>
        )}
        <button type="button" onClick={borrar} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">
          {busy === "del" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Borrar
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </li>
  );
}

export default function SuperAdminCalificacionesPage() {
  const { saKey } = useSuperAdmin();
  const [stars, setStars] = useState<string>("");
  const [soloTexto, setSoloTexto] = useState(false);
  const [vista, setVista] = useState<"" | "1" | "0">("");
  const [cand, setCand] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FeedbackAdminList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const silent = useRef(false);

  const load = useCallback(async () => {
    if (!saKey) return;
    if (!silent.current) setLoading(true);
    setError(null);
    try {
      setData(await superadminApi.feedback.list(saKey, {
        stars: stars || undefined, con_comentario: soloTexto || undefined,
        publicado: vista === "" ? undefined : vista === "1", candidate_slug: cand || undefined, page,
      }));
      setUpdatedAt(new Date());
    } catch (e) { setError(e instanceof ApiError ? e.message : "No se pudo cargar."); }
    finally { setLoading(false); silent.current = false; }
  }, [saKey, stars, soloTexto, vista, cand, page]);

  useEffect(() => { load(); }, [load]);

  // En vivo: refresco silencioso cada 15 s (solo con la pestaña visible).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") { silent.current = true; load(); }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const res = data?.resumen;
  const maxDist = res ? Math.max(1, ...Object.values(res.distribucion)) : 1;
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { setPage(1); fn(v); };

  return (
    <div>
      <Link href="/superadmin" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
        <ArrowLeft size={14} /> Tenants
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Calificaciones de PoliticOS</h1>
          <p className="text-sm text-gray-500">
            Anónimas. Los comentarios solo salen en la home si los marcas como visibles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> En vivo
            {updatedAt && <span className="font-normal text-emerald-600">· {updatedAt.toLocaleTimeString("es-PE", { timeStyle: "short" })}</span>}
          </span>
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {res && (
        <div className="mt-5 grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_1.6fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Promedio</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{res.total ? res.average.toFixed(1) : "—"}</p>
            <Estrellas n={Math.round(res.average)} />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Calificaciones</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{res.total}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Últimos 7 días</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{res.ultimos_7_dias}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Con comentario</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{res.con_comentario}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = res.distribucion[String(n)] ?? 0;
              return (
                <button key={n} type="button" onClick={() => { setPage(1); setStars(stars === String(n) ? "" : String(n)); }}
                  className={`flex w-full items-center gap-2 rounded py-0.5 text-xs ${stars === String(n) ? "font-bold" : ""}`}
                  title={`Ver solo ${n}★`}>
                  <span className="w-6 text-right text-gray-600">{n}★</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className={`block h-full rounded-full ${n >= 4 ? "bg-emerald-500" : n === 3 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${(c / maxDist) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums text-gray-700">{c}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        <select value={stars} onChange={(e) => resetPage(setStars)(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2">
          <option value="">Todas las estrellas</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
        </select>
        <select value={vista} onChange={(e) => resetPage(setVista)(e.target.value as "" | "1" | "0")} className="rounded-lg border border-gray-300 bg-white px-3 py-2">
          <option value="">Visibles y ocultas</option>
          <option value="1">Solo visibles en la home</option>
          <option value="0">Solo ocultas</option>
        </select>
        {!!data?.candidatos.length && (
          <select value={cand} onChange={(e) => resetPage(setCand)(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2">
            <option value="">Todos los candidatos</option>
            {data.candidatos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
          <input type="checkbox" checked={soloTexto} onChange={(e) => resetPage(setSoloTexto)(e.target.checked)} /> Solo con comentario
        </label>
        {data && <span className="ml-auto text-xs text-gray-500">{data.total} resultados</span>}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading && !data ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Cargando…</p>
      ) : data && data.data.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-white p-6 text-center text-sm text-gray-500 ring-1 ring-gray-200">No hay calificaciones con estos filtros.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data?.data.map((r) => <Item key={r.id} r={r} saKey={saKey ?? ""} onChanged={load} />)}
        </ul>
      )}

      {data && data.last_page > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Anterior</button>
          <span className="text-gray-500">Página {page} de {data.last_page}</span>
          <button type="button" disabled={page >= data.last_page} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Siguiente</button>
        </div>
      )}
    </div>
  );
}
