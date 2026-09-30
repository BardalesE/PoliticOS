"use client";
import { useRef, useState } from "react";
import { AlertCircle, Check, ExternalLink, FileText, Loader2, Pencil, RotateCw, Trash2, Upload, X } from "lucide-react";
import { adminApi } from "@/lib/api";
import type { AdminCandidato, AdminDocumento } from "@/lib/directorio";
import { cn } from "@/lib/utils";

/**
 * Documentos de UN candidato del directorio: lista con estado, renombrar,
 * reintentar, eliminar y subir uno nuevo con su propio título.
 *
 * El título es lo que PEPA cita como fuente y lo que ve el ciudadano en la
 * ficha, por eso se pide explícito (antes "Otro documento — …" quedaba fijo).
 */

const TIPOS = [
  { value: "plan_de_gobierno", label: "Plan de Gobierno", topic: "plan_de_gobierno" },
  { value: "hoja_de_vida", label: "Hoja de Vida", topic: "hoja_de_vida" },
  { value: "propuestas", label: "Propuestas de campaña", topic: null },
  { value: "otro", label: "Otro", topic: null },
] as const;

type Tipo = (typeof TIPOS)[number]["value"];

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

const MAX_MB = 50;

function sugerido(tipo: Tipo, nombre: string): string {
  const t = TIPOS.find((x) => x.value === tipo)!;
  return tipo === "otro" ? "" : `${t.label} — ${nombre}`;
}

function peso(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function EstadoDoc({ d }: { d: AdminDocumento }) {
  if (d.status === "ready") {
    return <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 ring-1 ring-green-200">Listo</span>;
  }
  if (d.status === "failed") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200" title={d.error_message ?? undefined}>
        Falló
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600 ring-1 ring-brand-200">
      <Loader2 size={10} className="animate-spin" /> Procesando
    </span>
  );
}

function FilaDocumento({ d, token, onChanged }: { d: AdminDocumento; token: string; onChanged: () => void }) {
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(d.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "La acción falló."); return false; }
    finally { setBusy(false); }
  }

  async function guardar() {
    const t = titulo.trim();
    if (!t || t === d.title) { setEditando(false); setTitulo(d.title); return; }
    if (await run(() => adminApi.knowledge.update(token, d.id, { title: t }))) setEditando(false);
  }

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2.5">
        <FileText size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
        <div className="min-w-0 flex-1">
          {editando ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus className={inputCls} value={titulo} maxLength={255} aria-label="Título del documento"
                onChange={(e) => setTitulo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); guardar(); }
                  if (e.key === "Escape") { setEditando(false); setTitulo(d.title); }
                }}
              />
              <button type="button" onClick={guardar} disabled={busy} className="rounded-lg bg-brand-500 p-2 text-white disabled:opacity-50" aria-label="Guardar título">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button type="button" onClick={() => { setEditando(false); setTitulo(d.title); }} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Cancelar">
                <X size={14} />
              </button>
            </div>
          ) : (
            <p className="break-words text-sm font-medium text-gray-900">{d.title}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
            <EstadoDoc d={d} />
            {d.file_size ? <span>PDF · {peso(d.file_size)}</span> : null}
            {!d.is_active && <span className="text-amber-700">Inactivo</span>}
          </div>
          {d.status === "failed" && d.error_message && (
            <p className="mt-1 text-[11px] text-red-600">{d.error_message}</p>
          )}
          {error && <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600"><AlertCircle size={11} /> {error}</p>}
        </div>

        {!editando && (
          <div className="flex shrink-0 items-center gap-0.5">
            {d.file_url && (
              <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={`Abrir ${d.title}`} title="Abrir PDF">
                <ExternalLink size={14} />
              </a>
            )}
            <button type="button" onClick={() => setEditando(true)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={`Renombrar ${d.title}`} title="Renombrar">
              <Pencil size={14} />
            </button>
            {d.status === "failed" && (
              <button type="button" disabled={busy} onClick={() => run(() => adminApi.knowledge.reindex(token, d.id))} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50" aria-label="Reintentar procesamiento" title="Reintentar">
                <RotateCw size={14} className={busy ? "animate-spin" : undefined} />
              </button>
            )}
            <button
              type="button" disabled={busy}
              onClick={() => confirm(`¿Eliminar "${d.title}"? La IA dejará de usarlo y desaparece de la ficha.`) && run(() => adminApi.knowledge.delete(token, d.id))}
              className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label={`Eliminar ${d.title}`} title="Eliminar"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function SubirDocumento({ candidato, token, onDone }: { candidato: AdminCandidato; token: string; onDone: () => void }) {
  const [tipo, setTipo] = useState<Tipo>("plan_de_gobierno");
  const [titulo, setTitulo] = useState(() => sugerido("plan_de_gobierno", candidato.name));
  const [tituloTocado, setTituloTocado] = useState(false);
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function cambiarTipo(t: Tipo) {
    setTipo(t);
    if (!tituloTocado) setTitulo(sugerido(t, candidato.name));
  }

  function elegirArchivo(f: File | null) {
    setError(null);
    if (f && f.type !== "application/pdf") { setError("Solo se aceptan PDF."); return; }
    if (f && f.size > MAX_MB * 1024 * 1024) { setError(`El PDF pesa más de ${MAX_MB} MB.`); return; }
    setFile(f);
    // Sin título aún: propone el nombre del archivo, legible.
    if (f && !titulo.trim()) {
      setTitulo(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim());
      setTituloTocado(true);
    }
  }

  async function subir() {
    if (!file) return;
    const t = titulo.trim();
    if (!t) { setError("Escribe el título del documento: es lo que verá el ciudadano."); return; }
    setBusy(true); setError(null);
    try {
      const tipoDef = TIPOS.find((x) => x.value === tipo)!;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", t);
      fd.append("candidate_id", String(candidato.id));
      if (tipoDef.topic) fd.append("topic", tipoDef.topic);
      if (source.trim()) fd.append("source_url", source.trim());
      await adminApi.knowledge.upload(token, fd);
      setFile(null); setSource(""); setTituloTocado(false); setTitulo(sugerido(tipo, candidato.name));
      if (fileRef.current) fileRef.current.value = "";
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el documento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Agregar documento</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Tipo</span>
          <select className={inputCls} value={tipo} onChange={(e) => cambiarTipo(e.target.value as Tipo)}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Título del documento *</span>
          <input
            className={inputCls} value={titulo} maxLength={255} placeholder="Ej.: Propuestas Municipales 2027-2030"
            onChange={(e) => { setTitulo(e.target.value); setTituloTocado(true); }}
          />
          <span className="mt-1 block text-[11px] text-gray-400">Así aparece en la ficha y en las citas de la IA.</span>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Enlace al original en el JNE (opcional)</span>
          <input className={inputCls} type="url" placeholder="https://…" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs",
          file ? "border-brand-500/40 bg-brand-50 text-gray-800" : "border-gray-200 text-gray-500 hover:bg-gray-50",
        )}>
          <FileText size={14} className="shrink-0" aria-hidden />
          <span className="truncate">{file ? `${file.name} · ${peso(file.size)}` : "Elegir PDF…"}</span>
          <input ref={fileRef} type="file" accept="application/pdf" className="sr-only" onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
        </label>
        <button
          type="button" onClick={subir} disabled={!file || busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Subir PDF
        </button>
      </div>
      {error && <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} /> {error}</p>}
      <p className="mt-2 text-[11px] text-gray-400">PDF con texto (no escaneado), máx. {MAX_MB} MB. Se procesa solo en unos segundos.</p>
    </div>
  );
}

export function DocumentosPanel({ candidato, token, onChanged }: { candidato: AdminCandidato; token: string; onChanged: () => void }) {
  const docs = candidato.documentos ?? [];
  return (
    <div className="space-y-3 rounded-xl bg-gray-50 p-3 sm:p-4">
      {docs.length > 0 ? (
        <ul className="divide-y divide-gray-200 rounded-xl bg-white px-3 ring-1 ring-gray-200">
          {docs.map((d) => <FilaDocumento key={d.id} d={d} token={token} onChanged={onChanged} />)}
        </ul>
      ) : (
        <p className="rounded-xl bg-white px-3 py-4 text-center text-xs text-gray-500 ring-1 ring-gray-200">
          Sin documentos. Sube su Hoja de Vida y su Plan de Gobierno para poder publicarlo.
        </p>
      )}
      <SubirDocumento candidato={candidato} token={token} onDone={onChanged} />
    </div>
  );
}
