"use client";

import { useEffect, useState } from "react";
import { confirmVerification, startVerification, type VerifyChannel } from "@/lib/verification";
import { getVisitorId } from "@/lib/segmentacion";

interface Props {
  channel: VerifyChannel;
  value: string;
  onChange: (v: string) => void;
  /** Contacto ya verificado (el padre lo guarda); coincide con `value` cuando está listo. */
  verifiedValue: string | null;
  onVerified: (v: string | null) => void;
  placeholder: string;
  /** Si el canal no se verifica en este servidor, es un campo normal. */
  verificationEnabled: boolean;
  tone?: "chat" | "brand";
}

// Clases estáticas (Tailwind no detecta nombres armados dinámicamente).
const TONES = {
  chat:  { ring: "focus:ring-chat-500", btn: "bg-chat-500 hover:bg-chat-600" },
  brand: { ring: "focus:ring-brand-500", btn: "bg-brand-600 hover:bg-brand-500" },
} as const;

/**
 * Campo de contacto con verificación por código: escribe el contacto → "Enviar código"
 * → escribe el código → verificado. Si el código falla, muestra el error y deja reintentar.
 */
export default function ContactVerifyField({
  channel, value, onChange, verifiedValue, onVerified, placeholder, verificationEnabled, tone = "chat",
}: Props) {
  const t = TONES[tone];
  const [step, setStep]       = useState<"idle" | "sent">("idle");
  const [code, setCode]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [masked, setMasked]   = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const clean    = value.trim();
  const verified = verificationEnabled && verifiedValue !== null && verifiedValue === clean;

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  function handleChange(v: string) {
    onChange(v);
    if (step !== "idle") { setStep("idle"); setCode(""); }
    setError(null);
    if (verifiedValue !== null) onVerified(null);
  }

  async function send() {
    setBusy(true);
    setError(null);
    const r = await startVerification(channel, clean, getVisitorId());
    setBusy(false);
    if (!r.ok) {
      setError(r.message ?? "No pudimos enviar el código.");
      if (r.retryAfter) setResendIn(r.retryAfter);
      return;
    }
    setStep("sent");
    setCode("");
    setMasked(r.masked ?? null);
    setResendIn(r.resendIn ?? 60);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await confirmVerification(channel, clean, code.trim(), getVisitorId());
    setBusy(false);
    if (!r.ok) {
      setError(r.message ?? "Código incorrecto.");
      setCode("");
      return;
    }
    setStep("idle");
    onVerified(clean);
  }

  const looksValid = channel === "email" ? /^\S+@\S+\.\S+$/.test(clean) : clean.replace(/\D/g, "").length >= 9;
  const where = channel === "email" ? "correo" : "WhatsApp";

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          type={channel === "email" ? "email" : "tel"}
          inputMode={channel === "email" ? "email" : "tel"}
          autoComplete={channel === "email" ? "email" : "tel"}
          className={`min-w-0 flex-1 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 ${t.ring} ${verified ? "border-green-400 bg-green-50" : "border-gray-300"}`}
        />
        {verificationEnabled && !verified && (
          <button
            type="button"
            onClick={send}
            disabled={!looksValid || busy || (step === "sent" && resendIn > 0)}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-40 transition ${t.btn}`}
          >
            {busy && step === "idle" ? "Enviando…" : step === "sent" ? (resendIn > 0 ? `Reenviar (${resendIn})` : "Reenviar") : "Enviar código"}
          </button>
        )}
        {verified && <span className="shrink-0 self-center text-xs font-medium text-green-600">✓ Verificado</span>}
      </div>

      {verificationEnabled && step === "sent" && !verified && (
        <div className="mt-2 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={`Código de 6 dígitos${masked ? ` enviado a ${masked}` : ""}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            className={`min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm tracking-widest focus:outline-none focus:ring-2 ${t.ring}`}
          />
          <button
            type="button"
            onClick={confirm}
            disabled={code.length !== 6 || busy}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-40 transition ${t.btn}`}
          >
            {busy ? "Verificando…" : "Verificar"}
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {verificationEnabled && !verified && step === "idle" && !error && (
        <p className="mt-1 text-[11px] text-gray-400">Te enviamos un código a tu {where} para confirmar que es tuyo.</p>
      )}
    </div>
  );
}
