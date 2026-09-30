"use client";
import { useRef, useState } from "react";
import { AlertCircle, Check, FileText, Loader2, Pencil, Trash2, Upload, UserPlus, X } from "lucide-react";
import { adminApi } from "@/lib/api";
import { directorioAdmin, type AdminCandidato, type AdminRegidor } from "@/lib/directorio";
import { cn } from "@/lib/utils";

/**
 * Lista de regidores de un candidato (la plancha). Cada regidor puede tener su
 * Hoja de Vida: se sube como documento del candidato (topic hoja_de_vida, así
 * PEPA aplica las mismas reglas de datos sensibles) y se vincula al regidor.
 */

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

const MAX_MB = 50;

function FilaRegidor({
  r, candidato, token, onChanged,
}: { r: AdminRegidor; candidato: AdminCandidato; token: string; onChanged: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(r.nombre);
  const [orden, setOrden] = useState(String(r.orden));
  const [busy, setBusy] = useState<null | "guardar" | "hv" | "borrar">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hv = r.knowledge_document_id ? candidato.documentos.find((d) => d.id === r.knowledge_document_id) : undefined;

  async function run(kind: "guardar" | "hv" | "borrar", fn: () => Promise<unknown>) {
    setBusy(kind); setError(null);
    try { await fn(); onChanged(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "La acción falló."); return false; }
    finally { setBusy(null); }
  }

  async function guardar() {
    const n = nombre.trim();
    const o = Math.max(1, Math.min(99, parseInt(orden, 10) || r.orden));
    if (!n) return;
    if (n === r.nombre && o === r.orden) { setEditando(false); return; }
    if (await run("guardar", () => directorioAdmin.updateRegidor(token, r.id, { nombre: n, orden: o }))) setEditando(false);
  }

  async function subirHv(f: File | null) {
    if (!f) return;
    if (f.type !== "application/pdf") { setError("Solo se aceptan PDF."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`El PDF pesa más de ${MAX_MB} MB.`); return; }
    await run("hv", async () => {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("title", `Hoja de Vida — ${r.cargo} ${r.orden}: ${r.nombre}`);
      fd.append("candidate_id", String(candidato.id));
      fd.append("topic", "hoja_de_vida");
      const doc = await adminApi.knowledge.upload(token, fd);
      // Reemplazo: la HV anterior deja de usarse en el chat.
      if (r.knowledge_document_id) {
        await adminApi.knowledge.update(token, r.knowledge_document_id, { is_active: false }).catch(() => {});
      }
      await directorioAdmin.updateRegidor(token, r.id, { knowledge_document_id: doc.id });
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        {editando ? (
          <div className="flex w-full items-center gap-1.5">
            <input className={cn(inputCls, "w-16 shrink-0 text-center")} value={orden} inputMode="numeric" aria-label="Número en la lista"
              onChange={(e) => setOrden(e.target.value.replace(/\D/g, ""))} />
            <input autoFocus className={inputCls} value={nombre} maxLength={150} aria-label="Nombre del regidor"
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); guardar(); }
                if (e.key === "Escape") { setEditando(false); setNombre(r.nombre); setOrden(String(r.orden)); }
              }} />
            <button type="button" onClick={guardar} disabled={!!busy} className="shrink-0 rounded-lg bg-brand-500 p-2 text-white disabled:opacity-50" aria-label="Guardar">
              {busy === "guardar" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button type="button" onClick={() => { setEditando(false); setNombre(r.nombre); setOrden(String(r.orden)); }}
              className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Cancelar"><X size={14} /></button>
          </div>
        ) : (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">{r.orden}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{r.nombre}</p>
              <p className="text-[11px] text-gray-500">{r.cargo}</p>
            </div>

            {/* Hoja de Vida */}
            {hv ? (
              <span className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                hv.status === "ready" ? "bg-green-50 text-green-700 ring-green-200"
                  : hv.status === "failed" ? "bg-red-50 text-red-700 ring-red-200"
                  : "bg-brand-500/10 text-brand-600 ring-brand-500/30",
              )} title={hv.error_message ?? undefined}>
                {hv.status === "ready" ? <FileText size={11} /> : hv.status === "failed" ? <AlertCircle size={11} /> : <Loader2 size={11} className="animate-spin" />}
                {hv.status === "ready" ? "Hoja de vida" : hv.status === "failed" ? "HV falló" : "Procesando"}
              </span>
            ) : (
              <span className="shrink-0 text-[11px] text-amber-700">Sin hoja de vida</span>
            )}

            <div className="flex shrink-0 items-center">
              <label className={cn("cursor-pointer rounded-lg p-2 text-brand-600 hover:bg-brand-500/10", busy && "pointer-events-none opacity-50")}
                title={hv ? "Reemplazar hoja de vida" : "Subir hoja de vida (PDF)"}>
                {busy === "hv" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span className="sr-only">{hv ? "Reemplazar" : "Subir"} hoja de vida de {r.nombre}</span>
                <input ref={fileRef} type="file" accept="application/pdf" className="sr-only" onChange={(e) => subirHv(e.target.files?.[0] ?? null)} />
              </label>
              <button type="button" onClick={() => setEditando(true)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={`Editar ${r.nombre}`} title="Editar">
                <Pencil size={14} />
              </button>
              <button type="button" disabled={!!busy}
                onClick={() => confirm(`¿Quitar a ${r.nombre} de la lista? Su hoja de vida deja de usarse en el chat.`) && run("borrar", () => directorioAdmin.removeRegidor(token, r.id))}
                className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label={`Quitar a ${r.nombre}`} title="Quitar">
                {busy === "borrar" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </>
        )}
      </div>
      {error && <p className="mt-1 flex items-center gap-1 pl-9 text-[11px] text-red-600"><AlertCircle size={11} /> {error}</p>}
    </li>
  );
}

export function RegidoresPanel({ candidato, token, onChanged }: { candidato: AdminCandidato; token: string; onChanged: () => void }) {
  const regidores = candidato.regidores ?? [];
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombres = texto.split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)-]?\s*/, "").trim()).filter(Boolean);

  async function agregar() {
    if (nombres.length === 0) return;
    setBusy(true); setError(null);
    try {
      await directorioAdmin.addRegidores(token, candidato.id, nombres);
      setTexto("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  }

  const conHv = regidores.filter((r) => r.knowledge_document_id).length;

  return (
    <div className="space-y-3 rounded-xl bg-gray-50 p-3 sm:p-4">
      {regidores.length > 0 ? (
        <>
          <p className="text-[11px] text-gray-500">{regidores.length} regidores · {conHv} con hoja de vida</p>
          <ul className="divide-y divide-gray-200 rounded-xl bg-white px-3 ring-1 ring-gray-200">
            {regidores.map((r) => <FilaRegidor key={r.id} r={r} candidato={candidato} token={token} onChanged={onChanged} />)}
          </ul>
        </>
      ) : (
        <p className="rounded-xl bg-white px-3 py-4 text-center text-xs text-gray-500 ring-1 ring-gray-200">
          Aún no hay regidores. Pega la lista del JNE abajo, un nombre por línea.
        </p>
      )}

      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Agregar regidores</p>
        <textarea
          rows={3} className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={"Un nombre por línea, en el orden de la lista:\nAna María Pérez Díaz\nLuis Alberto Quispe Rojas"}
          aria-label="Nombres de los regidores, uno por línea"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-400">Se numeran después del último. Luego sube la hoja de vida de cada uno con <Upload size={10} className="inline" />.</p>
          <button type="button" onClick={agregar} disabled={busy || nombres.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Agregar{nombres.length > 0 ? ` ${nombres.length}` : ""}
          </button>
        </div>
        {error && <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} /> {error}</p>}
      </div>
    </div>
  );
}
