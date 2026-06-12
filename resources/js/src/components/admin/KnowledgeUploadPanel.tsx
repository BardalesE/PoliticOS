"use client";
import { useRef, useState } from "react";
import {
  FileText, Upload, Loader2, CheckCircle, AlertCircle, X,
} from "lucide-react";
import { adminApi, type KnowledgeDocument, type CandidatePreset } from "@/lib/api";
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

export function KnowledgeUploadPanel({
  candidates,
  onUploaded,
}: {
  candidates: CandidatePreset[];
  onUploaded?: (doc: KnowledgeDocument) => void;
}) {
  const { token } = useAuth();
  const { topics } = useCandidate();
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

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
      onUploaded?.(doc);
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

  return (
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
  );
}
