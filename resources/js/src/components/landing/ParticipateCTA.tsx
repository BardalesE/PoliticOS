"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageCircle, Send, CheckCircle2, HandHeart, Lightbulb, Users2, Megaphone,
  User, MapPin, ChevronDown, type LucideIcon,
} from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { useCandidate } from "@/context/CandidateContext";
import { ConcernsWidget } from "@/components/landing/ConcernsWidget";

type Mode = "voluntario" | "propuesta" | "reunion" | "difusion";

const MODES: { value: Mode; label: string; desc: string; icon: LucideIcon }[] = [
  { value: "voluntario", label: "Ser voluntario/a", desc: "Súmate al equipo de campo", icon: HandHeart },
  { value: "propuesta", label: "Traer una propuesta", desc: "Tienes una idea concreta", icon: Lightbulb },
  { value: "reunion", label: "Pedir una reunión", desc: "Quieres hablar en persona", icon: Users2 },
  { value: "difusion", label: "Ayudar a difundir", desc: "Comparte la campaña", icon: Megaphone },
];

const MODE_LABEL: Record<Mode, string> = {
  voluntario: "Ser voluntario/a",
  propuesta: "Traer una propuesta",
  reunion: "Pedir una reunión",
  difusion: "Ayudar a difundir",
};

interface FormState {
  name: string;
  phone: string;
  district: string;
  mode: Mode | "";
  message: string;
}

const EMPTY: FormState = { name: "", phone: "", district: "", mode: "", message: "" };

/**
 * "Participa con nosotros" — sección completa (no modal, a diferencia del
 * antiguo OpinionModal) que reemplaza a DosVias en el scroll narrativo:
 * acceso directo al chat + formulario de participación con modo elegible
 * (voluntario/propuesta/reunión/difusión) + lo que más preguntan los
 * caseríos (ConcernsWidget, reusado tal cual).
 */
export function ParticipateCTA() {
  const { profile, districts } = useCandidate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const shortName = profile.name.split(" ")[0];
  const channelAvailable = !!profile.whatsapp_number;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.mode || !channelAvailable) return;
    setLoading(true);

    const text = [
      `*Quiero participar — Campaña ${shortName}*`,
      `🙋 Modo: ${MODE_LABEL[form.mode]}`,
      form.name ? `👤 ${form.name}` : "",
      form.phone ? `📱 ${form.phone}` : "",
      form.district ? `📍 ${form.district}` : "",
      form.message ? `💬 ${form.message}` : "",
    ].filter(Boolean).join("\n");

    const number = profile.whatsapp_number!.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");

    await new Promise((r) => setTimeout(r, 700));
    setLoading(false);
    setSent(true);
  };

  return (
    <section id="participa" className="py-20 md:py-28 px-5" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 max-w-xl"
        >
          <span
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
            style={{ color: "rgb(var(--brand-primary-rgb))" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
            Participa con nosotros
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            Esto no lo hago{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
              solo.
            </em>
          </h2>
          <p className="mt-3 text-base" style={{ color: "var(--page-ink-soft)" }}>
            Elige cómo quieres sumarte — {shortName} lee cada mensaje, no su equipo.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-8 items-start">
          {/* ── Formulario de participación ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-3 bg-white rounded-[20px] p-5 sm:p-7"
            style={{ border: "1px solid var(--page-line)" }}
          >
            <AnimatePresence mode="wait">
              {!sent ? (
                <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleSubmit} className="space-y-5">
                  {/* Modo de participación */}
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider mb-2" style={{ color: "var(--page-ink-soft)" }}>
                      ¿Cómo quieres participar? <span style={{ color: "rgb(var(--brand-primary-rgb))" }}>*</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {MODES.map(({ value, label, desc, icon: Icon }) => {
                        const active = form.mode === value;
                        return (
                          <button
                            type="button"
                            key={value}
                            onClick={() => setForm({ ...form, mode: value })}
                            className="flex items-start gap-2.5 p-3 rounded-xl text-left transition-colors"
                            style={{
                              border: `1.5px solid ${active ? "rgb(var(--brand-primary-rgb))" : "var(--page-line)"}`,
                              background: active ? "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 6%, transparent)" : "transparent",
                            }}
                          >
                            <Icon size={17} className="shrink-0 mt-0.5" style={{ color: "rgb(var(--brand-primary-rgb))" }} />
                            <span className="min-w-0">
                              <span className="block text-xs font-bold leading-tight" style={{ color: "var(--page-ink)" }}>{label}</span>
                              <span className="block text-[11px] mt-0.5" style={{ color: "var(--page-ink-soft)" }}>{desc}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Nombre + WhatsApp */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="part-name" className="block text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: "var(--page-ink-soft)" }}>
                        Tu nombre
                      </label>
                      <div className="relative">
                        <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--page-ink-soft)" }} />
                        <input
                          id="part-name"
                          type="text"
                          placeholder="Ej: María López"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition-all duration-200 bg-white"
                          style={{ borderColor: "var(--page-line)", color: "var(--page-ink)" }}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="part-phone" className="block text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: "var(--page-ink-soft)" }}>
                        Tu WhatsApp <span className="font-normal normal-case tracking-normal opacity-70">(opcional)</span>
                      </label>
                      <input
                        id="part-phone"
                        type="tel"
                        placeholder="999 999 999"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all duration-200 bg-white"
                        style={{ borderColor: "var(--page-line)", color: "var(--page-ink)" }}
                      />
                    </div>
                  </div>

                  {/* Barrio */}
                  {districts.length > 0 && (
                    <div>
                      <label htmlFor="part-district" className="block text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: "var(--page-ink-soft)" }}>
                        Tu barrio o caserío
                      </label>
                      <div className="relative">
                        <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--page-ink-soft)" }} />
                        <select
                          id="part-district"
                          value={form.district}
                          onChange={(e) => setForm({ ...form, district: e.target.value })}
                          className="w-full appearance-none pl-9 pr-8 py-3 rounded-xl border text-sm outline-none transition-all duration-200 bg-white cursor-pointer"
                          style={{ borderColor: "var(--page-line)", color: "var(--page-ink)" }}
                        >
                          <option value="">Seleccionar</option>
                          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--page-ink-soft)" }} />
                      </div>
                    </div>
                  )}

                  {/* Mensaje */}
                  <div>
                    <label htmlFor="part-message" className="block text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: "var(--page-ink-soft)" }}>
                      Cuéntanos más <span className="font-normal normal-case tracking-normal opacity-70">(opcional)</span>
                    </label>
                    <textarea
                      id="part-message"
                      rows={3}
                      placeholder="Ej: Puedo ayudar los fines de semana en mi caserío..."
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all duration-200 bg-white resize-none leading-relaxed"
                      style={{ borderColor: "var(--page-line)", color: "var(--page-ink)" }}
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={loading || !form.mode || !channelAvailable}
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
                      <><Send size={15} /> Enviar por WhatsApp</>
                    )}
                  </motion.button>

                  {channelAvailable ? (
                    <p className="text-center text-[11px] font-medium" style={{ color: "var(--page-ink-soft)" }}>
                      Se abrirá WhatsApp con tu mensaje listo para enviar al equipo de campaña.
                    </p>
                  ) : (
                    <p className="text-center text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      Este canal aún no está disponible. Mientras tanto puedes{" "}
                      <TenantLink href="/chat" className="font-bold underline underline-offset-2">
                        escribirle al asistente de {shortName}
                      </TenantLink>.
                    </p>
                  )}
                </motion.form>
              ) : (
                <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-10 flex flex-col items-center text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                    className="w-16 h-16 rounded-full grid place-items-center mb-5"
                    style={{ background: "rgb(var(--brand-primary-rgb))" }}
                  >
                    <CheckCircle2 size={30} className="text-white" />
                  </motion.div>
                  <h3 className="font-serif font-bold text-xl mb-2" style={{ color: "var(--page-ink)" }}>
                    ¡Gracias, {form.name || "vecino/a"}!
                  </h3>
                  <p className="text-sm font-medium mb-6 leading-relaxed max-w-xs" style={{ color: "var(--page-ink-soft)" }}>
                    Tu mensaje ya va camino al equipo de campaña. Nos pondremos en contacto pronto.
                  </p>
                  <button
                    onClick={() => { setForm(EMPTY); setSent(false); }}
                    className="text-sm font-bold border-b-2 pb-0.5 transition-colors"
                    style={{ color: "rgb(var(--brand-primary-rgb))", borderColor: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 40%, transparent)" }}
                  >
                    Enviar otro mensaje
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── Columna lateral: chat directo + lo que más preguntan ── */}
          <div className="lg:col-span-2 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <TenantLink
                href="/chat"
                className="flex items-center gap-3 w-full bg-white rounded-2xl p-4 transition-colors duration-150"
                style={{ border: "1px solid var(--page-line)" }}
              >
                <div
                  className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                  style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 10%, transparent)" }}
                >
                  <MessageCircle size={19} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight truncate" style={{ color: "var(--page-ink)" }}>
                    Pregúntale a {shortName}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--page-ink-soft)" }}>
                    Respuesta al toque, por IA
                  </p>
                </div>
              </TenantLink>
            </motion.div>

            <ConcernsWidget />
          </div>
        </div>
      </div>
    </section>
  );
}
