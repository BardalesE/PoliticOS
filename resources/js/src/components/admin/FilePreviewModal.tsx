"use client";
import { useEffect } from "react";
import { X, FileText, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
};

function detectType(url: string): "pdf" | "image" | "video" | "doc" {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".pdf")) return "pdf";
  if (/\.(jpe?g|png|gif|webp|svg)$/.test(clean)) return "image";
  if (/\.(mp4|webm|ogg|mov|avi)$/.test(clean)) return "video";
  return "doc";
}

export function FilePreviewModal({ open, onClose, url, title }: Props) {
  const type = detectType(url);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <p className="text-sm font-semibold text-gray-900 truncate max-w-[70%]">
                {title ?? "Vista previa"}
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink size={13} /> Abrir en nueva pestaña
                </a>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {type === "pdf" && (
                <iframe
                  src={url}
                  title={title ?? "PDF"}
                  className="w-full h-full"
                  style={{ minHeight: "72vh" }}
                />
              )}
              {type === "image" && (
                <div
                  className="flex items-center justify-center h-full p-6 bg-gray-50"
                  style={{ minHeight: "60vh" }}
                >
                  <img
                    src={url}
                    alt={title}
                    className="max-w-full max-h-[75vh] object-contain rounded-xl shadow"
                  />
                </div>
              )}
              {type === "video" && (
                <div
                  className="flex items-center justify-center h-full bg-black"
                  style={{ minHeight: "50vh" }}
                >
                  <video
                    src={url}
                    controls
                    autoPlay
                    className="max-w-full max-h-[70vh] rounded-xl"
                  />
                </div>
              )}
              {type === "doc" && (
                <div
                  className="flex flex-col items-center justify-center py-16 gap-4"
                  style={{ minHeight: "40vh" }}
                >
                  <div className="h-16 w-16 rounded-2xl bg-brand-50 flex items-center justify-center">
                    <FileText size={28} className="text-brand-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-900 mb-1">
                      {title ?? "Documento"}
                    </p>
                    <p className="text-xs text-gray-400 mb-4">
                      Vista previa no disponible para este formato.
                    </p>
                    <a
                      href={url}
                      download
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-500 transition-colors"
                    >
                      <ExternalLink size={14} /> Descargar documento
                    </a>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
