"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Loader2, Upload, Pencil, ImageOff, X, Maximize2 } from "lucide-react";
import { adminApi, type CampaignPhoto } from "@/lib/api";
import { FilePreviewModal } from "@/components/admin/FilePreviewModal";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";

const CATEGORIES = ["general", "campaña", "eventos", "propuestas", "distritos", "equipo"];

export default function GalleryPage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems]               = useState<CampaignPhoto[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [uploadOpen, setUploadOpen]     = useState(false);
  const [editTarget, setEditTarget]     = useState<CampaignPhoto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignPhoto | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const [files, setFiles]               = useState<File[]>([]);
  const [previews, setPreviews]         = useState<string[]>([]);
  const [uploadTitle, setUploadTitle]   = useState("");
  const [uploadCategory, setUploadCategory] = useState("general");
  const [dragOver, setDragOver]         = useState(false);

  const [editTitle, setEditTitle]       = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [editFile, setEditFile]         = useState<File | null>(null);
  const [editPreview, setEditPreview]   = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; title: string } | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.gallery.list(token, p);
      console.log("Gallery items:", res.data);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando galería."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function onFilesSelected(selected: File[]) {
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const selected = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (selected.length) onFilesSelected(selected);
  }

  function openUpload() {
    setFiles([]); setPreviews([]);
    setUploadTitle(""); setUploadCategory("general");
    setError(null); setDragOver(false); setUploadOpen(true);
  }

  function openEdit(photo: CampaignPhoto) {
    setEditTarget(photo);
    setEditTitle(photo.title ?? "");
    setEditCategory(photo.category);
    setEditFile(null);
    setEditPreview(null);
    setError(null);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!token || files.length === 0) return;
    setSaving(true); setError(null);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("image", file);
        if (uploadTitle) fd.append("title", uploadTitle);
        fd.append("category", uploadCategory);
        await adminApi.gallery.upload(token, fd);
      }
      setUploadOpen(false);
      load(1);
    } catch (err: any) {
      setError(err?.message ?? "Error subiendo imagen.");
    } finally { setSaving(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editTarget) return;
    setSaving(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("title", editTitle);
      fd.append("category", editCategory);
      if (editFile) fd.append("image_file", editFile);
      await adminApi.gallery.update(token, editTarget.id, fd);
      setEditTarget(null); load(page);
    } catch (err: any) {
      setError(err?.message ?? "Error actualizando.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.gallery.delete(token, deleteTarget.id);
      setDeleteTarget(null); load(page);
    } catch { setError("Error eliminando foto."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((p) =>
    !search ||
    (p.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Galería de fotos"
        subtitle={`${meta.total} fotos subidas`}
        onNew={openUpload}
        newLabel="Subir fotos"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por título o categoría..." className="w-56" />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ImageOff size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No hay fotos aún. Sube la primera.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((photo) => (
            <div key={photo.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col group">
              {/* Image */}
              <div
                className="aspect-square overflow-hidden relative cursor-pointer"
                onClick={() => setPhotoPreview({ url: photo.url, title: photo.title ?? photo.category })}
              >
                <img
                  src={photo.url}
                  alt={photo.title ?? ""}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <Maximize2 size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                </div>
              </div>
              {/* Meta */}
              <div className="px-3 py-2 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  {photo.title && (
                    <p className="text-xs font-medium text-gray-900 truncate">{photo.title}</p>
                  )}
                  <p className="text-[10px] text-gray-400 capitalize">{photo.category}</p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    onClick={() => openEdit(photo)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(photo)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} />
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

      {/* Modal de subida */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Subir fotos" size="lg">
        <form onSubmit={handleUpload} className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? "border-brand-500 bg-brand-50"
                : "border-gray-200 hover:border-brand-400 hover:bg-gray-50"
            }`}
          >
            <Upload size={28} className="mx-auto mb-3 text-gray-400" />
            <p className="text-sm font-medium text-gray-700 mb-1">
              Arrastra tus imágenes aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-gray-400">JPG, PNG, WebP — máx. 10 MB por foto</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={(e) => { const sel = Array.from(e.target.files ?? []); if (sel.length) onFilesSelected(sel); }}
              className="hidden"
            />
          </div>

          {previews.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {previews.map((src, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden border border-gray-200">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Título (opcional)"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Evento en Niepos..."
              className="col-span-2"
            />
            <FormField
              as="select" label="Categoría" value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              className="col-span-2"
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setUploadOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving || files.length === 0}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {saving ? "Subiendo..." : `Subir ${files.length > 0 ? `${files.length} foto${files.length > 1 ? "s" : ""}` : "fotos"}`}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Editar foto" size="md">
        {editTarget && (
          <form onSubmit={handleEdit} className="space-y-4">
            {/* Foto actual con opción de reemplazar */}
            <div className="relative rounded-xl overflow-hidden aspect-video group">
              <img
                src={editPreview ?? editTarget.url}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => editFileRef.current?.click()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-xs font-medium"
                >
                  <Upload size={11} /> Cambiar foto
                </button>
              </div>
            </div>
            <input
              ref={editFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setEditFile(f); setEditPreview(URL.createObjectURL(f)); }
                e.target.value = "";
              }}
            />
            {editFile && (
              <p className="text-xs text-brand-500 font-medium">Nueva foto: {editFile.name}</p>
            )}
            <FormField label="Título" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Título descriptivo..." />
            <FormField
              as="select" label="Categoría" value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
            />
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar foto?"
        message="Se eliminará esta foto de forma permanente, incluyendo el archivo."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <FilePreviewModal
        open={!!photoPreview}
        onClose={() => setPhotoPreview(null)}
        url={photoPreview?.url ?? ""}
        title={photoPreview?.title}
      />
    </div>
  );
}
