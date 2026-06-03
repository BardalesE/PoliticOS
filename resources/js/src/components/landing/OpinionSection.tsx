"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, Send, CheckCircle2, MapPin, User, ChevronDown } from "lucide-react";
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

export function OpinionSection() {
  const { profile, districts } = useCandidate();
  const [form, setForm] = useState<FormState>({ name: "", district: "", topic: "", message: "" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const shortName = profile.name.split(" ")[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) return;
    setLoading(true);

    // Si hay WhatsApp, abre con el mensaje pre-armado
    if (profile.whatsapp_number) {
      const text = [
        `*Opinión ciudadana — Campaña ${shortName}*`,
        form.name    ? `👤 ${form.name}`    : "",
        form.district? `📍 ${form.district}` : "",
        form.topic   ? `🏷 ${form.topic}`    : "",
        `💬 ${form.message}`,
      ].filter(Boolean).join("\n");

      const number = profile.whatsapp_number.replace(/[^0-9]/g, "");
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
    }

    // Simular envío (200ms) y mostrar éxito
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setSent(true);
  };

  const reset = () => {
    setForm({ name: "", district: "", topic: "", message: "" });
    setSent(false);
  };

  return (
    <section id="opiniones" className="relative py-20 md:py-28 px-5 overflow-hidden" style={{ background: "var(--page-soft)" }}>
      {/* Fondo decorativo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 60% at 0% 100%, var(--brand-soft-bg) 0%, transparent 55%)" }}
      />

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">

          {/* ── Columna izquierda: texto ── */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-extrabold uppercase tracking-[2px] px-4 py-2 rounded-full mb-6">
              <MessageSquarePlus size={11} />
              Tu opinión importa
            </span>

            <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 leading-tight mb-4">
              Dile a {shortName}{" "}
              <span
                style={{
                  background: "var(--brand-grad)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                lo que piensas.
              </span>
            </h2>

            <p className="text-ink-500 text-base leading-relaxed font-medium mb-8">
              Tu voz construye el plan de gobierno. Cada opinión es leída y tomada en cuenta para mejorar las propuestas.
            </p>

            {/* Promesas */}
            <div className="space-y-3">
              {[
                "Tu opinión llega directamente al equipo",
                "Sin filtros ni intermediarios políticos",
                "Respuesta en menos de 48 horas",
              ].map((item, i) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
                  className="flex items-center gap-3"
                >
                  <div
                    className="w-6 h-6 rounded-full flex-shrink-0 grid place-items-center"
                    style={{ background: "var(--brand-grad)" }}
                  >
                    <CheckCircle2 size={13} className="text-white" />
                  </div>
                  <span className="text-ink-600 text-sm font-semibold">{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ── Columna derecha: formulario ── */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <div
              className="bg-white rounded-2xl border border-ink-200 p-6 sm:p-8"
              style={{ boxShadow: "0 8px 40px var(--brand-glow-10)" }}
            >
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
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-500 mb-1.5">
                        Tu nombre <span className="text-ink-300 font-normal normal-case tracking-normal">(opcional)</span>
                      </label>
                      <div className="relative">
                        <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                        <input
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
                        <label className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-500 mb-1.5">
                          Tu caserío
                        </label>
                        <div className="relative">
                          <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                          <select
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
                        <label className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-500 mb-1.5">
                          Tema
                        </label>
                        <div className="relative">
                          <select
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
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-500 mb-1.5">
                        Tu mensaje <span className="text-brand-500">*</span>
                      </label>
                      <textarea
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
                      disabled={loading || !form.message.trim()}
                      whileHover={{ scale: loading ? 1 : 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-extrabold uppercase tracking-wider text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: "var(--brand-grad)",
                        boxShadow: "0 6px 20px var(--brand-glow-30)",
                      }}
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

                    <p className="text-center text-[11px] text-ink-400 font-medium">
                      {profile.whatsapp_number
                        ? "Se enviará vía WhatsApp al equipo de campaña."
                        : "Tu mensaje será revisado por el equipo de campaña."}
                    </p>
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
                      style={{ background: "var(--brand-grad)", boxShadow: "0 8px 24px var(--brand-glow-35)" }}
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
          </motion.div>
        </div>
      </div>
    </section>
  );
}
