"use client";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";
import { EmphasisText } from "@/lib/textEmphasis";

/**
 * "¿Por qué quiero postular?" — carta abierta del candidato usando
 * profile.why_running (texto libre con párrafos separados por línea en
 * blanco). Distinta de la bio institucional de BioSection: aquí habla en
 * primera persona sobre su motivación, no sobre su trayectoria.
 */
export function WhyRunning() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  if (!profile.why_running) return null;

  const paragraphs = profile.why_running
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <section id="por-que" className="py-20 md:py-28 px-5" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <span
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
            style={{ color: "rgb(var(--brand-primary-rgb))" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
            Una carta abierta
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mb-8"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            ¿Por qué quiero{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
              postular?
            </em>
          </h2>

          <div
            className="relative rounded-[24px] bg-white p-7 sm:p-10"
            style={{ border: "1px solid var(--page-line)" }}
          >
            <Quote size={36} style={{ color: "rgb(var(--brand-primary-rgb))" }} className="opacity-25 mb-4" aria-hidden />
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="text-[16px] sm:text-[17px] leading-relaxed mb-5 last:mb-0"
                style={{ color: "var(--page-ink)", fontFamily: "var(--font-serif-body, inherit)" }}
              >
                <EmphasisText text={p} />
              </p>
            ))}
            <p className="mt-6 font-serif font-semibold text-lg" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
              — {shortName}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
