"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useSuperAdmin } from "@/context/SuperAdminContext";
import {
  superadminApi, ApiError,
  type PrivacyRequestItem, type PrivacyRequestList, type PrivacyRequestStatus, type PrivacyRequestType,
} from "@/lib/api";

/**
 * Solicitudes ARCO y reclamos (Ley 29733). Lo pendiente sale primero, ordenado
 * por vencimiento del plazo legal. Desde aquí se responde, se cambia el estado y
 * se ejecuta el borrado en la BD del tenant de origen.
 */

const TYPE_LABEL: Record<PrivacyRequestType, string> = {
  acceso: "Acceso", rectificacion: "Rectificación", cancelacion: "Cancelación (borrar)",
  oposicion: "Oposición", reclamo: "Reclamo",
};

const STATUS: { value: PrivacyRequestStatus; label: string; cls: string }[] = [
  { value: "recibida",   label: "Recibida",   cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  { value: "en_proceso", label: "En proceso", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  { value: "atendida",   label: "Atendida",   cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { value: "rechazada",  label: "Rechazada",  cls: "bg-gray-100 text-gray-600 ring-gray-200" },
];

const statusMeta = (s: PrivacyRequestStatus) => STATUS.find((x) => x.value === s) ?? STATUS[0];
const isOpen = (r: PrivacyRequestItem) => r.status === "recibida" || r.status === "en_proceso";
const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("es-PE") : "—");

function daysLeft(due: string | null): number | null {
  if (!due) return null;
  const ms = new Date(`${due}T23:59:59`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function RequestCard({ r, onChanged, saKey }: { r: PrivacyRequestItem; onChanged: () => void; saKey: string }) {
  const [note, setNote]     = useState(r.resolution_note ?? "");
  const [status, setStatus] = useState<PrivacyRequestStatus>(r.status);
  const [busy, setBusy]     = useState<"save" | "erase" | null>(null);
  const [err, setErr]       = useState<string | null>(null);
  const left = daysLeft(r.due_at);

  async function save() {
    setBusy("save"); setErr(null);
    try { await superadminApi.privacy.update(saKey, r.id, { status, resolution_note: note || null }); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo guardar."); }
    finally { setBusy(null); }
  }

  async function erase() {
    if (!confirm(`Borrar en "${r.tenant_slug ?? "default"}" todos los datos ligados a este dispositivo y/o contacto. No se puede deshacer. Verificaste la identidad del solicitante?`)) return;
    setBusy("erase"); setErr(null);
    try { await superadminApi.privacy.erase(saKey, r.id); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo borrar."); }
    finally { setBusy(null); }
  }

  const meta = statusMeta(r.status);

  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-gray-900">{r.code}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${meta.cls}`}>{meta.label}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">{TYPE_LABEL[r.type]}</span>
        {r.tenant_slug && <span className="text-[11px] text-gray-400">tenant: {r.tenant_slug}</span>}
        {r.erased_automatically && <span className="text-[11px] font-semibold text-emerald-700">borrado automático</span>}
        <span className="ml-auto text-[11px] text-gray-500">
          Recibida {fmtDate(r.created_at)} · Plazo {fmtDate(r.due_at)}
          {isOpen(r) && left !== null && (
            <strong className={`ml-1.5 ${left < 0 ? "text-red-600" : left <= 3 ? "text-amber-600" : "text-gray-700"}`}>
              {left < 0 ? `vencida hace ${-left} d` : `quedan ${left} d`}
            </strong>
          )}
        </span>
      </div>

      <div className="mt-2 grid gap-1 text-sm text-gray-700 sm:grid-cols-3">
        <p><span className="text-gray-400">Nombre:</span> {r.name || "—"}</p>
        <p><span className="text-gray-400">Correo:</span> {r.email || "—"}</p>
        <p><span className="text-gray-400">WhatsApp:</span> {r.phone || "—"}</p>
      </div>
      {r.description && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{r.description}</p>}
      {r.erased_counts && (
        <p className="mt-2 text-[11px] text-gray-500">
          Borrado: {Object.entries(r.erased_counts).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(" · ") || "no había datos"}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
        <select value={status} onChange={(e) => setStatus(e.target.value as PrivacyRequestStatus)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000}
          placeholder="Respuesta / acciones tomadas (queda como constancia)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <div className="flex gap-2 sm:flex-col">
          <button type="button" onClick={save} disabled={busy !== null}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
            {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Guardar
          </button>
          {(r.visitor_uuid || r.email || r.phone) && (
            <button type="button" onClick={erase} disabled={busy !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">
              {busy === "erase" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Borrar datos
            </button>
          )}
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </li>
  );
}

export default function SuperAdminPrivacidadPage() {
  const { saKey } = useSuperAdmin();
  const [status, setStatus] = useState<string>("");
  const [type, setType]     = useState<string>("");
  const [q, setQ]           = useState("");
  const [data, setData]     = useState<PrivacyRequestList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!saKey) return;
    setLoading(true); setError(null);
    try { setData(await superadminApi.privacy.list(saKey, { status, type, q: q.trim() })); }
    catch (e) { setError(e instanceof ApiError ? e.message : "No se pudo cargar."); }
    finally { setLoading(false); }
  }, [saKey, status, type, q]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [saKey, status, type]);

  const pendientes = (data?.counts.recibida ?? 0) + (data?.counts.en_proceso ?? 0);

  return (
    <div>
      <Link href="/superadmin" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
        <ArrowLeft size={14} /> Tenants
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Privacidad · Solicitudes ARCO</h1>
          <p className="text-sm text-gray-500">Ley 29733: acceso 20 días hábiles; rectificación, cancelación y oposición 10.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">{pendientes} pendientes</span>
        {(data?.overdue ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700 ring-1 ring-red-200">
            <AlertTriangle size={12} /> {data?.overdue} vencidas
          </span>
        )}
        <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">{data?.counts.atendida ?? 0} atendidas</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">Todos los estados</option>
          {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, nombre, correo…"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white">Buscar</button>
        </form>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && !data && <p className="mt-6 text-sm text-gray-500">Cargando…</p>}
      {data && data.data.length === 0 && <p className="mt-6 text-sm text-gray-500">No hay solicitudes con estos filtros.</p>}

      <ul className="mt-4 space-y-3">
        {data?.data.map((r) => <RequestCard key={`${r.id}-${r.status}-${r.resolved_at}`} r={r} onChanged={load} saKey={saKey!} />)}
      </ul>
    </div>
  );
}
