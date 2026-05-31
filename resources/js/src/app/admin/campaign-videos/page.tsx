"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Loader2, Upload, Pencil, VideoOff, PlayCircle, X } from "lucide-react";
import { adminApi, type CampaignVideo } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";
import { FilePreviewModal } from "@/components/admin/FilePreviewModal";

/* Captura el primer frame del video como thumbnail cuando no hay imagen subida */
function VideoThumb({ url, alt }: { url: string; alt: string }) {
  const videoEl  = useRef<HTMLVideoElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const [thumb, setThumb]   = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) { setFailed(true); return; }
    const video  = videoEl.current;
    const canvas = canvasEl.current;
    if (!video || !canvas) return;

    const onMeta = () => { video.currentTime = Math.min(1, (video.duration || 2) / 4); };
    const onSeeked = () => {
      try {
        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 360;
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        setThumb(canvas.toDataURL("image/jpeg", 0.75));
      } catch { setFailed(true); }
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", () => setFailed(true));
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [url]);

  if (failed) return <PlayCircle size={44} className="text-white/30" />;
  return (
    <>
      {thumb
        ? <img src={thumb} alt={alt} className="w-full h-full object-cover" />
        : (
          <>
            <video ref={videoEl} src={url} preload="metadata" muted crossOrigin="anonymous" className="sr-only" />
            <canvas ref={canvasEl} className="sr-only" />
            <PlayCircle size={44} className="text-white/20 animate-pulse" />
          </>
        )
      }
    </>
  );
}

const CATEGORIES = ["general", "campaña", "propuestas", "distritos", "eventos", "mensajes"];

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CampaignVideosPage() {
  const { token } = useAuth();
  const videoRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  const [items, setItems]               = useState<CampaignVideo[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 12 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [uploadOpen, setUploadOpen]     = useState(false);
  const [editTarget, setEditTarget]     = useState<CampaignVideo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignVideo | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  // Upload form
  const [videoFile, setVideoFile]   = useState<File | null>(null);
  const [thumbFile, setThumbFile]   = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle]   = useState("");
  const [uploadCategory, setUploadCategory] = useState("general");

  // Edit form
  const [editTitle, setEditTitle]         = useState("");
  const [editCategory, setEditCategory]   = useState("general");
  const [editVideoFile, setEditVideoFile] = useState<File | null>(null);
  const [editThumbFile, setEditThumbFile] = useState<File | null>(null);
  const [editThumbPreview, setEditThumbPreview] = useState<string | null>(null);
  const editVideoRef = useRef<HTMLInputElement>(null);
  const editThumbRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.campaignVideos.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando videos."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openUpload() {
    setVideoFile(null); setThumbFile(null); setThumbPreview(null);
    setUploadTitle(""); setUploadCategory("general");
    setError(null); setUploadProgress(0); setUploadOpen(true);
  }

  function onThumbChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setThumbFile(f);
    setThumbPreview(URL.createObjectURL(f));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !videoFile) return;
    setSaving(true); setError(null); setUploadProgress(10);
    try {
      const fd = new FormData();
      fd.append("video", videoFile);
      if (thumbFile) fd.append("thumbnail", thumbFile);
      if (uploadTitle) fd.append("title", uploadTitle);
      fd.append("category", uploadCategory);
      setUploadProgress(40);
      await adminApi.campaignVideos.upload(token, fd);
      setUploadProgress(100);
      setUploadOpen(false);
      load(1);
    } catch (err: any) {
      setError(err?.message ?? "Error subiendo video. Verifica el tamaño (máx. 200 MB).");
    } finally { setSaving(false); setUploadProgress(0); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editTarget) return;
    setSaving(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("title", editTitle);
      fd.append("category", editCategory);
      if (editVideoFile) fd.append("video_file", editVideoFile);
      if (editThumbFile) fd.append("thumbnail_file", editThumbFile);
      await adminApi.campaignVideos.update(token, editTarget.id, fd);
      setEditTarget(null); load(page);
    } catch (err: any) {
      setError(err?.message ?? "Error actualizando.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.campaignVideos.delete(token, deleteTarget.id);
      setDeleteTarget(null); load(page);
    } catch { setError("Error eliminando video."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((v) =>
    !search ||
    (v.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    v.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Videos de campaña"
        subtitle={`${meta.total} videos subidos`}
        onNew={openUpload}
        newLabel="Subir video"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por título o categoría..." className="w-56" />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-brand-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-500">
          <VideoOff size={40} className="mb-3 opacity-40" />
          <p className="text-sm">No hay videos aún. Sube el primero.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((video) => (
            <div key={video.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm group">
              {/* Thumbnail */}
              <div
                className="relative aspect-video bg-gradient-to-br from-brand-900/40 to-ink-900 flex items-center justify-center overflow-hidden cursor-pointer"
                onClick={() => video.url && setPreview({ url: video.url, title: video.title ?? "Video" })}
              >
                {video.thumbnail ? (
                  <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <VideoThumb url={video.url} alt={video.title ?? ""} />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium flex items-center gap-1.5"
                  >
                    <PlayCircle size={14} /> Reproducir
                  </button>
                </div>
                {video.size && (
                  <span className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                    {formatSize(video.size)}
                  </span>
                )}
              </div>
              {/* Info */}
              <div className="p-4">
                <p className="text-xs uppercase tracking-wider text-amber-500 mb-1 capitalize">{video.category}</p>
                <p className="text-sm font-medium text-gray-900 truncate">{video.title ?? "Sin título"}</p>
                <p className="text-xs text-ink-500 mt-1">
                  {new Date(video.created_at).toLocaleDateString("es-PE")}
                </p>
              </div>
              {/* Actions */}
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => { setEditTarget(video); setEditTitle(video.title ?? ""); setEditCategory(video.category); setEditVideoFile(null); setEditThumbFile(null); setEditThumbPreview(null); setError(null); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-ink-400 hover:text-brand-400 hover:bg-brand-500/5 transition-colors"
                >
                  <Pencil size={12} /> Editar
                </button>
                <div className="w-px bg-gray-200" />
                <button
                  onClick={() => setDeleteTarget(video)}
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

      {/* Modal subida */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Subir video" size="lg">
        <form onSubmit={handleUpload} className="space-y-4">
          {/* Video file */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">
              Archivo de video <span className="text-red-400">*</span>
            </label>
            <div
              onClick={() => videoRef.current?.click()}
              className="border-2 border-dashed border-white/[0.12] rounded-xl p-6 text-center cursor-pointer hover:border-brand-500/50 hover:bg-brand-500/5 transition-colors"
            >
              {videoFile ? (
                <p className="text-sm text-brand-400 font-medium">{videoFile.name} — {formatSize(videoFile.size)}</p>
              ) : (
                <>
                  <Upload size={24} className="mx-auto mb-2 text-ink-500" />
                  <p className="text-sm text-gray-500">Seleccionar video</p>
                  <p className="text-xs text-ink-500 mt-0.5">MP4, WebM, MOV — máx. 200 MB</p>
                </>
              )}
              <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/avi"
                onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} className="hidden" />
            </div>
          </div>

          {/* Thumbnail (opcional) */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Miniatura (opcional)</label>
            <div
              onClick={() => thumbRef.current?.click()}
              className="border border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-brand-500/30 transition-colors flex items-center gap-4"
            >
              {thumbPreview ? (
                <img src={thumbPreview} alt="" className="h-16 w-28 object-cover rounded-lg" />
              ) : (
                <div className="h-16 w-28 rounded-lg bg-white/[0.04] flex items-center justify-center text-ink-600">
                  <PlayCircle size={20} />
                </div>
              )}
              <p className="text-xs text-ink-400">{thumbFile ? thumbFile.name : "Click para subir miniatura JPG/PNG"}</p>
              <input ref={thumbRef} type="file" accept="image/jpeg,image/png,image/webp"
                onChange={onThumbChange} className="hidden" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Título (opcional)" value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)} placeholder="Recorrido por Niepos..." className="col-span-2" />
            <FormField
              as="select" label="Categoría" value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              className="col-span-2"
            />
          </div>

          {/* Barra de progreso simulada */}
          {saving && uploadProgress > 0 && (
            <div>
              <div className="flex justify-between text-xs text-ink-400 mb-1">
                <span>Subiendo...</span><span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setUploadOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !videoFile}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {saving ? "Subiendo..." : "Subir video"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal edición */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Editar video" size="lg">
        {editTarget && (
          <form onSubmit={handleEdit} className="space-y-4">
            <FormField label="Título" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Título descriptivo..." />
            <FormField
              as="select" label="Categoría" value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
            />

            {/* Reemplazar miniatura */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Miniatura</label>
              <div
                onClick={() => editThumbRef.current?.click()}
                className="flex items-center gap-4 border border-dashed border-gray-200 rounded-xl p-3 cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors"
              >
                {editThumbPreview ? (
                  <img src={editThumbPreview} alt="" className="h-14 w-24 object-cover rounded-lg shrink-0" />
                ) : editTarget.thumbnail ? (
                  <img src={editTarget.thumbnail} alt="" className="h-14 w-24 object-cover rounded-lg shrink-0 opacity-60" />
                ) : (
                  <div className="h-14 w-24 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <PlayCircle size={20} className="text-gray-300" />
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  {editThumbFile ? editThumbFile.name : "Clic para cambiar miniatura"}
                </p>
              </div>
              <input ref={editThumbRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setEditThumbFile(f); setEditThumbPreview(URL.createObjectURL(f)); } e.target.value = ""; }} />
            </div>

            {/* Reemplazar video */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Reemplazar archivo de video (opcional)</label>
              {editVideoFile ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-brand-200 bg-brand-50">
                  <PlayCircle size={16} className="text-brand-500 shrink-0" />
                  <span className="text-xs text-gray-700 truncate flex-1">{editVideoFile.name} — {formatSize(editVideoFile.size)}</span>
                  <button type="button" onClick={() => { setEditVideoFile(null); if (editVideoRef.current) editVideoRef.current.value = ""; }}
                    className="p-1 rounded text-red-400 hover:bg-red-50"><X size={12} /></button>
                </div>
              ) : (
                <div onClick={() => editVideoRef.current?.click()}
                  className="border border-dashed border-gray-200 rounded-xl p-3 text-center cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors">
                  <p className="text-xs text-gray-500">Clic para subir nuevo video (MP4, WebM — máx. 200 MB)</p>
                </div>
              )}
              <input ref={editVideoRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/avi" className="hidden"
                onChange={(e) => { setEditVideoFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                {saving && <Loader2 size={14} className="animate-spin" />} Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar video?"
        message="Se eliminará este video y su archivo de forma permanente."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <FilePreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        url={preview?.url ?? ""}
        title={preview?.title}
      />
    </div>
  );
}
