"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { normalizeApiBase, tenantHeaders } from "@/lib/api";
import { getVisitorId } from "@/lib/segmentacion";

/**
 * Derechos ARCO (Ley 29733) desde /privacidad.
 *  - "Borrar los datos de este dispositivo": borrado inmediato en el servidor de
 *    todo lo ligado al identificador anónimo de este navegador + limpieza local.
 *  - Formulario: acceso, rectificación, cancelación, oposición o reclamo → queda
 *    registrado en el panel del superadmin con su plazo legal.
 */

const API = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

type Tipo = "acceso" | "rectificacion" | "cancelacion" | "oposicion" | "reclamo";

const TIPOS: { value: Tipo; label: string; help: string }[] = [
  { value: "acceso",        label: "Saber qué datos tienen de mí",   help: "Te enviamos qué datos tuyos guardamos y para qué. Plazo: 20 días hábiles." },
  { value: "cancelacion",   label: "Borrar mis datos",               help: "Si te registraste con WhatsApp o correo, borramos todo lo asociado. Plazo: 10 días hábiles." },
  { value: "rectificacion", label: "Corregir un dato",               help: "Dinos qué dato está mal y cuál es el correcto. Plazo: 10 días hábiles." },
  { value: "oposicion",     label: "Que dejen de usar mis datos",    help: "Dejamos de usarlos para la finalidad que indiques. Plazo: 10 días hábiles." },
  { value: "reclamo",       label: "Presentar un reclamo",           help: "Cuéntanos qué pasó. Lo revisa el responsable de la plataforma." },
];

type Result = { code: string; status: string; due_at: string | null; erased: boolean };

async function send(body: Record<string, unknown>): Promise<Result> {
  const r = await fetch(`${API}/privacidad/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...tenantHeaders() },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const first = j?.errors ? Object.values(j.errors as Record<string, string[]>)[0]?.[0] : null;
    throw new Error(first || j?.message || (r.status === 429 ? "Demasiados intentos. Prueba en una hora." : "No pudimos enviar tu solicitud."));
  }
  return j as Result;
}

/** Tras borrar en el servidor: fuera historial, zona recordada e identificador (se genera uno nuevo). */
function clearLocal() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.includes("politicos_") || k === "geo_banner_dismissed")
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}

const fmt = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }) : "";

export function PrivacyRequestForm() {
  const [busyErase, setBusyErase] = useState(false);
  const [erased, setErased]       = useState<Result | null>(null);

  const [tipo, setTipo]   = useState<Tipo>("acceso");
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [desc, setDesc]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [done, setDone]   = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function borrarDispositivo() {
    if (!confirm("Se borrarán tus conversaciones, tu zona y tus votos guardados desde este dispositivo. No se puede deshacer. ¿Continuar?")) return;
    setBusyErase(true);
    setError(null);
    try {
      const res = await send({ type: "cancelacion", erase_now: true, visitor_uuid: getVisitorId() || null });
      clearLocal();
      setErased(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos borrar tus datos.");
    } finally {
      setBusyErase(false);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await send({
        type: tipo,
        name: name.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        description: desc.trim() || null,
        visitor_uuid: getVisitorId() || null,
      });
      setDone(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar tu solicitud.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-[15px] text-ink-800 " +
    "focus:border-[#2F7D4F] focus:outline-none focus:ring-4 focus:ring-[#2F7D4F]/15";

  return (
    <div className="space-y-6">
      {/* Borrado inmediato */}
      <div className="rounded-2xl bg-[#EAF3E6] p-5 ring-1 ring-[#2F7D4F]/15">
        <h3 className="flex items-center gap-2 text-[17px] font-bold text-ink-800">
          <Trash2 size={18} aria-hidden /> Borrar los datos de este dispositivo
        </h3>
        <p className="mt-1 text-[14px] text-ink-600">
          Borra al instante, en nuestro servidor, las conversaciones, la zona y los votos que hiciste desde este
          navegador. No necesitas dar tu nombre.
        </p>
        {erased ? (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3 text-[14px] text-ink-700">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#2F7D4F]" aria-hidden />
            <span>Listo: tus datos de este dispositivo fueron borrados. Código de constancia: <strong>{erased.code}</strong>.</span>
          </p>
        ) : (
          <button
            type="button"
            onClick={borrarDispositivo}
            disabled={busyErase}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#14532D] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#0C3A1F] disabled:opacity-50"
          >
            {busyErase ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Trash2 size={16} aria-hidden />}
            Borrar mis datos de este dispositivo
          </button>
        )}
      </div>

      {/* Formulario ARCO */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h3 className="flex items-center gap-2 text-[17px] font-bold text-ink-800">
          <ShieldCheck size={18} aria-hidden /> Otra solicitud o un reclamo
        </h3>

        {done ? (
          <div role="status" className="mt-3 rounded-xl bg-[#F7FAF5] p-4 text-[14px] text-ink-700">
            <p className="flex items-center gap-2 font-bold text-ink-800">
              <CheckCircle2 size={18} className="text-[#2F7D4F]" aria-hidden /> Recibimos tu solicitud
            </p>
            <p className="mt-1">Tu código es <strong>{done.code}</strong>. Guárdalo.</p>
            {done.due_at && <p className="mt-1">Te responderemos a más tardar el <strong>{fmt(done.due_at)}</strong>.</p>}
          </div>
        ) : (
          <form onSubmit={enviar} className="mt-3 space-y-3">
            <fieldset>
              <legend className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-500">¿Qué necesitas?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TIPOS.map((t) => (
                  <label
                    key={t.value}
                    className={`cursor-pointer rounded-xl px-3 py-2.5 text-[14px] ring-1 transition ${
                      tipo === t.value ? "bg-[#EAF3E6] font-semibold text-ink-800 ring-[#2F7D4F]/40" : "bg-white text-ink-600 ring-black/10 hover:bg-[#F7FAF5]"
                    }`}
                  >
                    <input type="radio" name="tipo" value={t.value} checked={tipo === t.value} onChange={() => setTipo(t.value)} className="sr-only" />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-ink-500">{TIPOS.find((t) => t.value === tipo)?.help}</p>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pr-name" className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-ink-500">Nombre</label>
                <input id="pr-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="pr-email" className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-ink-500">Correo</label>
                <input id="pr-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={150} autoComplete="email" />
              </div>
              <div>
                <label htmlFor="pr-phone" className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-ink-500">WhatsApp</label>
                <input id="pr-phone" type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" />
              </div>
            </div>
            <p className="text-[12px] text-ink-400">Necesitamos un correo o un WhatsApp para responderte. Si te registraste en el chat, usa el mismo.</p>

            <div>
              <label htmlFor="pr-desc" className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-ink-500">Detalle</label>
              <textarea id="pr-desc" rows={4} className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} />
            </div>

            <button
              type="submit"
              disabled={busy || (!email.trim() && !phone.trim())}
              className="inline-flex items-center gap-2 rounded-full bg-[#14532D] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#0C3A1F] disabled:opacity-40"
            >
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
              Enviar solicitud
            </button>
          </form>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[14px] text-red-700">{error}</p>}
    </div>
  );
}
