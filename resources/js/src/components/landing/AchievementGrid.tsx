"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { homeApi, type Achievement } from "@/lib/api";

const STATUS_LABEL: Record<Achievement["status"], string> = {
  completado: "Completado",
  en_curso: "En curso",
};

function AchievementCard({ a, index }: { a: Achievement; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.06, type: "spring", stiffness: 80 }}
      className="bg-white rounded-[20px] p-5 sm:p-6 flex flex-col"
      style={{ border: "1px solid var(--page-line)" }}
    >
      {a.metric_value && (
        <p
          className="font-serif font-black leading-none tracking-tight mb-1"
          style={{ fontSize: "clamp(34px,4.2vw,52px)", color: "rgb(var(--brand-primary-rgb))" }}
        >
          {a.metric_value}
        </p>
      )}
      {a.metric_label && (
        <p className="text-[11px] font-bold uppercase tracking-[.15em] mb-3" style={{ color: "var(--page-ink-soft)" }}>
          {a.metric_label}
        </p>
      )}
      <h3 className="font-serif font-semibold text-base leading-snug mb-1.5" style={{ color: "var(--page-ink)" }}>
        {a.title}
      </h3>
      {a.description && (
        <p className="text-sm leading-relaxed line-clamp-3 flex-1" style={{ color: "var(--page-ink-soft)" }}>
          {a.description}
        </p>
      )}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        {a.district && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--page-ink-soft)" }}>
            <MapPin size={11} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
            {a.district}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{
            background: a.status === "completado"
              ? "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 12%, transparent)"
              : "color-mix(in srgb, var(--brand-accent) 20%, transparent)",
            color: a.status === "completado" ? "rgb(var(--brand-primary-rgb))" : "var(--page-ink)",
          }}
        >
          {STATUS_LABEL[a.status]}
        </span>
      </div>
    </motion.article>
  );
}

/**
 * "¿Qué hice?" — grid de logros con métrica grande y poco texto, a
 * diferencia de BeforeAfterGallery (mismo dato Achievement, pero enfocado en
 * la comparación fotográfica de las obras que sí tienen antes/después).
 */
export function AchievementGrid() {
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    homeApi.achievements()
      .then((data) => { if (!cancelled) setAchievements(data.filter((a) => a.is_active)); })
      .catch(() => { if (!cancelled) setAchievements([]); });
    return () => { cancelled = true; };
  }, []);

  if (!achievements || achievements.length === 0) return null;

  return (
    <section id="logros" className="py-20 md:py-28 px-5" style={{ background: "var(--page-bg)" }}>
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
            Resultados, no promesas
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            Esto es lo que ya{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
              logramos juntos.
            </em>
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {achievements.map((a, i) => (
            <AchievementCard key={a.id} a={a} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
