"use client";

import { useRef, useState } from "react";
import { Upload, X, Image, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Drop zone imagen ────────────────────────────────────────────────────────
// Extraído de admin/candidate-profile para reusarlo en cualquier form que
// necesite subir una imagen (archivo real, no URL) — ver onboarding/page.tsx.

type ImageDropProps = {
  label: string;
  value: string;
  onUrl: (url: string) => void;
  uploadFn: (file: File) => Promise<string>;
};

export function ImageDrop({ label, value, onUrl, uploadFn }: ImageDropProps) {
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
