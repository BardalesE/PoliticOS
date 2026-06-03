"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Loader2, Pencil, CalendarOff, CalendarDays, Star, Timer } from "lucide-react";
import { adminApi, type CampaignEvent } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const EMPTY_FORM = {
  title: "", description: "", event_date: "",
  location: "", address: "", stream_url: "",
  is_active: true, is_featured: false, sort_order: 0,
};

export default function EventsPage() {
  const { token } = useAuth();
  const imgRef = useRef<HTMLInputElement>(null);

  const [items, setItems]               = useState<CampaignEvent[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 12 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [formOpen, setFormOpen]         = useState(false);
  const [editTarget, setEditTarget]     = useState<CampaignEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignEvent | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [imgFile, setImgFile]           = useState<File | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.events.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando eventos."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setImgFile(null);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(ev: CampaignEvent) {
    setEditTarget(ev);
    setForm({
      title:      ev.title,
      description:ev.description ?? "",
      event_date: ev.event_date.substring(0, 16),
      location:   ev.location ?? "",
      address:    ev.address ?? "",
      stream_url: ev.stream_url ?? "",
      is_active:  ev.is_active,
      is_featured:ev.is_featured,
      sort_order: ev.sort_order,
    });
    setImgFile(null);
    setError(null);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== null && v !== undefined)
          fd.append(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
      });
      if (imgFile) {
        fd.append("image", imgFile);
      } else if (editTarget?.image_url) {
        fd.append("image_url", editTarget.image_url);
      }

      if (editTarget) {
        await adminApi.events.update(token, editTarget.id, fd);
      } else {
        await adminApi.events.create(token, fd);
      }
      setFormOpen(false);
      load(editTarget ? page : 1);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando evento.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.events.delete(token, deleteTarget.id);
      setDeleteTarget(null);
      load(page);
    } catch { setError("Error eliminando evento."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((ev) =>
    !search ||
    ev.title.toLowerCase().includes(search.toLowerCase()) ||
    (ev.location ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Eventos"
        subtitle={`${meta.total} eventos registrados`}
        onNew={openCreate}
        newLabel="Nuevo evento"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar evento..." className="w-52" />
      </PageHeader>

      {/* Callout cronómetro */}
      <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
        <Timer size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <span className="font-bold">Cronómetro en portada:</span> el evento marcado como{" "}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-300 text-amber-900 text-xs font-bold">
            <Star size={9} /> Destacado
          </span>{" "}
          es el que aparece como cuenta regresiva en la página principal. Si no hay ninguno destacado, el cronómetro cuenta hacia la fecha de elecciones configurada en{" "}
          <a href="/admin/home-settings" className="underline font-semibold">Configuración de Home</a>.
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-500">
          <CalendarOff size={40} className="mb-3 opacity-40" />
          <p className="text-sm">No hay eventos aún. Crea el primero.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ev) => (
            <div key={ev.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
              {/* Imagen */}
              <div className="relative aspect-video bg-gradient-to-br from-brand-900/40 to-ink-900 flex items-center justify-center overflow-hidden">
                {ev.image_url ? (
                  <img src={ev.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <CalendarDays size={40} className="text-white/20" />
                )}
                <div className="absolute top-2 left-2 flex gap-1.5">
                  {ev.is_featured && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-ink-950 text-[10px] font-bold">
                      <Star size={9} /> Destacado
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ev.is_active ? "bg-green-500/70 text-white" : "bg-gray-200 text-gray-500"}`}>
                    {ev.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </div>
              {/* Info */}
              <div className="p-4">
                <p className="text-xs text-brand-400 mb-1">{formatDate(ev.event_date)}</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{ev.title}</p>
                {ev.location && <p className="text-xs text-ink-500 mt-0.5 truncate">{ev.location}</p>}
              </div>
              {/* Acciones */}
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => openEdit(ev)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-ink-400 hover:text-brand-400 hover:bg-brand-500/5 transition-colors"
                >
                  <Pencil size={12} /> Editar
                </button>
                <div className="w-px bg-gray-200" />
                <button
                  onClick={() => setDeleteTarget(ev)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-ink-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                >
                  <Trash2 size={12} /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && meta.last_page > 1 && (
        <div className="mt-6">
          <Pagination currentPage={page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPage={load} />
        </div>
      )}

      {/* Modal form */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editTarget ? "Editar evento" : "Nuevo evento"} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Título *" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Gran Mitin de Campaña" />
          <FormField as="textarea" label="Descripción" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descripción del evento..." />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Fecha y hora *</label>
              <input
                type="datetime-local"
                value={form.event_date}
                onChange={(e) => setForm(p => ({ ...p, event_date: e.target.value }))}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-brand-500/50 focus:bg-brand-500/5"
              />
            </div>
            <FormField label="Orden" value={String(form.sort_order)} onChange={(e) => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} placeholder="0" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Lugar / Nombre del lugar" value={form.location} onChange={(e) => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Plaza de Armas" />
            <FormField label="Dirección" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} placeholder="San Miguel, Cajamarca" />
          </div>

          {/* Imagen */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Imagen del evento</label>
            {(() => {
              const preview = imgFile ? URL.createObjectURL(imgFile) : (editTarget?.image_url ?? null);
              return preview ? (
                <div className="relative rounded-xl overflow-hidden aspect-video group">
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button type="button" onClick={() => imgRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-xs font-medium">
                      Cambiar
                    </button>
                    <button type="button" onClick={() => setImgFile(null)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium">
                      Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => imgRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-6 cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors text-center"
                >
                  <p className="text-sm text-gray-500">Arrastra o <span className="text-brand-500 font-medium">haz clic</span> para subir imagen</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP</p>
                </div>
              );
            })()}
            <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImgFile(e.target.files?.[0] ?? null)} className="hidden" />
          </div>

          <FormField label="URL de transmisión en vivo (opcional)" value={form.stream_url} onChange={(e) => setForm(p => ({ ...p, stream_url: e.target.value }))} placeholder="https://youtube.com/live/..." />

          <div className="flex gap-3">
            {[
              { key: "is_active", label: "Activo", desc: "Visible al público" },
              { key: "is_featured", label: "★ Destacado", desc: "Cronómetro en portada" },
            ].map(({ key, label, desc }) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm(p => ({ ...p, [key]: !(p as any)[key] }))}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  (form as any)[key]
                    ? "border-brand-500/30 bg-brand-500/10 text-brand-300"
                    : "border-gray-200 text-gray-500"
                }`}
              >
                {label} <span className="block text-[10px] text-ink-500 font-normal mt-0.5">{desc}</span>
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setFormOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar evento?"
        message="Se eliminará este evento de forma permanente."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
