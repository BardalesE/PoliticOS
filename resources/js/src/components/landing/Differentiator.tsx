"use client";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

/**
 * "¿Qué me hace diferente?" — una sola frase (profile.differentiator),
 * tratada tipográficamente grande para que se lea en 3 segundos de scroll,
 * en vez de una sección larga. Distinta de WhyRunning (motivación) y de
 * AchievementGrid (resultados): esta es la promesa de valor en una línea.
 */
export function Differentiator() {
  const { profile } = useCandidate();

  if (!profile.differentiator) return null;

  return (
    <section
      id="diferencia"
      className="py-20 md:py-24 px-5 text-center"
      style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 5%, var(--page-bg))" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl mx-auto"
      >
        <Sparkles size={22} className="mx-auto mb-5" style={{ color: "rgb(var(--brand-primary-rgb))" }} aria-hidden />
        <span
          className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-5"
          style={{ color: "rgb(var(--brand-primary-rgb))" }}
        >
          ¿Qué me hace diferente?
        </span>
        <p
          className="font-serif font-semibold leading-[1.25] tracking-tight"
          style={{ fontSize: "clamp(24px,3.6vw,38px)", color: "var(--page-ink)" }}
        >
          {profile.differentiator}
        </p>
      </motion.div>
    </section>
  );
}
