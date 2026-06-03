"use client";
import { motion } from "framer-motion";
import { useCandidate } from "@/context/CandidateContext";

interface Stat { value: React.ReactNode; label: string }

export function StatsBar({ proposalsCount = 0 }: { proposalsCount?: number }) {
  const { districts } = useCandidate();

  const stats: Stat[] = [
    {
      value: <>{districts.length || 13}</>,
      label: "Caseríos visitados",
    },
    {
      value: <>100<em className="not-italic" style={{ color: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)" }}>d</em></>,
      label: "Plan de primeros 100 días",
    },
    {
      value: <>+{proposalsCount > 0 ? proposalsCount : 40}</>,
      label: "Propuestas concretas",
    },
    {
      value: <>24<em className="not-italic" style={{ color: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)" }}>/7</em></>,
      label: "Asistente IA disponible",
    },
  ];

  return (
    <section style={{ background: "var(--page-ink)" }}>
      <div className="max-w-5xl mx-auto px-5">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative text-center py-8 px-4"
              style={{
                borderRight: i < stats.length - 1 ? "1px solid rgba(255,255,255,0.10)" : undefined,
              }}
            >
              <span
                className="block font-serif font-semibold leading-none mb-2 text-white"
                style={{ fontSize: "clamp(32px,4vw,46px)" }}
              >
                {s.value}
              </span>
              <span className="block text-xs font-medium" style={{ color: "#a9bdb0" }}>
                {s.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
