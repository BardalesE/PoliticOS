"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, CheckCircle2, MapPin, User, ChevronDown, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TenantLink } from "@/components/ui/TenantLink";
import { useCandidate } from "@/context/CandidateContext";

interface FormState {
  name: string;
  district: string;
  topic: string;
  message: string;
}

const TOPICS = [
  "Agua y saneamiento",
  "Carreteras e infraestructura",
  "Salud",
  "Educación",
  "Seguridad ciudadana",
  "Economía y empleo",
  "Medio ambiente",
  "Otro",
];

/**
 * Formulario de opinión ciudadana como Modal (Fase 7): antes era la sección
 * scrolleable <section id="opiniones"> de la home; ahora lo abre el botón
 * "Dile qué necesita tu caserío" de DosVias. Mismo formulario y misma lógica
 * de canal honesto (channelAvailable/WhatsApp) — solo cambió el contenedor.
 * Hereda del Modal genérico: focus-trap, retorno de foco, Escape, scroll-lock.
 */
export function OpinionModal({ onClose }: { onClose: () => void }) {
  const { profile, districts } = useCandidate();
  const [form, setForm] = useState<FormState>({ name: "", district: "", topic: "", message: "" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const shortName = profile.name.split(" ")[0];

  // WhatsApp es hoy el único canal real de este formulario: sin número
  // configurado no hay a dónde enviar el mensaje, así que no se simula
  // un envío exitoso — se deshabilita el submit y se ofrece el chat.
  const channelAvailable = !!profile.whatsapp_number;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim() || !channelAvailable) return;
    setLoading(true);

    const text = [
      `*Opinión ciudadana — Campaña ${shortName}*`,
      form.name    ? `👤 ${form.name}`    : "",
      form.district? `📍 ${form.district}` : "",
      form.topic   ? `🏷 ${form.topic}`    : "",
      `💬 ${form.message}`,
    ].filter(Boolean).join("\n");

    const number = profile.whatsapp_number!.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");

    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setSent(true);
  };

  const reset = () => {
    setForm({ name: "", district: "", topic: "", message: "" });
    setSent(false);
  };

  return (
    <Modal label={`Dile a ${shortName} lo que piensas`} onClose={onClose} style={{ maxHeight: "min(90vh, 720px)" }}>
      <div className="p-6 sm:p-8 overflow-y-auto">
        {/* Header del modal */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="font-serif text-xl sm:text-2xl font-bold leading-tight" style={{ color: "var(--page-ink)" }}>
              Dile a {shortName}{" "}
              <span style={{ color: "rgb(var(--brand-primary-rgb))" }}>lo que piensas.</span>
            </h3>
            <p className="text-sm mt-1" style={{ color: "var(--page-ink-soft)" }}>
              Tu voz construye el plan de gobierno.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-black/5 shrink-0"
            style={{ color: "var(--page-ink)" }}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!sent ? (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* Nombre */}
              <div>
                <label htmlFor="opinion-name" className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-500 mb-1.5">
                  Tu nombre <span className="text-ink-400 font-normal normal-case tracking-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                  <input
                    id="opinion-name"
                    type="text"
                    placeholder="Ej: María López"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-ink-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-100 text-sm text-ink-800 placeholder:text-ink-300 outline-none transition-all duration-200 bg-white"
                  />
                </div>
              </div>

              {/* Caserío + Tema — fila */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="opinion-district" className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-500 mb-1.5">
                    Tu caserío
                  </label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                    <select
                      id="opinion-district"
                      value={form.district}
                      onChange={(e) => setForm({ ...form, district: e.target.value })}
                      className="w-full appearance-none pl-9 pr-8 py-3 rounded-xl border border-ink-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-100 text-sm text-ink-700 outline-none transition-all duration-200 bg-white cursor-pointer"
                    >
                      <option value="">Seleccionar</option>
                      {districts.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label htmlFor="opinion-topic" className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-500 mb-1.5">
                    Tema
                  </label>
                  <div className="relative">
                    <select
                      id="opinion-topic"
                      value={form.topic}
                      onChange={(e) => setForm({ ...form, topic: e.target.value })}
                      className="w-full appearance-none px-3 pr-8 py-3 rounded-xl border border-ink-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-100 text-sm text-ink-700 outline-none transition-all duration-200 bg-white cursor-pointer"
                    >
                      <option value="">Elegir</option>
                      {TOPICS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Mensaje */}
              <div>
                <label htmlFor="opinion-message" className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-500 mb-1.5">
                  Tu mensaje <span className="text-brand-500">*</span>
                </label>
                <textarea
                  id="opinion-message"
                  required
                  rows={4}
                  placeholder={`Escríbele directamente a ${shortName}...`}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-ink-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-100 text-sm text-ink-800 placeholder:text-ink-300 outline-none transition-all duration-200 bg-white resize-none leading-relaxed"
                />
              </div>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading || !form.message.trim() || !channelAvailable}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wide text-white transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "rgb(var(--brand-primary-rgb))" }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enviando…
                  </span>
                ) : (
                  <>
                    <Send size={15} /> Enviar mi opinión
                  </>
                )}
              </motion.button>

              {channelAvailable ? (
                <p className="text-center text-[11px] text-ink-400 font-medium">
                  Se enviará vía WhatsApp al equipo de campaña.
                </p>
              ) : (
                <p className="text-center text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Este canal aún no está disponible. Mientras tanto puedes{" "}
                  <TenantLink href="/chat" className="font-bold underline underline-offset-2">
                    escribirle al asistente de {shortName}
                  </TenantLink>
                  .
                </p>
              )}
            </motion.form>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-10 flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                className="w-16 h-16 rounded-full grid place-items-center mb-5"
                style={{ background: "rgb(var(--brand-primary-rgb))" }}
              >
                <CheckCircle2 size={30} className="text-white" />
              </motion.div>
              <h3 className="font-serif font-bold text-ink-900 text-xl mb-2">¡Gracias, {form.name || "ciudadano/a"}!</h3>
              <p className="text-ink-500 text-sm font-medium mb-6 leading-relaxed max-w-xs">
                Tu opinión ha sido enviada. {shortName} y su equipo la leerán con atención.
              </p>
              <button
                onClick={reset}
                className="text-brand-600 hover:text-brand-900 text-sm font-bold transition-colors border-b-2 border-brand-200 hover:border-brand-600 pb-0.5"
              >
                Enviar otra opinión
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
