"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";

interface TopicCount {
  topic: string;
  count: number;
}

// Umbral mínimo para mostrar el widget — con muy pocas conversaciones el
// dato no es representativo y es mejor no mostrar nada (regla del proyecto:
// nunca conteos en cero o inventados).
const MIN_TOTAL_TO_SHOW = 5;
const MAX_ROWS = 4;

export function ConcernsWidget() {
  const { topics } = useCandidate();
  const [rows, setRows] = useState<TopicCount[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.analytics
      .summary()
      .then((r) => {
        if (cancelled) return;
        const filtered = (r.top_topics ?? [])
          .filter((t) => t.topic && t.topic !== "general" && t.count > 0)
          .slice(0, MAX_ROWS);
        setRows(filtered);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows) return null; // cargando: no mostrar placeholder falso

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total < MIN_TOTAL_TO_SHOW) return null; // sin datos suficientes: no mostrar

  const max = Math.max(...rows.map((r) => r.count));

  const labelFor = (slug: string) => {
    const t = topics.find((t) => t.name === slug);
    return t ? `${t.emoji ? `${t.emoji} ` : ""}${t.label}` : slug.charAt(0).toUpperCase() + slug.slice(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl p-4 sm:p-5"
      style={{ border: "1px solid var(--page-line)" }}
    >
      <p
        className="text-[10px] font-extrabold uppercase tracking-[1.5px] mb-0.5"
        style={{ color: "rgb(var(--brand-primary-rgb))" }}
      >
        Lo que más preguntan los caseríos
      </p>
      <p className="text-[11px] mb-4" style={{ color: "var(--page-ink-soft)" }}>
        Según las conversaciones reales con el asistente — solo conteos, ninguna pregunta identificable.
      </p>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.topic} className="flex items-center gap-3">
            <span className="text-xs w-28 shrink-0 truncate" style={{ color: "var(--page-ink)" }}>
              {labelFor(r.topic)}
            </span>
            <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ background: "var(--page-soft)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(6, (r.count / max) * 100)}%`,
                  background: "rgb(var(--brand-primary-rgb))",
                }}
              />
            </div>
            <span className="text-[11px] w-6 text-right shrink-0" style={{ color: "var(--page-ink-soft)" }}>
              {r.count}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
