"use client";
import { PlanGate } from "@/components/admin/PlanGate";
import { useCallback, useEffect, useState } from "react";
import {
  FileText, Trash2, Loader2,
  Eye, EyeOff, BookOpen, Tag, RefreshCw,
} from "lucide-react";
import { FilePreviewModal } from "@/components/admin/FilePreviewModal";
import { KnowledgeUploadPanel } from "@/components/admin/KnowledgeUploadPanel";
import { adminApi, adminApiExtended, type KnowledgeDocument, type CandidatePreset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function KnowledgePageInner() {
  const { token } = useAuth();
  const [docs, setDocs]         = useState<KnowledgeDocument[]>([]);
  const [preview, setPreview]   = useState<{ url: string; title: string } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [candidates, setCandidates] = useState<CandidatePreset[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.knowledge.list(token);
      setDocs(res.data);
      const presets = await adminApiExtended.candidatePresets.list(token);
      setCandidates(presets);
    } catch {}
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Pipeline de extracción (subida → cola → procesamiento → listo) Y análisis
  // profundo (chunking → MAP/REDUCE → embeddings, puede tardar minutos en un
  // plan de 200+ páginas): mientras alguno siga en curso, refresca cada 3s.
  useEffect(() => {
    const hasPending = docs.some(d =>
      d.status === "pending" || d.status === "processing" ||
      (d.status === "ready" && !["listo", "no_aplica", "error"].includes(d.analysis_status ?? ""))
    );
    if (!hasPending) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [docs, load]);

  const [retrying, setRetrying] = useState<number | null>(null);
  async function retryAnalysis(id: number) {
    if (!token) return;
    setRetrying(id);
    try {
      const { doc } = await adminApi.knowledge.retryAnalysis(token, id);
      setDocs(prev => prev.map(d => d.id === id ? doc : d));
    } catch {}
    finally { setRetrying(null); }
  }

  async function toggleActive(doc: KnowledgeDocument) {
    if (!token) return;
    try {
      const updated = await adminApi.knowledge.update(token, doc.id, { is_active: !doc.is_active });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
    } catch {}
  }

  async function handleDelete(id: number) {
    if (!token || !confirm("¿Eliminar este documento? La IA dejará de usarlo.")) return;
    try {
      await adminApi.knowledge.delete(token, id);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch {}
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <BookOpen size={20} className="text-brand-500" />
          <h1 className="font-serif text-xl font-bold text-gray-900">Base de Conocimiento</h1>
        </div>
        <p className="text-sm text-gray-400">
          Sube PDFs con planes de gobierno, propuestas o documentos. El asistente los leerá automáticamente para responder mejor.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Upload panel (left, 2/5) ── */}
        <div className="lg:col-span-2 space-y-4">
          <KnowledgeUploadPanel
            candidates={candidates}
            onUploaded={(doc) => setDocs(prev => [doc, ...prev])}
          />

          {/* Tip */}
          <div className="p-4 rounded-2xl bg-brand-50 border border-brand-100 text-xs text-gray-600 leading-relaxed">
            <strong className="text-brand-600">¿Cómo funciona?</strong> El sistema extrae el texto del PDF.
            Cada pregunta que reciba el asistente buscará en estos documentos para responder con datos reales.
            Los documentos con <strong className="text-brand-600">tema asignado</strong> se priorizan según el contexto.
          </div>
        </div>

        {/* ── Document list (right, 3/5) ── */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/70">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Documentos activos ({docs.filter(d => d.is_active).length} de {docs.length})
              </p>
              <button
                onClick={load}
                className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={20} className="animate-spin text-brand-400" />
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <BookOpen size={32} className="text-gray-300" />
                <p className="text-sm text-gray-400">No hay documentos todavía.</p>
                <p className="text-xs text-gray-400">Sube el plan de gobierno o propuestas para que el asistente las use.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {docs.map((doc) => (
                  <li key={doc.id} className={cn("flex items-start gap-4 px-5 py-4", !doc.is_active && "opacity-50")}>
                    <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={16} className="text-brand-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
                        {doc.topic && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-100 text-[10px] text-brand-600 font-medium">
                            <Tag size={9} /> {doc.topic}
                          </span>
                        )}
                        {doc.candidate_id && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-600 font-medium">
                            {candidates.find((c) => c.id === doc.candidate_id)?.name ?? `candidato #${doc.candidate_id}`}
                          </span>
                        )}
                        {doc.source_type && doc.source_type !== "pdf" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-[10px] text-amber-700 font-medium">
                            {{ interview: "entrevista", debate: "debate", news: "prensa" }[doc.source_type]}
                          </span>
                        )}
                        {!doc.is_active && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                            inactivo
                          </span>
                        )}
                      </div>
                      {doc.description && (
                        <p className="text-xs text-gray-400 truncate mb-1">{doc.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-gray-400">
                        <span>{doc.original_name ?? "documento.pdf"}</span>
                        <span>·</span>
                        <span>{fmtSize(doc.file_size)}</span>
                        {doc.status === "ready" && (
                          <>
                            <span>·</span>
                            <span className="text-green-600">✓ Texto extraído</span>
                          </>
                        )}
                        {(doc.status === "pending" || doc.status === "processing") && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 text-brand-500">
                              <Loader2 size={10} className="animate-spin" /> Procesando...
                            </span>
                          </>
                        )}
                        {doc.status === "failed" && (
                          <>
                            <span>·</span>
                            <span className="text-red-600" title={doc.error_message ?? undefined}>
                              ⚠ Error al procesar
                            </span>
                          </>
                        )}
                      </div>

                      {/* Análisis profundo: solo tiene sentido mostrarlo una vez que el
                          texto se extrajo (status=ready) — antes de eso no hay chunks.
                          'no_aplica' (hojas de vida, que nunca se analizan) no muestra nada. */}
                      {doc.status === "ready" && doc.analysis_status !== "listo" && doc.analysis_status !== "no_aplica" && (
                        <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                          {doc.analysis_status === "procesando" && (
                            <>
                              <div className="h-1.5 w-28 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                  className="h-full bg-brand-400 transition-all"
                                  style={{ width: `${doc.analysis_progress ?? 0}%` }}
                                />
                              </div>
                              <span className="text-gray-400">Analizando… {doc.analysis_progress ?? 0}%</span>
                            </>
                          )}
                          {(doc.analysis_status === "pendiente" || !doc.analysis_status) && (
                            <span className="text-gray-400">En cola para análisis…</span>
                          )}
                          {doc.analysis_status === "error" && (
                            <>
                              <span className="text-red-600" title={doc.analysis_error ?? undefined}>
                                ⚠ Análisis incompleto
                              </span>
                              <button
                                onClick={() => retryAnalysis(doc.id)}
                                disabled={retrying === doc.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {retrying === doc.id
                                  ? <Loader2 size={9} className="animate-spin" />
                                  : <RefreshCw size={9} />}
                                Reprocesar
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {doc.status === "ready" && doc.analysis_status === "listo" && (
                        <div className="mt-1.5 text-[10px] text-green-600">✓ Análisis completo (resumen, FAQs, búsqueda por página)</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setPreview({ url: doc.file_url, title: doc.title })}
                        className="p-2 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                        title="Ver PDF"
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        onClick={() => toggleActive(doc)}
                        className="p-2 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                        title={doc.is_active ? "Desactivar" : "Activar"}
                      >
                        {doc.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>

      <FilePreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        url={preview?.url ?? ""}
        title={preview?.title}
      />
    </div>
  );
}

export default function KnowledgePage() {
  return (
    <PlanGate feature="knowledge">
      <KnowledgePageInner />
    </PlanGate>
  );
}
