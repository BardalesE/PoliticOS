"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, X, Download, Eye, ExternalLink } from "lucide-react";
import { request, type KnowledgeDocument } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";

const topicColors: Record<string, { bg: string; text: string }> = {
  agua:            { bg: "bg-cyan-50",    text: "text-cyan-700" },
  infraestructura: { bg: "bg-amber-50",   text: "text-amber-700" },
  salud:           { bg: "bg-rose-50",    text: "text-rose-700" },
  educacion:       { bg: "bg-violet-50",  text: "text-violet-700" },
  economia:        { bg: "bg-emerald-50", text: "text-emerald-700" },
  seguridad:       { bg: "bg-slate-50",   text: "text-slate-700" },
  general:         { bg: "bg-brand-50",   text: "text-brand-700" },
};

function topicColor(topic?: string | null) {
  if (!topic) return { bg: "bg-brand-50", text: "text-brand-700" };
  return topicColors[topic.toLowerCase()] ?? { bg: "bg-brand-50", text: "text-brand-700" };
}

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Modal PDF ─────────────────────────────────────────────────────────────────
function PdfModal({
  doc,
  onClose,
}: {
  doc: KnowledgeDocument;
  onClose: () => void;
}) {
  return (
    <Modal label={doc.title} onClose={onClose} className="max-w-4xl" style={{ height: "min(90vh, 800px)" }}>
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-5 border-b border-ink-100 bg-white shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex-shrink-0 grid place-items-center"
                style={{ background: "rgb(var(--brand-primary-rgb))" }}
              >
                <FileText size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-serif font-bold text-ink-800 text-base leading-snug truncate">
                  {doc.title}
                </h3>
                {doc.description && (
                  <p className="text-xs text-ink-400 mt-0.5 line-clamp-1">{doc.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  {doc.topic && (
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${topicColor(doc.topic).bg} ${topicColor(doc.topic).text}`}>
                      {doc.topic}
                    </span>
                  )}
                  {doc.file_size && (
                    <span className="text-[10px] text-ink-400 font-semibold">{formatSize(doc.file_size)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold transition-colors border border-brand-200"
              >
                <Download size={13} /> Descargar
              </a>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-ink-100 text-ink-400 hover:text-ink-700 transition-colors"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Visor PDF */}
          <div className="flex-1 bg-ink-100 relative">
            <iframe
              src={`${doc.file_url}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full h-full"
              title={doc.title}
            />
            {/* Fallback si el iframe no carga */}
            <noscript>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-100">
                <FileText size={48} className="text-ink-300" />
                <p className="text-ink-500 text-sm font-medium">No se puede previsualizar este PDF.</p>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-brand-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold"
                >
                  <ExternalLink size={14} /> Abrir en nueva pestaña
                </a>
              </div>
            </noscript>
          </div>
    </Modal>
  );
}

// ── Card de documento ─────────────────────────────────────────────────────────
function DocCard({
  doc,
  index,
  onClick,
}: {
  doc: KnowledgeDocument;
  index: number;
  onClick: () => void;
}) {
  const tc = topicColor(doc.topic);
  const size = formatSize(doc.file_size);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay: index * 0.07, type: "spring", stiffness: 80 }}
      whileHover={{ y: -2 }}
    >
      <button
        onClick={onClick}
        className="group w-full text-left bg-white rounded-2xl border border-ink-200 hover:border-brand-300 p-5 transition-colors duration-150 relative overflow-hidden"
      >
        {/* Barra top al hover */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left rounded-t-2xl"
          style={{ background: "rgb(var(--brand-primary-rgb))" }}
        />

        <div className="flex items-start gap-4">
          {/* Icono */}
          <div
            className="w-12 h-12 rounded-xl flex-shrink-0 grid place-items-center"
            style={{ background: "rgb(var(--brand-primary-rgb))" }}
          >
            <FileText size={22} className="text-white" />
          </div>

          <div className="min-w-0 flex-1">
            {/* Topic badge */}
            {doc.topic && (
              <span className={`inline-block text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full mb-1.5 ${tc.bg} ${tc.text}`}>
                {doc.topic}
              </span>
            )}
            <h3 className="font-serif font-bold text-ink-800 text-sm leading-snug group-hover:text-brand-800 transition-colors line-clamp-2">
              {doc.title}
            </h3>
            {doc.description && (
              <p className="text-ink-400 text-xs mt-1 line-clamp-2 leading-relaxed font-medium">
                {doc.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <span className="inline-flex items-center gap-1 text-brand-600 text-[11px] font-extrabold">
                <Eye size={11} /> Vista previa
              </span>
              {size && <span className="text-ink-300 text-[11px] font-semibold">PDF · {size}</span>}
            </div>
          </div>
        </div>
      </button>
    </motion.div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function DocumentsSection() {
  const [docs, setDocs]       = useState<KnowledgeDocument[]>([]);
  const [active, setActive]   = useState<KnowledgeDocument | null>(null);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    request<KnowledgeDocument[]>("/knowledge")
      .then((data) => setDocs(data.filter((d) => d.is_active)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (loaded && docs.length === 0) return null;

  return (
    <>
      <section id="documentos" className="relative py-20 md:py-28 px-5 overflow-hidden" style={{ background: "var(--page-soft)" }}>
        {/* Fondo decorativo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 50% at 100% 50%, var(--brand-soft-bg) 0%, transparent 60%)" }}
        />

        <div className="max-w-5xl mx-auto relative z-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="mb-12 flex flex-col sm:flex-row sm:items-end justify-between gap-6"
          >
            <div>
              <span
                className="inline-flex items-center gap-2 border text-ink-600 text-[11px] font-bold uppercase tracking-[1.5px] px-4 py-1.5 rounded-full mb-4"
                style={{ borderColor: "var(--page-line)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
                Documentos públicos
              </span>
              <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mt-2 leading-tight">
                Transparencia y{" "}
                <span style={{ color: "rgb(var(--brand-primary-rgb))" }}>
                  plan de gobierno.
                </span>
              </h2>
              <p className="text-ink-500 mt-2 font-medium text-sm">
                Haz clic en cualquier documento para leerlo directamente aquí.
              </p>
            </div>
          </motion.div>

          {/* Grid de documentos */}
          {docs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {docs.map((doc, i) => (
                <DocCard key={doc.id} doc={doc} index={i} onClick={() => setActive(doc)} />
              ))}
            </div>
          ) : (
            /* Skeleton mientras carga */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-ink-100 animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Modal */}
      <AnimatePresence>
        {active && <PdfModal doc={active} onClose={() => setActive(null)} />}
      </AnimatePresence>
    </>
  );
}
