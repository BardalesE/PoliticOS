"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageCircle, FileText, MapPin, Calendar, ArrowRight } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

export function AssistantPreview() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  const cards = [
    {
      href:    "/chat",
      eyebrow: "Chatbot IA · 24/7",
      title:   `Pregúntale a ${shortName}`,
      desc:    "Respuestas reales en segundos, sin filtros.",
      icon:    MessageCircle,
      big:     true,
    },
    {
      href:    "/propuestas",
      eyebrow: "Plan de gobierno",
      title:   "Ver propuestas",
      desc:    "Todo lo que haremos en 4 años.",
      icon:    FileText,
      big:     false,
    },
    {
      href:    "/distritos",
      eyebrow: "13 distritos",
      title:   "Explorar distritos",
      desc:    "Propuestas por cada comunidad.",
      icon:    MapPin,
      big:     false,
    },
    {
      href:    "/#eventos",
      eyebrow: "Agenda",
      title:   "Próximos eventos",
      desc:    "Actos, mítines y caravanas.",
      icon:    Calendar,
      big:     false,
    },
  ];

  return (
    <section id="asistente" className="bg-white py-20 md:py-28 px-5 overflow-hidden">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-12"
        >
          <span className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-extrabold uppercase tracking-[2px] px-4 py-2 rounded-full mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            Servicios al ciudadano
          </span>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 leading-tight mt-3">
            Cuatro formas de{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #DC2626, #EF4444)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              conectar hoy.
            </span>
          </h2>
        </motion.div>

        {/* Grid: 1 card grande + 3 pequeñas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Card grande */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0 }}
            className="sm:row-span-2 lg:row-span-1"
          >
            <motion.div
              whileHover={{ y: -6, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              style={{ boxShadow: "0 16px 48px rgba(220,38,38,0.35)" }}
              className="relative overflow-hidden rounded-2xl h-full min-h-[220px]"
            >
              <Link href="/chat" className="block h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-700 to-brand-900" />

                {/* Orb decorativo */}
                <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />
                <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-brand-500/20 blur-xl pointer-events-none" />

                <div className="relative z-10 p-7 flex flex-col h-full">
                  <div className="mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 grid place-items-center mb-5 backdrop-blur-sm border border-white/20">
                      <MessageCircle size={26} className="text-white" />
                    </div>
                    <p className="text-brand-200 text-[10px] font-extrabold uppercase tracking-[2px] mb-1">
                      Chatbot IA · 24/7
                    </p>
                    <h3 className="font-serif font-bold text-white text-2xl leading-tight">
                      Pregúntale a {shortName}
                    </h3>
                    <p className="text-white/65 text-sm mt-2 font-medium leading-relaxed">
                      Respuestas reales en segundos, sin filtros ni promesas vacías.
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-2 text-white/90 text-sm font-bold">
                    Iniciar chat <ArrowRight size={14} />
                  </div>
                </div>
              </Link>
            </motion.div>
          </motion.div>

          {/* Cards pequeñas */}
          {cards.slice(1).map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.href + c.title}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: 0.1 + i * 0.09 }}
              >
                <motion.div
                  whileHover={{ y: -5, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  style={{ boxShadow: "0 8px 32px rgba(220,38,38,0.10)" }}
                  className="rounded-2xl overflow-hidden h-full"
                >
                  <Link href={c.href} className="block h-full">
                    <div className="bg-white border border-brand-100 hover:border-brand-300 rounded-2xl p-6 flex items-start gap-4 transition-colors duration-200 h-full">
                      <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-200 grid place-items-center flex-shrink-0">
                        <Icon size={22} className="text-brand-700" />
                      </div>
                      <div>
                        <p className="text-brand-500 text-[10px] font-extrabold uppercase tracking-[1.5px] mb-0.5">
                          {c.eyebrow}
                        </p>
                        <h3 className="font-serif font-bold text-ink-800 text-base leading-snug">
                          {c.title}
                        </h3>
                        <p className="text-ink-500 text-xs mt-1 font-medium leading-relaxed">
                          {c.desc}
                        </p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
