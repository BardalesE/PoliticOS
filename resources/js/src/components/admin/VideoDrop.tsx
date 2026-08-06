"use client";

import { useRef, useState } from "react";
import { Upload, X, Video, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Drop zone video ─────────────────────────────────────────────────────────
// Extraído de admin/candidate-profile para reusarlo en cualquier form que
// necesite subir un video (archivo real, no URL) — ver admin/districts.

type VideoDropProps = {
  label: string;
  value: string;
  onUrl: (url: string) => void;
  uploadFn: (file: File) => Promise<string>;
};

export function VideoDrop({ label, value, onUrl, uploadFn }: VideoDropProps) {
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
