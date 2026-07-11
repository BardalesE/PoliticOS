"use client";
import { motion } from "framer-motion";
import { useCandidate } from "@/context/CandidateContext";
import type { HomeSettings } from "@/lib/api";

interface Stat { value: React.ReactNode; label: string }

const BRAND_EM = { color: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)" };

export function StatsBar({
  proposalsCount = 0,
  settings = {},
}: {
  proposalsCount?: number;
  settings?: HomeSettings;
}) {
  const { districts } = useCandidate();

  // Solo cifras reales del tenant: las stats de caseríos y propuestas se
  // ocultan si no hay datos, en vez de mostrar un número inventado (antes
  // había fallbacks fijos de "13" y "+40"). Las etiquetas son configurables
  // desde /admin/home-settings (keys stats_*_label).
  const stats = [
    districts.length > 0 && {
      value: <>{districts.length}</>,
      label: settings.stats_districts_label || "Caseríos visitados",
    },
    {
      value: <>100<em className="not-italic" style={BRAND_EM}>d</em></>,
      label: settings.stats_plan_label || "Plan de primeros 100 días",
    },
    proposalsCount > 0 && {
      value: <>+{proposalsCount}</>,
      label: settings.stats_proposals_label || "Propuestas concretas",
    },
    {
      value: <>24<em className="not-italic" style={BRAND_EM}>/7</em></>,
      label: settings.stats_ai_label || "Asistente IA disponible",
    },
  ].filter(Boolean) as Stat[];

  return (
    <section style={{ background: "var(--page-ink)" }}>
      <div className="max-w-5xl mx-auto px-5">
        {/* En md+ las celdas se reparten el ancho disponible sea cual sea
            la cantidad de stats visibles (2, 3 o 4) */}
        <div className="grid grid-cols-2 md:flex">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative text-center py-8 px-4 md:flex-1"
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
              <span className="block text-xs font-medium" style={{ color: "#b5afa3" }}>
                {s.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
