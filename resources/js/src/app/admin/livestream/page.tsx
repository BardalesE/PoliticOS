"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Radio, Plus, Trash2, Pencil, Loader2,
  Clock, Users, Video, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { BroadcastStudio } from "@/components/live/BroadcastStudio";
import { normalizeApiBase, tenantHeaders } from "@/lib/api";

const API = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

interface LiveStream {
  id: number;
  title: string;
  description?: string;
  status: "idle" | "live" | "ended";
  stream_key: string;
  thumbnail?: string;
  started_at?: string;
  ended_at?: string;
  peak_viewers: number;
  current_viewers: number;
  chunk_count: number;
  scheduled_at?: string;
  created_at: string;
}

const statusLabels: Record<string, { label: string; cls: string }> = {
  idle:  { label: "Programado",  cls: "bg-gray-100 text-gray-700" },
  live:  { label: "EN VIVO",     cls: "bg-red-100 text-red-700 font-bold" },
  ended: { label: "Finalizado",  cls: "bg-emerald-100 text-emerald-700" },
};


export default function LivestreamPage() {
  const { token } = useAuth();

  const [streams, setStreams]           = useState<LiveStream[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<LiveStream | null>(null);
  const [broadcastTarget, setBroadcastTarget] = useState<LiveStream | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LiveStream | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const [form, setForm] = useState({ title: "", description: "", scheduled_at: "" });

  // Sin X-Tenant, ResolveTenant resuelve a otra BD y el Bearer token de Sanctum
  // (que vive en la BD del tenant) no se encuentra ahí → 401 disfrazado de
  // "Error al guardar." genérico. Ver informe de QA (deuda ya documentada en
  // REPORTE-fase-envivo.md).
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...tenantHeaders(),
  };

  // ── Fetch ─────────────────────────────────────────────────────────────
  const fetch$ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/livestreams`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Antes un 401/403 se tragaba en silencio (Array.isArray(data)?data:[])
        // y la página se veía vacía ("Crea la primera"), ocultando que en
        // realidad no cargó por falta de permiso/tenant.
        throw new Error(data?.message || `Error al cargar transmisiones (HTTP ${res.status}).`);
      }
      setStreams(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar transmisiones.");
    }
    finally { setLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch$(); }, [fetch$]);

  // ── Open form ────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm({ title: "", description: "", scheduled_at: "" });
    setShowForm(true);
  };
  const openEdit = (s: LiveStream) => {
    setEditTarget(s);
    setForm({
      title:        s.title,
      description:  s.description ?? "",
      scheduled_at: s.scheduled_at ? s.scheduled_at.slice(0, 16) : "",
    });
    setShowForm(true);
  };

  // ── Save ─────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const url    = editTarget ? `${API}/admin/livestreams/${editTarget.id}` : `${API}/admin/livestreams`;
      const method = editTarget ? "PUT" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(form) });
      if (!res.ok) {
        // Mostrar el mensaje real del backend (ej. "no tienes este feature en
        // tu plan") en vez del genérico "Error al guardar." que ocultaba la
        // causa real (401 por tenant, 403 por gate de plan, 422 de validación).
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Error al guardar (HTTP ${res.status}).`);
      }
      setShowForm(false);
      await fetch$();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally { setSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/admin/livestreams/${deleteTarget.id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Error al eliminar (HTTP ${res.status}).`);
      }
      setDeleteTarget(null);
      await fetch$();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al eliminar.");
    }
    finally { setDeleting(false); }
  };

  // ── Start / Stop ──────────────────────────────────────────────────────
  const startStream = async (s: LiveStream) => {
    setBroadcastTarget({ ...s, status: "live" });
  };

  const onBroadcastStatusChange = async (status: "live" | "ended") => {
    if (status === "ended") {
      setBroadcastTarget(null);
    }
    await fetch$();
  };

  // ── Viewer link ───────────────────────────────────────────────────────
  const viewerUrl = (key: string) => `${window.location.origin}/en-vivo/${key}`;

  const liveStreams  = streams.filter(s => s.status === "live");
  const otherStreams = streams.filter(s => s.status !== "live");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Transmisiones en vivo"
        subtitle="En vivo"
      >
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={16} />
          Nueva transmisión
        </button>
      </PageHeader>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 text-xs">Cerrar</button>
        </div>
      )}

      {/* Broadcast Studio */}
      {broadcastTarget && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Radio size={16} className="text-red-600" />
              Estudio de transmisión — {broadcastTarget.title}
            </h2>
            <a
              href={viewerUrl(broadcastTarget.stream_key)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              Ver como espectador →
            </a>
          </div>
          <BroadcastStudio
            streamKey={broadcastTarget.stream_key}
            streamId={broadcastTarget.id}
            token={token!}
            apiUrl={API}
            onStatusChange={onBroadcastStatusChange}
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      )}

      {!loading && streams.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Video size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay transmisiones. Crea la primera.</p>
        </div>
      )}

      {/* Live now */}
      {liveStreams.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-red-600 mb-3">Ahora en vivo</h3>
          <div className="space-y-3">
            {liveStreams.map(s => <StreamRow key={s.id} s={s} onEdit={openEdit} onDelete={setDeleteTarget} onBroadcast={startStream} viewerUrl={viewerUrl} isBroadcasting={broadcastTarget?.id === s.id} />)}
          </div>
        </section>
      )}

      {/* All other streams */}
      {otherStreams.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-3">Transmisiones</h3>
          <div className="space-y-3">
            {otherStreams.map(s => <StreamRow key={s.id} s={s} onEdit={openEdit} onDelete={setDeleteTarget} onBroadcast={startStream} viewerUrl={viewerUrl} isBroadcasting={broadcastTarget?.id === s.id} />)}
          </div>
        </section>
      )}

      {/* Form modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editTarget ? "Editar transmisión" : "Nueva transmisión"}
        size="md"
      >
        <div className="space-y-4">
          <FormField
            label="Título"
            as="input"
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ej: Debate vecinal San Miguel"
          />
          <FormField
            label="Descripción (opcional)"
            as="textarea"
            rows={3}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Descripción del evento..."
          />
          <FormField
            label="Fecha programada (opcional)"
            as="input"
            type="datetime-local"
            value={form.scheduled_at}
            onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancelar</button>
            <button onClick={save} disabled={saving || !form.title.trim()} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-xl disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editTarget ? "Guardar" : "Crear"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar transmisión?"
        message={`Se eliminarán todos los archivos de "${deleteTarget?.title}". Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}

// ── Row component ──────────────────────────────────────────────────────────

function StreamRow({
  s, onEdit, onDelete, onBroadcast, viewerUrl, isBroadcasting,
}: {
  s: LiveStream;
  onEdit: (s: LiveStream) => void;
  onDelete: (s: LiveStream) => void;
  onBroadcast: (s: LiveStream) => void;
  viewerUrl: (key: string) => string;
  isBroadcasting: boolean;
}) {
  const { label, cls } = statusLabels[s.status] ?? statusLabels.idle;

  return (
    <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4">
      {/* Thumbnail */}
      <div className="shrink-0 w-24 h-14 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
        {s.thumbnail
          ? <img src={s.thumbnail} alt={s.title} className="w-full h-full object-cover" />
          : <Video size={20} className="text-gray-400" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
          {s.status === "live" && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
        </div>
        <p className="font-semibold text-gray-900 text-sm mt-0.5 truncate">{s.title}</p>
        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
          {s.started_at && (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {new Date(s.started_at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}
            </span>
          )}
          {s.status !== "idle" && (
            <span className="flex items-center gap-1">
              <Users size={11} />
              {s.peak_viewers} espectadores máx.
            </span>
          )}
          {s.chunk_count > 0 && (
            <span>{s.chunk_count} segmentos</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {(s.status === "live" || s.status === "ended") && (
          <a
            href={viewerUrl(s.stream_key)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 underline hover:text-gray-800 px-2 py-1 rounded"
          >
            Ver
          </a>
        )}

        {s.status === "idle" && !isBroadcasting && (
          <button
            onClick={() => onBroadcast(s)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Radio size={12} />
            Transmitir
          </button>
        )}

        {s.status === "ended" && !isBroadcasting && (
          <button
            onClick={() => onBroadcast(s)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Radio size={12} />
            Re-transmitir
          </button>
        )}

        <button
          onClick={() => onEdit(s)}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Editar"
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={() => onDelete(s)}
          disabled={s.status === "live"}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
          title="Eliminar"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
