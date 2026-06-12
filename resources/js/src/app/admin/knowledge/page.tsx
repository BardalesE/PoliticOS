"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Upload, Trash2, Loader2, CheckCircle,
  AlertCircle, Eye, EyeOff, BookOpen, Tag, RefreshCw, X,
} from "lucide-react";
import { FilePreviewModal } from "@/components/admin/FilePreviewModal";
import { adminApi, adminApiExtended, type KnowledgeDocument, type CandidatePreset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCandidate } from "@/context/CandidateContext";
import { FormField } from "@/components/admin/FormField";
import { cn } from "@/lib/utils";

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type UploadState = "idle" | "uploading" | "done" | "error";

export default function KnowledgePage() {
  const { token } = useAuth();
  const { topics } = useCandidate();
  const [docs, setDocs]         = useState<KnowledgeDocument[]>([]);
  const [preview, setPreview]   = useState<{ url: string; title: string } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress]       = useState(0);

  const [newTitle, setNewTitle]       = useState("");
  const [newDesc, setNewDesc]         = useState("");
  const [newTopic, setNewTopic]       = useState("");
  const [newCandidateId, setNewCandidateId] = useState("");
  const [newSourceUrl, setNewSourceUrl]     = useState("");
  const [newSourceType, setNewSourceType]   = useState("pdf");
  const [candidates, setCandidates]   = useState<CandidatePreset[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

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

  function onFileSelect(file: File) {
    if (file.type !== "application/pdf") {
      setUploadError("Solo se aceptan archivos PDF.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("El archivo no puede superar 50 MB.");
      return;
    }
    setPendingFile(file);
    setUploadError(null);
    if (!newTitle) setNewTitle(file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }

  async function handleUpload() {
    if (!token || !pendingFile || !newTitle.trim()) return;
    setUploadState("uploading");
    setUploadError(null);
    setProgress(0);

    const interval = setInterval(() => setProgress(p => Math.min(p + 6, 85)), 400);

    try {
      const fd = new FormData();
      fd.append("file",        pendingFile);
      fd.append("title",       newTitle.trim());
      fd.append("description", newDesc.trim());
      if (newTopic) fd.append("topic", newTopic);
      if (newCandidateId) fd.append("candidate_id", newCandidateId);
      if (newSourceUrl.trim()) fd.append("source_url", newSourceUrl.trim());
      if (newSourceType !== "pdf") fd.append("source_type", newSourceType);

      const doc = await adminApi.knowledge.upload(token, fd);
      clearInterval(interval);
      setProgress(100);
      setUploadState("done");
      setDocs(prev => [doc, ...prev]);
      setTimeout(() => {
        setUploadState("idle");
        setPendingFile(null);
        setNewTitle(""); setNewDesc(""); setNewTopic(""); setNewCandidateId("");
        setNewSourceUrl(""); setNewSourceType("pdf");
        setProgress(0);
      }, 2000);
    } catch (err: any) {
      clearInterval(interval);
      setUploadState("error");
      setUploadError(err?.message ?? "Error al subir el documento.");
    }
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
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Subir nuevo documento</p>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => !pendingFile && fileRef.current?.click()}
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200",
                pendingFile
                  ? "border-green-400 bg-green-50 cursor-default"
                  : dragOver
                  ? "border-brand-500 bg-brand-50 cursor-pointer"
                  : "border-gray-200 hover:border-brand-400 hover:bg-gray-50 cursor-pointer"
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); e.target.value = ""; }}
                className="sr-only"
              />

              {pendingFile ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText size={24} className="text-green-500 shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">{pendingFile.name}</p>
                    <p className="text-xs text-gray-400">{fmtSize(pendingFile.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPendingFile(null); setNewTitle(""); }}
                    className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                    <Upload size={24} className="text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">Arrastra el PDF aquí</p>
                    <p className="text-xs text-gray-400">o haz clic para seleccionar · solo PDF · máx. 50 MB</p>
                  </div>
                </div>
              )}
            </div>

            {pendingFile && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <FormField
                  label="Título del documento *"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Plan de gobierno 2026, Propuesta de agua..."
                />
                <FormField
                  as="textarea"
                  label="Descripción (opcional)"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Qué contiene este documento..."
                />
                <FormField
                  as="select"
                  label="Tema"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  options={[
                    { value: "", label: "Sin tema (general)" },
                    ...topics.map((t) => ({ value: t.name, label: `${t.emoji} ${t.label}` })),
                  ]}
                />
                <FormField
                  as="select"
                  label="Candidato (modo PEPA)"
                  value={newCandidateId}
                  onChange={(e) => setNewCandidateId(e.target.value)}
                  options={[
                    { value: "", label: "Material general del tenant" },
                    ...candidates.map((c) => ({ value: String(c.id), label: c.name })),
                  ]}
                />
                <FormField
                  as="select"
                  label="Tipo de fuente"
                  value={newSourceType}
                  onChange={(e) => setNewSourceType(e.target.value)}
                  options={[
                    { value: "pdf",       label: "📄 Documento oficial (PDF)" },
                    { value: "interview", label: "🎙 Entrevista" },
                    { value: "debate",    label: "🗣 Debate" },
                    { value: "news",      label: "📰 Nota de prensa" },
                  ]}
                />
                <FormField
                  label="URL de la fuente original (opcional)"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="https://... (si se omite, se cita el PDF subido)"
                />
              </div>
            )}

            {uploadState === "uploading" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 size={14} className="animate-spin text-brand-500" />
                  Subiendo y extrayendo texto del PDF...
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-brand-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {uploadState === "done" && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                <CheckCircle size={14} /> Documento subido. El asistente ya puede usarlo.
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertCircle size={14} /> {uploadError}
              </div>
            )}

            {pendingFile && uploadState === "idle" && (
              <button
                onClick={handleUpload}
                disabled={!newTitle.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 shadow-sm"
              >
                <Upload size={14} />
                Subir e integrar a la IA
              </button>
            )}
          </div>

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
                        {doc.content && (
                          <>
                            <span>·</span>
                            <span className="text-green-600">✓ Texto extraído</span>
                          </>
                        )}
                        {doc.content === "" && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600">Sin texto (PDF imagen)</span>
                          </>
                        )}
                      </div>
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
