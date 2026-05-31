"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Save, Loader2, CheckCircle, AlertCircle, Upload, X, Image, Video,
  Plus, Zap, Copy, Trash2, Check,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminApiExtended, type CandidateProfile, type CandidatePreset } from "@/lib/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { cn } from "@/lib/utils";

const EMPTY: Partial<CandidateProfile> = {
  preset_name: "Nuevo candidato",
  name: "", title: "", location: "", party: "", list_number: "1",
  bio: "", tagline: "", election_date: "",
  photo_url: "", logo_url: "", hero_photo_url: "", hero_video_url: "",
  color_primary: "#DC2626", color_dark: "#7F1D1D", color_accent: "#C9A84C",
  tiktok_url: "", facebook_url: "", instagram_url: "", whatsapp_number: "",
};

const COLORS_CACHE_KEY = "brand_colors";
const PROFILE_CACHE_KEY = "candidate_profile_cache";

function updatePublicProfileCache(profile: Partial<CandidateProfile>) {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      cached.profile = profile;
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cached));
    }
  } catch {}
}

function applyBrandColors(primary?: string | null, dark?: string | null, accent?: string | null) {
  const root = document.documentElement;
  if (primary) {
    root.style.setProperty("--brand-primary", primary);
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(primary);
    if (m) root.style.setProperty("--brand-primary-rgb", `${parseInt(m[1],16)} ${parseInt(m[2],16)} ${parseInt(m[3],16)}`);
  }
  if (dark) {
    root.style.setProperty("--brand-dark", dark);
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(dark);
    if (m) root.style.setProperty("--brand-dark-rgb", `${parseInt(m[1],16)} ${parseInt(m[2],16)} ${parseInt(m[3],16)}`);
  }
  if (accent) root.style.setProperty("--brand-accent", accent);
  // Persist so CandidateContext applies the right color on next page load
  try {
    localStorage.setItem(COLORS_CACHE_KEY, JSON.stringify({ primary, dark, accent }));
  } catch {}
}

// ─── Drop zone imagen ────────────────────────────────────────────────────────

type ImgDropProps = { label: string; value: string; onUrl: (url: string) => void; uploadFn: (file: File) => Promise<string> };

function ImageDrop({ label, value, onUrl, uploadFn }: ImgDropProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    if (!file.type.startsWith("image/")) { setErr("Solo imágenes (JPG, PNG, WebP)."); return; }
    if (file.size > 10 * 1024 * 1024) { setErr("Máximo 10 MB."); return; }
    setUploading(true); setErr(null);
    try { onUrl(await uploadFn(file)); }
    catch { setErr("Error al subir."); }
    finally { setUploading(false); }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
        onClick={() => !value && ref.current?.click()}
        className={cn(
          "relative rounded-xl border-2 transition-all duration-200 overflow-hidden",
          value ? "border-gray-200 cursor-default"
            : dragOver ? "border-brand-500 bg-brand-50 cursor-pointer"
            : "border-dashed border-gray-200 hover:border-brand-400 hover:bg-gray-50 cursor-pointer"
        )}
      >
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
        {value ? (
          <div className="relative group aspect-video">
            <img src={value} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
              <button type="button" onClick={(e) => { e.stopPropagation(); ref.current?.click(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-xs font-medium">
                <Upload size={12} /> Cambiar
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onUrl(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium">
                <X size={12} /> Quitar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
            {uploading ? <Loader2 size={24} className="animate-spin text-brand-400" /> : (
              <>
                <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                  <Image size={18} className="text-brand-500" />
                </div>
                <p className="text-xs text-gray-500 text-center">Arrastra o <span className="text-brand-500 font-medium">haz clic</span></p>
                <p className="text-[10px] text-gray-400">JPG, PNG, WebP · máx. 10 MB</p>
              </>
            )}
          </div>
        )}
      </div>
      {err && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{err}</p>}
    </div>
  );
}

// ─── Drop zone video ─────────────────────────────────────────────────────────

type VidDropProps = { label: string; value: string; onUrl: (url: string) => void; uploadFn: (file: File) => Promise<string> };

function VideoDrop({ label, value, onUrl, uploadFn }: VidDropProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [progress, setProgress]   = useState(0);
  const [err, setErr]             = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    if (!file.type.startsWith("video/")) { setErr("Solo archivos de video."); return; }
    if (file.size > 512 * 1024 * 1024) { setErr("Máximo 500 MB."); return; }
    setUploading(true); setErr(null); setProgress(0);
    const iv = setInterval(() => setProgress(p => Math.min(p + 8, 85)), 300);
    try { clearInterval(iv); setProgress(100); onUrl(await uploadFn(file)); }
    catch { clearInterval(iv); setErr("Error al subir."); }
    finally { setUploading(false); }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
        onClick={() => !value && ref.current?.click()}
        className={cn(
          "relative rounded-xl border-2 transition-all duration-200 overflow-hidden",
          value ? "border-gray-200 cursor-default"
            : dragOver ? "border-brand-500 bg-brand-50 cursor-pointer"
            : "border-dashed border-gray-200 hover:border-brand-400 hover:bg-gray-50 cursor-pointer"
        )}
      >
        <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
        {value ? (
          <div className="relative group aspect-video bg-black">
            <video src={value} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
              <button type="button" onClick={(e) => { e.stopPropagation(); ref.current?.click(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-xs font-medium">
                <Upload size={12} /> Cambiar
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onUrl(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium">
                <X size={12} /> Quitar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
            {uploading ? (
              <div className="w-full px-4 space-y-2">
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                  <Loader2 size={14} className="animate-spin text-brand-500" /> Subiendo...
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <>
                <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                  <Video size={18} className="text-brand-500" />
                </div>
                <p className="text-xs text-gray-500 text-center">Arrastra o <span className="text-brand-500 font-medium">haz clic</span></p>
                <p className="text-[10px] text-gray-400">MP4, WebM, MOV · máx. 500 MB</p>
              </>
            )}
          </div>
        )}
      </div>
      {err && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{err}</p>}
    </div>
  );
}

// ─── Preset card ─────────────────────────────────────────────────────────────

function PresetCard({
  preset, onActivate, onDelete, activating, deleting,
}: {
  preset: CandidatePreset;
  onActivate: () => void;
  onDelete: () => void;
  activating: boolean;
  deleting: boolean;
}) {
  return (
    <div className={cn(
      "relative bg-white border-2 rounded-2xl p-4 transition-all duration-200",
      preset.is_active
        ? "border-brand-500 shadow-md shadow-brand-500/10"
        : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
    )}>
      {preset.is_active && (
        <div className="absolute -top-2.5 left-4 flex items-center gap-1 bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          <Check size={9} /> ACTIVO
        </div>
      )}

      {/* Colores de marca */}
      <div className="flex items-center gap-1.5 mb-3">
        <div className="h-5 w-5 rounded-full border border-white ring-1 ring-gray-200 shadow-sm" style={{ backgroundColor: preset.color_primary || "#DC2626" }} />
        <div className="h-4 w-4 rounded-full border border-white ring-1 ring-gray-200" style={{ backgroundColor: preset.color_dark || "#7F1D1D" }} />
        <div className="h-3.5 w-3.5 rounded-full border border-white ring-1 ring-gray-200" style={{ backgroundColor: preset.color_accent || "#C9A84C" }} />
      </div>

      <p className="font-semibold text-gray-900 text-sm truncate">{preset.preset_name}</p>
      <p className="text-xs text-gray-400 truncate mt-0.5">{preset.name}</p>
      {preset.location && <p className="text-[10px] text-gray-400 truncate">{preset.location}</p>}

      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        {!preset.is_active && (
          <button
            onClick={onActivate}
            disabled={activating}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {activating ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            Activar
          </button>
        )}
        {preset.is_active && (
          <div className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-brand-50 text-brand-600 text-xs font-semibold">
            <Check size={11} /> Activo ahora
          </div>
        )}
        {!preset.is_active && (
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Eliminar preset"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CandidateProfilePage() {
  const { token } = useAuth();

  // Perfil activo (formulario)
  const [form, setForm]   = useState<Partial<CandidateProfile>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Presets
  const [presets, setPresets]             = useState<CandidatePreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [activatingId, setActivatingId]   = useState<number | null>(null);
  const [deletingId, setDeletingId]       = useState<number | null>(null);

  // Modal nuevo preset
  const [newPresetOpen, setNewPresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [savingPreset, setSavingPreset]   = useState(false);

  const loadPresets = useCallback(async () => {
    if (!token) return;
    setPresetsLoading(true);
    try {
      const list = await adminApiExtended.candidatePresets.list(token);
      setPresets(list);
    } catch {}
    finally { setPresetsLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      adminApiExtended.candidateProfile.get(token).then((p) => setForm(p ?? EMPTY)),
      loadPresets(),
    ])
      .catch(() => setError("No se pudo cargar el perfil."))
      .finally(() => setLoading(false));
  }, [token, loadPresets]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const updated = await adminApiExtended.candidateProfile.update(token, form);
      applyBrandColors(form.color_primary, form.color_dark, form.color_accent);
      updatePublicProfileCache(updated);
      await loadPresets();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Error al guardar. Revisa los datos."); }
    finally { setSaving(false); }
  };

  async function handleActivate(id: number) {
    if (!token) return;
    setActivatingId(id);
    try {
      const activated = await adminApiExtended.candidatePresets.activate(token, id);
      setForm(activated);
      applyBrandColors(activated.color_primary, activated.color_dark, activated.color_accent);
      updatePublicProfileCache(activated);
      await loadPresets();
    } catch {}
    finally { setActivatingId(null); }
  }

  async function handleDeletePreset(id: number) {
    if (!token) return;
    setDeletingId(id);
    try {
      await adminApiExtended.candidatePresets.delete(token, id);
      await loadPresets();
    } catch {}
    finally { setDeletingId(null); }
  }

  async function handleSaveAsPreset(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newPresetName.trim()) return;
    setSavingPreset(true);
    try {
      await adminApiExtended.candidatePresets.create(token, {
        ...form,
        preset_name: newPresetName.trim(),
        is_active: false,
      });
      setNewPresetOpen(false);
      setNewPresetName("");
      await loadPresets();
    } catch {}
    finally { setSavingPreset(false); }
  }

  const uploadPhoto = async (file: File) => {
    if (!token) throw new Error("No token");
    const photo = await adminApiExtended.candidateProfile.uploadPhoto(token, file);
    return photo.url;
  };

  const uploadVideo = async (file: File) => {
    if (!token) throw new Error("No token");
    const res = await adminApiExtended.candidateProfile.uploadVideo(token, file);
    return res.url;
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <PageHeader title="Perfil del Candidato" subtitle="Configura la identidad del candidato que verán los ciudadanos" />

      {/* ── Sección de Presets ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Perfiles guardados</p>
            <p className="text-xs text-gray-400 mt-0.5">Cambia de candidato con un click. El activo es el que ven los ciudadanos.</p>
          </div>
          <button
            onClick={() => { setNewPresetName(form.preset_name || ""); setNewPresetOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:border-brand-500/40 hover:text-brand-600 hover:bg-brand-50 transition-colors"
          >
            <Copy size={13} /> Guardar copia
          </button>
        </div>

        {presetsLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-brand-400" /></div>
        ) : presets.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No hay presets guardados aún.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {presets.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                onActivate={() => handleActivate(p.id)}
                onDelete={() => handleDeletePreset(p.id)}
                activating={activatingId === p.id}
                deleting={deletingId === p.id}
              />
            ))}
            {/* Tarjeta para agregar nuevo */}
            <button
              onClick={() => { setNewPresetName(""); setNewPresetOpen(true); }}
              className="border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-brand-400 hover:text-brand-500 hover:bg-brand-50 transition-colors min-h-[140px]"
            >
              <Plus size={20} />
              <span className="text-xs font-medium">Nuevo perfil vacío</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Formulario de edición del perfil activo ── */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {saved && (
        <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-green-700 text-sm flex items-center gap-2">
          <CheckCircle size={14} /> Perfil guardado correctamente.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Nombre del preset */}
        <Section title="Nombre del perfil">
          <Field label="Nombre interno del perfil (solo para el admin)" name="preset_name"
            value={form.preset_name ?? ""} onChange={handleChange}
            placeholder="Ej: James Cueva - Alcalde 2026" />
        </Section>

        {/* Identidad */}
        <Section title="Identidad pública">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Nombre completo *" name="name" value={form.name} onChange={handleChange} required />
            <Field label="Cargo" name="title" value={form.title} onChange={handleChange} placeholder="Candidato a Alcalde Provincial" />
            <Field label="Ubicación" name="location" value={form.location} onChange={handleChange} placeholder="San Miguel · Cajamarca" />
            <Field label="Partido" name="party" value={form.party} onChange={handleChange} />
            <Field label="Número de lista" name="list_number" value={form.list_number} onChange={handleChange} />
            <Field label="Fecha de elección" name="election_date" value={form.election_date ?? ""} onChange={handleChange} placeholder="4 de octubre de 2026" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Field label="Frase (tagline)" name="tagline" value={form.tagline ?? ""} onChange={handleChange} />
          </div>
          <div className="mt-4">
            <FieldArea label="Biografía" name="bio" value={form.bio ?? ""} onChange={handleChange} rows={4} />
          </div>
        </Section>

        {/* Fotos y video */}
        <Section title="Fotos y video">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <ImageDrop label="Logo del partido (aparece en la nav)" value={form.logo_url ?? ""}
              onUrl={(url) => setForm((f) => ({ ...f, logo_url: url }))} uploadFn={uploadPhoto} />
            <ImageDrop label="Foto del candidato" value={form.photo_url ?? ""}
              onUrl={(url) => setForm((f) => ({ ...f, photo_url: url }))} uploadFn={uploadPhoto} />
            <ImageDrop label="Foto hero (fondo)" value={form.hero_photo_url ?? ""}
              onUrl={(url) => setForm((f) => ({ ...f, hero_photo_url: url }))} uploadFn={uploadPhoto} />
            <VideoDrop label="Video hero" value={form.hero_video_url ?? ""}
              onUrl={(url) => setForm((f) => ({ ...f, hero_video_url: url }))} uploadFn={uploadVideo} />
          </div>
        </Section>

        {/* Colores */}
        <Section title="Colores de campaña">
          <p className="text-xs text-gray-400 mb-4">Al guardar, el color cambia en todo el sistema (admin + sitio público) de inmediato.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ColorField label="Color principal" name="color_primary" value={form.color_primary ?? "#DC2626"} onChange={handleChange} />
            <ColorField label="Color oscuro" name="color_dark" value={form.color_dark ?? "#7F1D1D"} onChange={handleChange} />
            <ColorField label="Color acento" name="color_accent" value={form.color_accent ?? "#C9A84C"} onChange={handleChange} />
          </div>
        </Section>

        {/* Redes sociales */}
        <Section title="Redes sociales">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="TikTok URL" name="tiktok_url" value={form.tiktok_url ?? ""} onChange={handleChange} placeholder="https://tiktok.com/@..." />
            <Field label="Facebook URL" name="facebook_url" value={form.facebook_url ?? ""} onChange={handleChange} placeholder="https://facebook.com/..." />
            <Field label="Instagram URL" name="instagram_url" value={form.instagram_url ?? ""} onChange={handleChange} placeholder="https://instagram.com/..." />
            <Field label="WhatsApp (con código país)" name="whatsapp_number" value={form.whatsapp_number ?? ""} onChange={handleChange} placeholder="51999000000" />
          </div>
        </Section>

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors shadow-sm">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Guardando..." : "Guardar cambios del perfil activo"}
        </button>
      </form>

      {/* Modal guardar copia como nuevo preset */}
      <Modal open={newPresetOpen} onClose={() => setNewPresetOpen(false)} title="Guardar como nuevo perfil" size="md">
        <form onSubmit={handleSaveAsPreset} className="space-y-4">
          <p className="text-sm text-gray-500">
            Se guardará una copia del perfil actual (o uno vacío si vienes del botón +).
            Puedes editarlo después activándolo.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Nombre del perfil *</label>
            <input
              autoFocus
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Ej: María García - Regidora"
              required
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/10 transition-colors"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setNewPresetOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={savingPreset}
              className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {savingPreset ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingPreset ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 md:p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, name, value, onChange, placeholder, required }: {
  label: string; name: string; value: string | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">{label}</span>
      <input name={name} value={value ?? ""} onChange={onChange} placeholder={placeholder} required={required}
        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors" />
    </label>
  );
}

function FieldArea({ label, name, value, onChange, rows }: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">{label}</span>
      <textarea name={name} value={value} onChange={onChange} rows={rows ?? 3}
        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors resize-none" />
    </label>
  );
}

function ColorField({ label, name, value, onChange }: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" name={name} value={value} onChange={onChange}
          className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 bg-transparent p-0.5" />
        <input type="text" name={name} value={value} onChange={onChange}
          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors" />
      </div>
    </label>
  );
}
