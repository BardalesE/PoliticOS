"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Loader2, PlayCircle, Upload, X } from "lucide-react";
import { FilePreviewModal } from "@/components/admin/FilePreviewModal";
import { adminApi, type Video } from "@/lib/api";

// ─── Utilidades de thumbnail ───────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const match = u.pathname.match(/\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[2];
      return u.searchParams.get("v");
    }
    if (u.hostname === "youtu.be") return u.pathname.slice(1, 12) || null;
  } catch {}
  return null;
}

function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|mov|avi|ogv)(\?|$)/i.test(url);
}

/**
 * Muestra la miniatura del video de forma inteligente:
 * - Si hay thumbnail guardada → la usa directamente
 * - Si es YouTube → thumbnail pública de YouTube
 * - Si es archivo de video local → captura frame con canvas
 * - Otros externos → placeholder con play icon
 */
function VideoThumbnail({
  url, thumbnail, title,
}: { url: string; thumbnail?: string | null; title: string }) {
  const videoEl  = useRef<HTMLVideoElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const [resolved, setResolved] = useState<string | null>(thumbnail ?? null);
  const [capturing, setCapturing] = useState(false);
  const [failed, setFailed]     = useState(false);

  useEffect(() => {
    if (thumbnail) { setResolved(thumbnail); return; }
    if (!url) { setFailed(true); return; }

    // YouTube → thumbnail pública instantánea
    const ytId = extractYouTubeId(url);
    if (ytId) {
      setResolved(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      return;
    }

    // Archivo de video local → captura de frame
    if (isVideoFile(url)) {
      setCapturing(true);
      const video  = videoEl.current;
      const canvas = canvasEl.current;
      if (!video || !canvas) return;

      const onMeta = () => {
        video.currentTime = Math.min(1, (video.duration || 2) / 4);
      };
      const onSeeked = () => {
        try {
          canvas.width  = video.videoWidth  || 640;
          canvas.height = video.videoHeight || 360;
          canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
          setResolved(canvas.toDataURL("image/jpeg", 0.8));
          setCapturing(false);
        } catch { setFailed(true); setCapturing(false); }
      };
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", () => { setFailed(true); setCapturing(false); });
      return () => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("seeked", onSeeked);
      };
    }

    setFailed(true);
  }, [url, thumbnail]);

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={title}
        className="w-full h-full object-cover"
        onError={() => { setResolved(null); setFailed(true); }}
      />
    );
  }

  if (capturing) {
    return (
      <>
        <video ref={videoEl} src={url} preload="metadata" muted crossOrigin="anonymous" className="sr-only" />
        <canvas ref={canvasEl} className="sr-only" />
        <div className="w-full h-full flex items-center justify-center">
          <PlayCircle size={36} className="text-gray-300 animate-pulse" />
        </div>
      </>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
      <PlayCircle size={32} className="text-gray-300" />
      <p className="text-[10px] text-gray-400">Sin previsualización</p>
    </div>
  );
}
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";

const TOPICS = ["agua","agricultura","vias","salud","educacion","seguridad","empleo","turismo","general"];

type FormState = {
  title: string; url: string; thumbnail: string;
  views: string; topic: string; published_at: string;
};

const EMPTY: FormState = { title: "", url: "", thumbnail: "", views: "0", topic: "general", published_at: "" };

function toFormState(v: Video): FormState {
  return {
    title: v.title, url: v.url ?? "", thumbnail: v.thumbnail ?? "",
    views: v.views.toString(), topic: v.topic ?? "general",
    published_at: v.published_at ? v.published_at.slice(0, 10) : "",
  };
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function VideosPage() {
  const { token } = useAuth();
  const videoRef = useRef<HTMLInputElement>(null);

  const [items, setItems]               = useState<Video[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<Video | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY);
  const [videoFile, setVideoFile]       = useState<File | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [preview, setPreview]           = useState<{ url: string; title: string } | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.videos.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando videos."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openNew() {
    setEditing(null); setForm(EMPTY); setVideoFile(null);
    setError(null); setModalOpen(true);
  }
  function openEdit(v: Video) {
    setEditing(v); setForm(toFormState(v)); setVideoFile(null);
    setError(null); setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setError(null); }

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!editing && !videoFile) {
      setError("Debes subir un archivo de video.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      if (videoFile) {
        fd.append("video_file", videoFile);
      } else if (form.url.trim()) {
        fd.append("url", form.url.trim());
      }
      if (form.thumbnail.trim()) fd.append("thumbnail", form.thumbnail.trim());
      fd.append("views", form.views || "0");
      if (form.topic) fd.append("topic", form.topic);
      if (form.published_at) fd.append("published_at", form.published_at);

      if (editing) {
        await adminApi.videos.update(token, editing.id, fd);
      } else {
        await adminApi.videos.create(token, fd);
      }
      closeModal(); load(page);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando video.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.videos.delete(token, deleteTarget.id);
      setDeleteTarget(null); load(page);
    } catch { setError("Error eliminando video."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((v) =>
    !search || v.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Videos"
        subtitle={`${meta.total} videos registrados`}
        onNew={openNew}
        newLabel="Nuevo video"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por título..." className="w-56" />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <PlayCircle size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No hay videos registrados aún.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <div
              key={v.id}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col"
            >
              {/* Thumbnail / placeholder */}
              <div
                className="relative aspect-video bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden cursor-pointer group/thumb"
                onClick={() => v.url && setPreview({ url: v.url, title: v.title })}
              >
                <VideoThumbnail url={v.url} thumbnail={v.thumbnail} title={v.title} />
                {v.url && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                    <PlayCircle size={40} className="text-white drop-shadow" />
                  </div>
                )}
                {v.views > 0 && (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
                    {formatViews(v.views)} views
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2 line-clamp-2">
                  {v.title}
                </h3>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {v.topic && (
                    <span className="px-2 py-0.5 bg-brand-50 text-brand-600 border border-brand-100 rounded-full text-xs capitalize">
                      {v.topic}
                    </span>
                  )}
                  {v.published_at && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded-full text-xs">
                      {new Date(v.published_at).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-auto">
                  {v.url ? (
                    <button
                      onClick={() => setPreview({ url: v.url, title: v.title })}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-500 transition-colors"
                    >
                      <PlayCircle size={12} /> Ver video
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300">Sin enlace</span>
                  )}
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(v)}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(v)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Editar video" : "Nuevo video"} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Título *" required value={form.title} onChange={set("title")} placeholder="Propuesta de agua potable..." />

          {/* Video file upload zone */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Archivo de video
            </label>
            {videoFile ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-brand-200 bg-brand-50">
                <PlayCircle size={18} className="text-brand-500 shrink-0" />
                <span className="text-xs text-gray-700 truncate flex-1">{videoFile.name}</span>
                <button type="button" onClick={() => { setVideoFile(null); if (videoRef.current) videoRef.current.value = ""; }}
                  className="p-1 rounded-lg text-red-400 hover:bg-red-50">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div
                onClick={() => videoRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors"
              >
                <Upload size={20} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">Arrastra o <span className="text-brand-500 font-medium">haz clic</span> para subir</p>
                <p className="text-xs text-gray-400 mt-0.5">MP4, WebM, MOV — máx. 200 MB</p>
              </div>
            )}
            <input
              ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/avi"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} className="hidden"
            />
          </div>

          <FormField label="URL miniatura (opcional)" type="url" value={form.thumbnail} onChange={set("thumbnail")} placeholder="https://..." />
          <div className="grid grid-cols-2 gap-4">
            <FormField as="select" label="Tema" value={form.topic} onChange={set("topic")}
              options={TOPICS.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} />
            <FormField label="Vistas" type="number" value={form.views} onChange={set("views")} min="0" />
            <FormField label="Fecha publicación" type="date" value={form.published_at} onChange={set("published_at")} className="col-span-2" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeModal}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editing ? "Guardar cambios" : "Crear video"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar video?"
        message={`Se eliminará "${deleteTarget?.title}" de forma permanente.`}
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
