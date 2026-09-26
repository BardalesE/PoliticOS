"use client";
import { useState } from "react";
import { Star, X, Loader2, PartyPopper } from "lucide-react";
import { sendFeedback } from "@/lib/feedback";

/**
 * Modal "Califica la plataforma": 5 estrellas + comentario libre, opcional.
 * Anonimo por diseno (no pide nombre ni contacto).
 */
export function FeedbackModal({
  onClose, context = "chat", candidateSlug, tenantSlug,
}: {
  onClose: () => void;
  context?: "chat" | "home";
  candidateSlug?: string | null;
  tenantSlug?: string | null;
}) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (stars < 1 || sending) return;
    setSending(true);
    const ok = await sendFeedback({ stars, comment, context, candidateSlug, tenantSlug });
    setSending(false);
    if (ok) setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Califica la plataforma">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <PartyPopper size={36} style={{ color: "rgb(var(--brand-primary-rgb))" }} aria-hidden />
            <p className="text-[15px] font-bold text-gray-800">¡Gracias por tu calificación!</p>
            <p className="text-[13px] text-gray-500">Nos ayuda a mejorar PoliticOS para todos los ciudadanos.</p>
            <button type="button" onClick={onClose}
              className="mt-1 rounded-full px-5 py-2 text-[13px] font-bold text-white" style={{ background: "rgb(var(--brand-primary-rgb))" }}>
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="text-[16px] font-bold text-gray-800">¿Qué tan útil te parece PoliticOS?</h2>
              <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 text-gray-400 hover:text-gray-600">
                <X size={20} aria-hidden />
              </button>
            </div>
            <p className="mb-3 text-[12.5px] text-gray-500">Anónimo. Tu opinión nos ayuda a mejorar la plataforma.</p>

            <div className="flex items-center justify-center gap-1.5 py-2" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
                  onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setStars(n)}
                  className="p-1">
                  <Star size={34} strokeWidth={1.5}
                    className={(hover || stars) >= n ? "fill-amber-400 text-amber-400" : "text-gray-300"} />
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              placeholder="¿Qué le arreglarías o mejorarías? (opcional)"
              rows={3}
              className="mt-2 w-full resize-none rounded-xl border border-gray-200 p-3 text-[13.5px] text-gray-700 outline-none focus:border-brand-500"
            />

            <button type="button" disabled={stars < 1 || sending} onClick={submit}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[14px] font-bold text-white disabled:opacity-40"
              style={{ background: "rgb(var(--brand-primary-rgb))" }}>
              {sending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
              Enviar calificación
            </button>
          </>
        )}
      </div>
    </div>
  );
}
