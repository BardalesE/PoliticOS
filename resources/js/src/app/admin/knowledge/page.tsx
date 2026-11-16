"use client";
import { PlanGate } from "@/components/admin/PlanGate";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText, Trash2, Loader2, Eye, EyeOff, BookOpen, Tag, RefreshCw,
  Sparkles, X, Plus, Search, CheckCircle2, AlertTriangle, FileSearch, Users,
} from "lucide-react";
import { FilePreviewModal } from "@/components/admin/FilePreviewModal";
import { KnowledgeUploadPanel } from "@/components/admin/KnowledgeUploadPanel";
import { KnowledgeAnalysisModal } from "@/components/admin/KnowledgeAnalysisModal";
import { Modal } from "@/components/admin/Modal";
import { adminApi, adminApiExtended, type KnowledgeDocument, type CandidatePreset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isHojaDeVida(doc: KnowledgeDocument): boolean {
  return doc.topic === "hoja_de_vida";
}

// Plan de Gobierno primero, Hoja de Vida después, el resto al final.
const TOPIC_ORDER: Record<string, number> = { plan_de_gobierno: 0, hoja_de_vida: 1 };
function topicRank(topic: string | null | undefined): number {
  return topic && topic in TOPIC_ORDER ? TOPIC_ORDER[topic] : 2;
}

type StatusFilter = "all" | "sin_analizar" | "pendiente" | "procesando" | "listo" | "error";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all",         label: "Todos" },
  { value: "sin_analizar", label: "Sin analizar" },
  { value: "pendiente",   label: "En cola" },
  { value: "procesando",  label: "Analizando" },
  { value: "listo",       label: "Listo" },
  { value: "error",       label: "Error" },
];

function docStatusBadge(doc: KnowledgeDocument): { label: string; className: string } {
  switch (doc.analysis_status) {
    case "procesando":
      return { label: `Analizando ${doc.analysis_progress ?? 0}%`, className: "bg-blue-50 text-blue-600 border-blue-100" };
    case "pendiente":
      return { label: "En cola", className: "bg-amber-50 text-amber-600 border-amber-100" };
    case "listo":
      return { label: "Listo", className: "bg-green-50 text-green-600 border-green-100" };
    case "error":
      return { label: "Error", className: "bg-red-50 text-red-600 border-red-100" };
    default:
      return { label: "Sin analizar", className: "bg-gray-100 text-gray-500 border-gray-200" };
  }
}

const STAGE_LABELS: Record<string, string> = {
  extrayendo: "Extrayendo el PDF",
  dividiendo: "Dividiendo en secciones",
  resumiendo_secciones: "Resumiendo secciones",
  consolidando: "Consolidando por eje",
  generando_faqs: "Generando preguntas frecuentes",
  embeddings: "Generando embeddings",
  listo: "Listo",
};

/** "Resumiendo secciones 34 de 150" cuando hay conteo; si no, la etiqueta genérica de la etapa. */
function stageLabel(doc: KnowledgeDocument): string {
  if (doc.analysis_stage === "resumiendo_secciones" && doc.sections_total) {
    return `Resumiendo secciones ${doc.sections_done ?? 0} de ${doc.sections_total}`;
  }
  return (doc.analysis_stage && STAGE_LABELS[doc.analysis_stage]) || "Procesando";
}

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms > 0 ? ms / 60000 : 0;
}

function fmtMinutes(mins: number): string {
  const m = Math.round(mins);
  return m <= 0 ? "menos de 1 min" : `${m} min`;
}

/** "lleva 12 min" desde que se encoló/empezó el análisis real. */
function elapsedLabel(doc: KnowledgeDocument): string | null {
  const mins = minutesSince(doc.analysis_started_at);
  return mins === null ? null : `lleva ${fmtMinutes(mins)}`;
}

/** ETA por ritmo real de secciones procesadas — solo tiene sentido mientras se resumen secciones. */
function etaLabel(doc: KnowledgeDocument): string | null {
  if (doc.analysis_stage !== "resumiendo_secciones") return null;
  const elapsed = minutesSince(doc.analysis_started_at);
  const done = doc.sections_done ?? 0;
  const total = doc.sections_total ?? 0;
  if (!elapsed || elapsed <= 0 || done <= 0 || total <= done) return null;
  const rate = done / elapsed; // secciones por minuto
  if (rate <= 0) return null;
  const remaining = (total - done) / rate;
  return `faltan ~${fmtMinutes(remaining)}`;
}

/** "Analizado en 27 min · 214 páginas · 148 secciones · 42 FAQs" */
function listoSummary(doc: KnowledgeDocument): string {
  const parts: string[] = [];
  if (doc.analysis_started_at && doc.analysis_finished_at) {
    const mins = (new Date(doc.analysis_finished_at).getTime() - new Date(doc.analysis_started_at).getTime()) / 60000;
    parts.push(`Analizado en ${fmtMinutes(mins)}`);
  } else {
    parts.push("Analizado");
  }
  if (doc.pages?.length) parts.push(`${doc.pages.length} páginas`);
  if (doc.sections_total) parts.push(`${doc.sections_total} secciones`);
  if (doc.faqs_count) parts.push(`${doc.faqs_count} FAQs`);
  return parts.join(" · ");
}

type CandidateGroup = {
  key: string;
  name: string;
  candidateId: number | null;
  docs: KnowledgeDocument[];
};

type CandidateStatus = { key: "listo" | "incompleto" | "error"; label: string; detail?: string };

function candidateStatus(group: CandidateGroup): CandidateStatus {
  const plan = group.docs.find((d) => d.topic === "plan_de_gobierno");
  const hv   = group.docs.find((d) => d.topic === "hoja_de_vida");

  const hasError = group.docs.some((d) => d.status === "failed" || (!isHojaDeVida(d) && d.analysis_status === "error"));
  if (hasError) return { key: "error", label: "Con error" };

  const planListo = !!plan && plan.status === "ready" && plan.analysis_status === "listo";
  const hvLista   = !!hv && hv.status === "ready";
  if (planListo && hvLista) return { key: "listo", label: "Listo para presentar" };

  const missing: string[] = [];
  if (!plan) missing.push("falta el plan de gobierno");
  else if (plan.status !== "ready") missing.push("el plan todavía se está extrayendo");
  else if (plan.analysis_status !== "listo") missing.push("el plan no está analizado");
  if (!hv) missing.push("falta la hoja de vida");
  else if (hv.status !== "ready") missing.push("la hoja de vida todavía se está extrayendo");

  return { key: "incompleto", label: "Incompleto", detail: missing.join(" · ") };
}

const CANDIDATE_BADGE: Record<CandidateStatus["key"], string> = {
  listo:      "bg-green-50 text-green-700 border-green-200",
  incompleto: "bg-amber-50 text-amber-700 border-amber-200",
  error:      "bg-red-50 text-red-700 border-red-200",
};

function KnowledgePageInner() {
  const { token } = useAuth();
  const [docs, setDocs]             = useState<KnowledgeDocument[]>([]);
  const [candidates, setCandidates] = useState<CandidatePreset[]>([]);
  const [loading, setLoading]       = useState(true);
  const [preview, setPreview]       = useState<{ url: string; title: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [analysisDoc, setAnalysisDoc] = useState<{ id: number; title: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch]         = useState("");

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
  // profundo (en cola/analizando, disparado a mano con el botón "Analizar"):
  // mientras alguno siga en curso, refresca cada 3s. 'sin_analizar' es un
  // estado de reposo (la mayoría de los documentos viven ahí) — nunca debe
  // disparar polling por sí solo.
  useEffect(() => {
    const hasPending = docs.some(d =>
      d.status === "pending" || d.status === "processing" ||
      d.analysis_status === "pendiente" || d.analysis_status === "procesando"
    );
    if (!hasPending) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [docs, load]);

  const [analyzing, setAnalyzing] = useState<number | null>(null);
  async function analyze(id: number) {
    if (!token) return;
    setAnalyzing(id);
    try {
      const { doc } = await adminApi.knowledge.analyze(token, id);
      setDocs(prev => prev.map(d => d.id === id ? doc : d));
    } catch {}
    finally { setAnalyzing(null); }
  }

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

  const [cancelling, setCancelling] = useState<number | null>(null);
  async function cancelAnalysis(id: number) {
    if (!token) return;
    setCancelling(id);
    try {
      const { doc } = await adminApi.knowledge.cancelAnalysis(token, id);
      setDocs(prev => prev.map(d => d.id === id ? doc : d));
    } catch {}
    finally { setCancelling(null); }
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

  // ── Agrupar por candidato ──────────────────────────────────────────
  const groups = useMemo<CandidateGroup[]>(() => {
    const map = new Map<string, CandidateGroup>();
    for (const doc of docs) {
      const candidateId = doc.candidate_id ?? null;
      const key = candidateId ? String(candidateId) : "__generales__";
      if (!map.has(key)) {
        const name = candidateId
          ? candidates.find((c) => c.id === candidateId)?.name ?? `Candidato #${candidateId}`
          : "Generales";
        map.set(key, { key, name, candidateId, docs: [] });
      }
      map.get(key)!.docs.push(doc);
    }

    const list = Array.from(map.values());
    for (const g of list) {
      g.docs.sort((a, b) => topicRank(a.topic) - topicRank(b.topic) || a.title.localeCompare(b.title, "es"));
    }
    list.sort((a, b) => {
      if (a.candidateId === null) return 1;
      if (b.candidateId === null) return -1;
      return a.name.localeCompare(b.name, "es");
    });
    return list;
  }, [docs, candidates]);

  const counts = useMemo(() => {
    const analyzable = docs.filter((d) => !isHojaDeVida(d));
    return {
      candidatos:  groups.filter((g) => g.candidateId !== null).length,
      listos:      docs.filter((d) => d.topic === "plan_de_gobierno" && d.analysis_status === "listo").length,
      enProceso:   analyzable.filter((d) => d.analysis_status === "pendiente" || d.analysis_status === "procesando").length,
      conError:    analyzable.filter((d) => d.analysis_status === "error" || d.status === "failed").length,
      sinAnalizar: analyzable.filter((d) => !d.analysis_status || d.analysis_status === "sin_analizar").length,
    };
  }, [docs, groups]);

  // Punto 4: posición en cola — cuántos documentos "en cola/analizando" se
  // encolaron antes (analysis_started_at más temprano). Un solo worker
  // procesa en orden de llegada, así que es una buena aproximación de FIFO.
  const queueAhead = useMemo(() => {
    const active = docs
      .filter((d) => (d.analysis_status === "pendiente" || d.analysis_status === "procesando") && d.analysis_started_at)
      .sort((a, b) => new Date(a.analysis_started_at!).getTime() - new Date(b.analysis_started_at!).getTime());
    const map = new Map<number, number>();
    active.forEach((d, i) => map.set(d.id, i));
    return map;
  }, [docs]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groups
      .map((g) => {
        if (term && !g.name.toLowerCase().includes(term)) return null;
        let filteredDocs = g.docs;
        if (statusFilter !== "all") {
          filteredDocs = g.docs.filter((d) => (d.analysis_status ?? "sin_analizar") === statusFilter);
        }
        if (filteredDocs.length === 0) return null;
        return { ...g, docs: filteredDocs };
      })
      .filter((g): g is CandidateGroup => g !== null);
  }, [groups, search, statusFilter]);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <BookOpen size={20} className="text-brand-500" />
            <h1 className="font-serif text-xl font-bold text-gray-900">Base de Conocimiento</h1>
          </div>
          <p className="text-sm text-gray-400">
            Control de calidad por candidato antes de presentarlo: plan de gobierno, hoja de vida y demás documentos.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors shadow-sm shrink-0"
        >
          <Plus size={16} /> Nuevo documento
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {[
          { label: "Candidatos",   value: counts.candidatos },
          { label: "Planes listos", value: counts.listos },
          { label: "En proceso",   value: counts.enProceso },
          { label: "Con error",    value: counts.conError },
          { label: "Sin analizar", value: counts.sinAnalizar },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
            <p className="font-serif text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros + buscador */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar candidato..."
            className="pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                statusFilter === f.value
                  ? "bg-brand-500 border-brand-500 text-white"
                  : "bg-white border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="ml-auto p-2 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
          title="Refrescar"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Lista agrupada por candidato */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={20} className="animate-spin text-brand-400" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center bg-white border border-gray-200 rounded-2xl">
          <BookOpen size={32} className="text-gray-300" />
          <p className="text-sm text-gray-400">
            {docs.length === 0 ? "No hay documentos todavía." : "Nada coincide con el filtro/búsqueda actual."}
          </p>
          {docs.length === 0 && (
            <p className="text-xs text-gray-400">Sube el plan de gobierno o la hoja de vida de un candidato para empezar.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const status = group.candidateId !== null ? candidateStatus(group) : null;
            return (
              <div key={group.key} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/70">
                  <div className="flex items-center gap-2">
                    {group.candidateId === null
                      ? <FileText size={14} className="text-gray-400" />
                      : <Users size={14} className="text-brand-500" />}
                    <p className="text-sm font-bold text-gray-900">{group.name}</p>
                    <span className="text-[10px] text-gray-400">({group.docs.length} doc.{group.docs.length !== 1 ? "s" : ""})</span>
                  </div>
                  {status && (
                    <span
                      className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border", CANDIDATE_BADGE[status.key])}
                      title={status.detail}
                    >
                      {status.key === "listo" && <CheckCircle2 size={10} />}
                      {status.key !== "listo" && <AlertTriangle size={10} />}
                      {status.label}{status.detail ? `: ${status.detail}` : ""}
                    </span>
                  )}
                </div>

                <ul className="divide-y divide-gray-100">
                  {group.docs.map((doc) => {
                    const badge = docStatusBadge(doc);
                    const hojaDeVida = isHojaDeVida(doc);
                    return (
                      <li key={doc.id} className={cn("flex flex-col sm:flex-row sm:items-start gap-3 px-5 py-4", !doc.is_active && "opacity-50")}>
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
                          <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
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
                                <span className="text-red-600">⚠ Error al procesar</span>
                              </>
                            )}
                          </div>
                          {doc.status === "failed" && doc.error_message && (
                            <p className="mt-1 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                              {doc.error_message}
                            </p>
                          )}

                          {/* Análisis profundo: NUNCA para hojas de vida (requisito explícito) —
                              solo tiene sentido una vez extraído el texto (status=ready). */}
                          {!hojaDeVida && doc.status === "ready" && (
                            <div className="mt-2 flex flex-col gap-1.5 text-[10px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border font-medium", badge.className)}>
                                  {badge.label}
                                </span>

                                {doc.analysis_status === "procesando" && (
                                  <div className="h-1.5 w-28 rounded-full bg-gray-100 overflow-hidden">
                                    <div className="h-full bg-brand-400 transition-all" style={{ width: `${doc.analysis_progress ?? 0}%` }} />
                                  </div>
                                )}
                                {doc.analysis_status === "pendiente" && (
                                  <div className="h-1.5 w-28 rounded-full bg-gray-100 overflow-hidden" />
                                )}

                                {(!doc.analysis_status || doc.analysis_status === "sin_analizar") && (
                                  <button
                                    onClick={() => analyze(doc.id)}
                                    disabled={analyzing === doc.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                                  >
                                    {analyzing === doc.id ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                                    Analizar plan completo
                                  </button>
                                )}

                                {(doc.analysis_status === "pendiente" || doc.analysis_status === "procesando") && (
                                  <button
                                    onClick={() => cancelAnalysis(doc.id)}
                                    disabled={cancelling === doc.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                  >
                                    {cancelling === doc.id ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
                                    Cancelar
                                  </button>
                                )}

                                {doc.analysis_status === "listo" && (
                                  <>
                                    <span className="text-gray-400">
                                      {doc.analyzed_at ? new Date(doc.analyzed_at).toLocaleDateString("es-PE") : ""}
                                    </span>
                                    <button
                                      onClick={() => setAnalysisDoc({ id: doc.id, title: doc.title })}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
                                    >
                                      <FileSearch size={9} /> Ver análisis
                                    </button>
                                    <button
                                      onClick={() => retryAnalysis(doc.id)}
                                      disabled={retrying === doc.id}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                    >
                                      {retrying === doc.id ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                                      Volver a analizar
                                    </button>
                                  </>
                                )}

                                {doc.analysis_status === "error" && (
                                  <button
                                    onClick={() => retryAnalysis(doc.id)}
                                    disabled={retrying === doc.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                  >
                                    {retrying === doc.id ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                                    Reintentar
                                  </button>
                                )}
                              </div>

                              {/* Punto 3: etapa + tiempo transcurrido/restante mientras procesa. */}
                              {doc.analysis_status === "procesando" && (
                                <p className="text-gray-400">
                                  {stageLabel(doc)}
                                  {elapsedLabel(doc) ? ` · ${elapsedLabel(doc)}` : ""}
                                  {etaLabel(doc) ? ` · ${etaLabel(doc)}` : ""}
                                </p>
                              )}
                              {/* Punto 4: posición en cola mientras espera a que el worker la tome. */}
                              {doc.analysis_status === "pendiente" && (
                                <p className="text-gray-400">
                                  {(queueAhead.get(doc.id) ?? 0) > 0
                                    ? `En cola — ${queueAhead.get(doc.id)} documento${(queueAhead.get(doc.id) ?? 0) > 1 ? "s" : ""} por delante`
                                    : "En cola — es el siguiente"}
                                </p>
                              )}
                              {/* Punto 5: resumen al terminar. */}
                              {doc.analysis_status === "listo" && (
                                <p className="text-gray-400">{listoSummary(doc)}</p>
                              )}
                              {/* Punto 6: en qué etapa falló y cuánto llevaba. */}
                              {doc.analysis_status === "error" && (
                                <p className="text-gray-400">
                                  {doc.analysis_stage ? `Falló en «${STAGE_LABELS[doc.analysis_stage] ?? doc.analysis_stage}»` : "Falló el análisis"}
                                  {doc.analysis_started_at && doc.analysis_finished_at
                                    ? ` · llevaba ${fmtMinutes((new Date(doc.analysis_finished_at).getTime() - new Date(doc.analysis_started_at).getTime()) / 60000)}`
                                    : ""}
                                </p>
                              )}
                            </div>
                          )}
                          {!hojaDeVida && doc.analysis_status === "error" && doc.analysis_error && (
                            <p className="mt-1 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                              {doc.analysis_error}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 self-end sm:self-start">
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
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Nuevo documento" size="md">
        <KnowledgeUploadPanel
          candidates={candidates}
          onUploaded={(doc) => { setDocs(prev => [doc, ...prev]); setUploadOpen(false); }}
        />
      </Modal>

      <KnowledgeAnalysisModal
        docId={analysisDoc?.id ?? null}
        title={analysisDoc?.title ?? ""}
        onClose={() => setAnalysisDoc(null)}
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

export default function KnowledgePage() {
  return (
    <PlanGate feature="knowledge">
      <KnowledgePageInner />
    </PlanGate>
  );
}
