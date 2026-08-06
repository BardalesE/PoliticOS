"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Loader2, Pencil, Award, Upload } from "lucide-react";
import { adminApiExtended, type Achievement } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";

const EMPTY_FORM = {
  title: "", description: "", metric_label: "", metric_value: "",
  district: "", status: "completado" as "completado" | "en_curso",
  sort_order: 0, is_active: true,
};

function PhotoPicker({
  label, preview, onPick, inputRef,
}: {
  label: string; preview: string | null; onPick: (f: File) => void; inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-2">{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        className="aspect-video rounded-xl bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-brand-500/40 overflow-hidden"
      >
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <Upload size={20} className="text-gray-400" />
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
      />
    </div>
  );
}

export default function AchievementsPage() {
  const { token } = useAuth();
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef  = useRef<HTMLInputElement>(null);

  const [items, setItems]               = useState<Achievement[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [formOpen, setFormOpen]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Achievement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Achievement | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [beforeFile, setBeforeFile]     = useState<File | null>(null);
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [afterFile, setAfterFile]       = useState<File | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApiExtended.achievements.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando obras."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setBeforeFile(null); setBeforePreview(null);
    setAfterFile(null); setAfterPreview(null);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(a: Achievement) {
    setEditTarget(a);
    setForm({
      title: a.title, description: a.description ?? "",
      metric_label: a.metric_label ?? "", metric_value: a.metric_value ?? "",
      district: a.district ?? "", status: a.status,
      sort_order: a.sort_order, is_active: a.is_active,
    });
    setBeforeFile(null); setBeforePreview(a.photo_before_url);
    setAfterFile(null); setAfterPreview(a.photo_after_url);
    setError(null);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) =>
        fd.append(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v))
      );
      if (beforeFile) fd.append("photo_before", beforeFile);
      if (afterFile) fd.append("photo_after", afterFile);

      if (editTarget) {
        await adminApiExtended.achievements.update(token, editTarget.id, fd);
      } else {
        await adminApiExtended.achievements.upload(token, fd);
      }
      setFormOpen(false);
      load(editTarget ? page : 1);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando obra.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApiExtended.achievements.delete(token, deleteTarget.id);
      setDeleteTarget(null);
      load(page);
    } catch { setError("Error eliminando obra."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((a) =>
    !search ||
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    (a.district ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Obras destacadas"
        subtitle={`${meta.total} obras registradas`}
        onNew={openCreate}
        newLabel="Nueva obra"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por título o lugar..." className="w-full sm:w-64" />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Award size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No hay obras aún. Agrega la primera.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="grid grid-cols-2 aspect-video bg-gray-100">
                {a.photo_before_url ? <img src={a.photo_before_url} alt="Antes" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center text-[10px] text-gray-400">Sin foto antes</div>}
                {a.photo_after_url ? <img src={a.photo_after_url} alt="Después" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center text-[10px] text-gray-400">Sin foto después</div>}
              </div>
              <div className="p-4 flex-1 flex flex-col gap-1">
                <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                {(a.metric_value || a.metric_label) && (
                  <p className="text-lg font-bold text-brand-600">{a.metric_value} <span className="text-xs font-normal text-gray-500">{a.metric_label}</span></p>
                )}
                <span className="text-[11px] text-gray-400 mt-auto">{a.district ?? "—"} · {a.status === "completado" ? "Completado" : "En curso"}</span>
              </div>
              <div className="flex border-t border-gray-100">
                <button onClick={() => openEdit(a)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors">
                  <Pencil size={12} /> Editar
                </button>
                <div className="w-px bg-gray-200" />
                <button onClick={() => setDeleteTarget(a)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
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

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editTarget ? "Editar obra" : "Nueva obra"} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PhotoPicker label="Foto: antes" preview={beforePreview} inputRef={beforeRef} onPick={(f) => { setBeforeFile(f); setBeforePreview(URL.createObjectURL(f)); }} />
            <PhotoPicker label="Foto: después" preview={afterPreview} inputRef={afterRef} onPick={(f) => { setAfterFile(f); setAfterPreview(URL.createObjectURL(f)); }} />
          </div>

          <FormField label="Título" required value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Renovación del Parque Central" />
          <FormField as="textarea" label="Descripción" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Qué se hizo y cómo benefició a la comunidad..." />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Valor de la métrica" value={form.metric_value} onChange={(e) => setForm(p => ({ ...p, metric_value: e.target.value }))} placeholder="3" />
            <FormField label="Etiqueta de la métrica" value={form.metric_label} onChange={(e) => setForm(p => ({ ...p, metric_label: e.target.value }))} placeholder="parques recuperados" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Lugar" value={form.district} onChange={(e) => setForm(p => ({ ...p, district: e.target.value }))} placeholder="San Isidro" />
            <FormField as="select" label="Estado" value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value as "completado" | "en_curso" }))}
              options={[{ value: "completado", label: "Completado" }, { value: "en_curso", label: "En curso" }]} />
          </div>

          <FormField label="Orden de aparición" value={String(form.sort_order)} onChange={(e) => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} placeholder="0" />

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 accent-brand-600" />
            <span className="text-gray-700 text-sm">Mostrar en el sitio público</span>
          </label>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setFormOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar obra?"
        message="Se eliminará esta obra y sus fotos de forma permanente."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
