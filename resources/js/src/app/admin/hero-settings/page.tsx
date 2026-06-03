"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, Save, Eye, EyeOff, Sliders,
  Upload, Video, X, CheckCircle, AlertCircle, Link2, Image,
} from "lucide-react";
import { adminApi, adminApiExtended, type HeroSettings } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FormField } from "@/components/admin/FormField";
import { cn } from "@/lib/utils";

const DEFAULTS: Partial<HeroSettings> = {
  title:           "Habla con el candidato",
  subtitle:        "Conoce las propuestas y el plan de gobierno.",
  badge_text:      "Primer candidato con IA del Perú",
  video_url:       "/hero.mp4",
  image_url:       "",
  overlay_opacity: 0.70,
  overlay_color:   "#DC2626",
  btn1_label:      "Empezar conversación",
  btn1_url:        "/chat",
  btn2_label:      "Ver propuestas",
  btn2_url:        "/propuestas",
  btn3_label:      "Próximo evento",
  btn3_url:        "/#eventos",
  is_active:       true,
};

type UploadState = "idle" | "uploading" | "done" | "error";

export default function HeroSettingsPage() {
  const { token } = useAuth();
  const [form, setForm]       = useState<Partial<HeroSettings>>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Video upload state
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [videoMode, setVideoMode]     = useState<"url" | "upload">("url");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image (fallback) upload state
  const [imgUploading, setImgUploading] = useState(false);
  const [imgDragOver, setImgDragOver]   = useState(false);
  const [imgError, setImgError]         = useState<string | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await adminApi.heroSettings.get(token);
      if (data) setForm(data);
    } catch {}
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function set(key: keyof HeroSettings, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      await adminApi.heroSettings.update(token, form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando.");
    } finally { setSaving(false); }
  }

  async function uploadImage(file: File) {
    if (!token) return;
    if (!file.type.startsWith("image/")) { setImgError("Solo imágenes (JPG, PNG, WebP)."); return; }
    if (file.size > 10 * 1024 * 1024) { setImgError("Máximo 10 MB."); return; }
    setImgUploading(true); setImgError(null);
    try {
      const photo = await adminApiExtended.candidateProfile.uploadPhoto(token, file);
      set("image_url", photo.url);
    } catch { setImgError("Error al subir la imagen."); }
    finally { setImgUploading(false); }
  }

  async function uploadVideo(file: File) {
    if (!token) return;
    if (!file.type.startsWith("video/")) {
      setUploadError("Solo se aceptan archivos de video (mp4, webm, mov).");
      return;
    }
    if (file.size > 512 * 1024 * 1024) {
      setUploadError("El archivo no puede superar 500 MB.");
      return;
    }

    // Preview local
    const localUrl = URL.createObjectURL(file);
    setPreviewFile(localUrl);
    setUploadState("uploading");
    setUploadError(null);
    setUploadProgress(0);

    // Simulate progress (real XHR progress not available in fetch)
    const interval = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 8, 85));
    }, 300);

    try {
      const result = await adminApi.heroSettings.uploadVideo(token, file);
      clearInterval(interval);
      setUploadProgress(100);
      setUploadState("done");
      set("video_url", result.url);
      // Clean up local preview, use server URL
      URL.revokeObjectURL(localUrl);
      setPreviewFile(result.url);
    } catch (err: any) {
      clearInterval(interval);
      setUploadState("error");
      setUploadError(err?.message ?? "Error al subir el video.");
      URL.revokeObjectURL(localUrl);
      setPreviewFile(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadVideo(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadVideo(file);
    e.target.value = "";
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    );
  }

  const currentVideo = previewFile ?? form.video_url;

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Sliders size={20} className="text-brand-400" />
          <h1 className="font-serif text-xl font-bold text-gray-900">Hero Principal</h1>
        </div>
        <p className="text-sm text-gray-400">
          Contenido de la sección de portada que los visitantes ven al entrar.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* ── Textos ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Textos</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Título principal *"
              value={form.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Habla con el candidato"
            />
            <FormField
              label="Subtítulo"
              value={form.subtitle ?? ""}
              onChange={(e) => set("subtitle", e.target.value)}
              placeholder="Fe en Dios. Trabajo por el pueblo..."
            />
          </div>
          <div className="mt-4">
            <FormField
              label="Texto del badge (arriba del título)"
              value={form.badge_text ?? ""}
              onChange={(e) => set("badge_text", e.target.value)}
              placeholder="Primer candidato con IA del Perú"
            />
          </div>
        </div>

        {/* ── Video de fondo ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Video de fondo</p>
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-white/[0.1] overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setVideoMode("upload")}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  videoMode === "upload"
                    ? "bg-brand-500 text-white"
                    : "text-gray-400 hover:text-gray-700"
                }`}
              >
                <Upload size={11} /> Subir archivo
              </button>
              <button
                type="button"
                onClick={() => setVideoMode("url")}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  videoMode === "url"
                    ? "bg-brand-500 text-white"
                    : "text-gray-400 hover:text-gray-700"
                }`}
              >
                <Link2 size={11} /> URL directa
              </button>
            </div>
          </div>

          {/* Current video preview */}
          {currentVideo && (
            <div className="relative rounded-xl overflow-hidden bg-black border border-white/10 aspect-video">
              <video
                key={currentVideo}
                src={currentVideo}
                autoPlay muted loop playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3">
                <p className="text-[10px] text-white/70 truncate font-mono">{currentVideo}</p>
              </div>
              {uploadState === "done" && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/90 text-white text-[10px] font-semibold">
                  <CheckCircle size={10} /> Subido
                </div>
              )}
            </div>
          )}

          {/* Upload mode */}
          {videoMode === "upload" && (
            <div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-white/20 hover:border-brand-500/50 hover:bg-gray-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/mov,video/ogg,video/quicktime"
                  onChange={onFileChange}
                  className="sr-only"
                />

                {uploadState === "uploading" ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={28} className="animate-spin text-brand-400" />
                    <p className="text-sm font-medium text-gray-900">Subiendo video...</p>
                    <div className="w-full max-w-xs bg-white/10 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">{uploadProgress}%</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                      <Video size={24} className="text-brand-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">
                        Arrastra tu video aquí
                      </p>
                      <p className="text-xs text-gray-400">
                        o haz clic para seleccionar · MP4, WebM, MOV · máx. 500 MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertCircle size={13} />
                  {uploadError}
                </div>
              )}

              {uploadState === "done" && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
                  <CheckCircle size={13} />
                  Video subido. URL actualizada automáticamente — guarda para confirmar.
                </div>
              )}
            </div>
          )}

          {/* URL mode */}
          {videoMode === "url" && (
            <div className="space-y-4">
              <FormField
                label="URL del video de fondo"
                value={form.video_url ?? ""}
                onChange={(e) => { set("video_url", e.target.value); setPreviewFile(null); }}
                placeholder="/hero.mp4  o  https://example.com/video.mp4"
              />

              {/* Image fallback — drag & drop */}
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Imagen de fondo (fallback si no hay video)
                </p>
                <div
                  onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                  onDragLeave={() => setImgDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setImgDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadImage(f); }}
                  onClick={() => !form.image_url && imgInputRef.current?.click()}
                  className={cn(
                    "relative rounded-xl border-2 overflow-hidden transition-all duration-200",
                    form.image_url
                      ? "border-gray-200 cursor-default"
                      : imgDragOver
                      ? "border-brand-500 bg-brand-50 cursor-pointer"
                      : "border-dashed border-gray-200 hover:border-brand-400 hover:bg-gray-50 cursor-pointer"
                  )}
                >
                  <input
                    ref={imgInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
                  />
                  {form.image_url ? (
                    <div className="relative group aspect-video">
                      <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <button type="button" onClick={(e) => { e.stopPropagation(); imgInputRef.current?.click(); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-xs font-medium">
                          <Upload size={12} /> Cambiar imagen
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); set("image_url", ""); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium">
                          <X size={12} /> Quitar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-8">
                      {imgUploading ? (
                        <Loader2 size={22} className="animate-spin text-brand-400" />
                      ) : (
                        <>
                          <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                            <Image size={18} className="text-brand-500" />
                          </div>
                          <p className="text-xs text-gray-500">
                            Arrastra aquí o <span className="text-brand-500 font-medium">haz clic</span> para subir
                          </p>
                          <p className="text-[10px] text-gray-400">JPG, PNG, WebP · máx. 10 MB</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {imgError && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle size={11} /> {imgError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Overlay opacity — always visible */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Opacidad del overlay — {Math.round(((form.overlay_opacity ?? 0.7) || 0) * 100)}%
            </label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.overlay_opacity ?? 0.7}
              onChange={(e) => set("overlay_opacity", parseFloat(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>Más transparente</span>
              <span>Más oscuro</span>
            </div>
          </div>

          {/* Overlay color */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Color del overlay
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.overlay_color ?? "#DC2626"}
                onChange={(e) => set("overlay_color", e.target.value)}
                className="h-9 w-16 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
              />
              <input
                type="text"
                value={form.overlay_color ?? "#DC2626"}
                onChange={(e) => set("overlay_color", e.target.value)}
                placeholder="#DC2626"
                maxLength={7}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
              <div
                className="h-9 w-9 rounded-lg border border-gray-200 shrink-0"
                style={{ background: `linear-gradient(135deg, ${form.overlay_color ?? "#DC2626"}, #0a0a0a)` }}
                title="Vista previa del gradiente"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Se aplica como gradiente sobre el video o imagen de fondo
            </p>
          </div>
        </div>

        {/* ── Botones de acción ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Botones de acción</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {[
              { n: 1, hint: "Rojo — primario" },
              { n: 2, hint: "Gris — secundario" },
              { n: 3, hint: "Acento — terciario" },
            ].map(({ n, hint }) => (
              <div key={n} className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Botón {n} · {hint}</p>
                <FormField
                  label="Etiqueta"
                  value={(form as any)[`btn${n}_label`] ?? ""}
                  onChange={(e) => set(`btn${n}_label` as keyof HeroSettings, e.target.value)}
                  placeholder={n === 1 ? "Empezar conversación" : n === 2 ? "Ver propuestas" : "Próximo evento"}
                />
                <FormField
                  label="URL"
                  value={(form as any)[`btn${n}_url`] ?? ""}
                  onChange={(e) => set(`btn${n}_url` as keyof HeroSettings, e.target.value)}
                  placeholder={n === 1 ? "/chat" : n === 2 ? "/propuestas" : "/#eventos"}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Estado ── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => set("is_active", !form.is_active)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
              form.is_active
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-gray-200 bg-gray-50 text-gray-400"
            }`}
          >
            {form.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
            {form.is_active ? "Hero visible" : "Hero oculto"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center gap-2">
            <CheckCircle size={14} /> Cambios guardados correctamente.
          </p>
        )}

        <button
          type="submit"
          disabled={saving || uploadState === "uploading"}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-brand-500/20"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
