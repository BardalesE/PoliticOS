"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { MessageCircle, CheckCircle, Sparkles } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

const perks = [
  "Respuestas en menos de 3 segundos",
  "Disponible 24/7",
  "Sin promesas vacías",
];

const floatingParticles = [
  { id:  0, x:  8.3, y: 12.5, size: 3,   delay: 0,   duration: 5 },
  { id:  1, x: 23.7, y: 78.2, size: 2.5, delay: 0.8, duration: 6 },
  { id:  2, x: 41.1, y: 34.9, size: 4,   delay: 1.5, duration: 4 },
  { id:  3, x: 57.4, y: 61.0, size: 2,   delay: 0.3, duration: 7 },
  { id:  4, x: 72.8, y: 22.3, size: 3.5, delay: 2.1, duration: 5 },
  { id:  5, x: 85.2, y: 87.6, size: 2,   delay: 1.0, duration: 6 },
  { id:  6, x: 14.6, y: 54.1, size: 4.5, delay: 3.0, duration: 4 },
  { id:  7, x: 63.9, y: 91.4, size: 2.5, delay: 0.5, duration: 7 },
  { id:  8, x: 31.2, y: 8.7,  size: 3,   delay: 1.8, duration: 5 },
  { id:  9, x: 90.5, y: 44.3, size: 2,   delay: 2.5, duration: 6 },
  { id: 10, x: 48.7, y: 70.8, size: 3.5, delay: 0.7, duration: 4 },
  { id: 11, x: 77.3, y: 15.6, size: 2.5, delay: 1.3, duration: 7 },
];

export function FinalCTA() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  return (
    <section className="relative overflow-hidden py-24 md:py-36 px-5">
      {/* Fondo: gradiente azul profundo */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, #0F172A 0%, #7F1D1D 40%, #DC2626 70%, #EF4444 100%)",
        }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Orbs — CSS puro */}
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-brand-500/20 blur-3xl pointer-events-none anim-orb-1" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-brand-500/15 blur-3xl pointer-events-none anim-orb-2" />

      {/* Partículas flotantes — CSS puro */}
      {floatingParticles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-white/30 pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            animation: `particleDrift ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}

      {/* Contenido */}
      <div className="relative z-10 max-w-4xl mx-auto text-center">

        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <span className="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white/90 text-[10px] font-extrabold uppercase tracking-[2.5px] px-5 py-2.5 rounded-full">
            <Sparkles size={11} />
            Lista N°{profile.list_number || "1"} · {profile.party || "Perú Primero"}
            <Sparkles size={11} />
          </span>
        </motion.div>

        {/* Título */}
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: 0.08, type: "spring", stiffness: 70 }}
          className="font-serif font-extrabold text-white leading-[1.0] tracking-tight mb-6
            text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
        >
          No tengo millones.{" "}
          <br className="hidden sm:block" />
          <span
            style={{
              background: "linear-gradient(135deg, #FCA5A5, #FECACA)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Tengo tu confianza.
          </span>
        </motion.h2>

        {/* Línea decorativa */}
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-24 h-1 rounded-full bg-brand-400 mx-auto mb-8"
        />

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-base md:text-lg text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed font-medium"
        >
          Hazle una pregunta a {shortName}. Respuestas reales sobre {profile.location}, sin filtros.{" "}
          <span className="text-red-200 font-extrabold">Tu voto el 4 de octubre.</span>
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
        >
          <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/chat"
              className="inline-flex items-center justify-center gap-2.5 bg-white hover:bg-red-50 text-brand-900 px-9 py-4.5 rounded-xl text-base font-extrabold uppercase tracking-wider transition-all duration-200"
              style={{ boxShadow: "0 12px 40px rgba(255,255,255,0.2)", padding: "1.1rem 2.2rem" }}
            >
              <MessageCircle size={18} />
              Conversar con {shortName}
            </Link>
          </motion.div>

          <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/propuestas"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-9 py-4.5 rounded-xl text-base font-extrabold uppercase tracking-wider border border-white/25 transition-all duration-200"
              style={{ padding: "1.1rem 2.2rem" }}
            >
              Ver propuestas
            </Link>
          </motion.div>
        </motion.div>

        {/* Perks */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3"
        >
          {perks.map((p) => (
            <div key={p} className="flex items-center gap-2 text-sm text-white/55 font-semibold">
              <CheckCircle size={14} className="text-red-300 shrink-0" />
              {p}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
