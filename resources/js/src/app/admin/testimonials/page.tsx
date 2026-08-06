"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Loader2, Pencil, Quote, Upload } from "lucide-react";
import { adminApiExtended, type Testimonial } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";

const EMPTY_FORM = {
  name: "", role: "", quote: "", district: "",
  sort_order: 0, is_active: true,
};

export default function TestimonialsPage() {
  const { token } = useAuth();
  const photoRef = useRef<HTMLInputElement>(null);

  const [items, setItems]               = useState<Testimonial[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [formOpen, setFormOpen]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Testimonial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Testimonial | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [photoFile, setPhotoFile]       = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApiExtended.testimonials.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando testimonios."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setPhotoFile(null);
    setPhotoPreview(null);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(t: Testimonial) {
    setEditTarget(t);
    setForm({
      name: t.name, role: t.role ?? "", quote: t.quote, district: t.district ?? "",
      sort_order: t.sort_order, is_active: t.is_active,
    });
    setPhotoFile(null);
    setPhotoPreview(t.photo_url ?? null);
    setError(null);
    setFormOpen(true);
  }

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
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
      if (photoFile) fd.append("photo", photoFile);

      if (editTarget) {
        await adminApiExtended.testimonials.update(token, editTarget.id, fd);
      } else {
        await adminApiExtended.testimonials.upload(token, fd);
      }
      setFormOpen(false);
      load(editTarget ? page : 1);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando testimonio.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApiExtended.testimonials.delete(token, deleteTarget.id);
      setDeleteTarget(null);
      load(page);
    } catch { setError("Error eliminando testimonio."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((t) =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.district ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Testimonios ciudadanos"
        subtitle={`${meta.total} testimonios registrados`}
        onNew={openCreate}
        newLabel="Nuevo testimonio"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o distrito..." className="w-full sm:w-64" />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Quote size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No hay testimonios aún. Agrega el primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {t.photo_url ? (
                  <img src={t.photo_url} alt={t.name} className="h-12 w-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                    <span className="text-brand-600 font-bold">{t.name[0]}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                  {t.role && <p className="text-xs text-gray-400 truncate">{t.role}</p>}
                </div>
                <span className={`ml-auto shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  t.is_active ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-100 text-gray-500 border-gray-200"
                }`}>
                  {t.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 flex-1">"{t.quote}"</p>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-[11px] text-gray-400">{t.district ?? "—"} · orden {t.sort_order}</span>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors" title="Editar">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </div>
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

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editTarget ? "Editar testimonio" : "Nuevo testimonio"} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Foto</label>
            <div className="flex items-center gap-4">
              <div
                onClick={() => photoRef.current?.click()}
                className="h-16 w-16 rounded-full bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-brand-500/40 overflow-hidden shrink-0"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Upload size={18} className="text-gray-400" />
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">{photoFile ? photoFile.name : "Click para subir foto (opcional)"}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, WebP — máx. 4 MB</p>
              </div>
              <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} className="hidden" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Nombre" required value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="María Torres" />
            <FormField label="Rol / relación" value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Vecina de San Isidro" />
          </div>

          <FormField as="textarea" label="Testimonio" required value={form.quote} onChange={(e) => setForm(p => ({ ...p, quote: e.target.value }))} rows={3} placeholder="Lo que la persona dijo, en sus propias palabras..." />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Distrito" value={form.district} onChange={(e) => setForm(p => ({ ...p, district: e.target.value }))} placeholder="San Isidro" />
            <FormField label="Orden de aparición" value={String(form.sort_order)} onChange={(e) => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} placeholder="0" />
          </div>

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
        title="¿Eliminar testimonio?"
        message="Se eliminará este testimonio de forma permanente."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
