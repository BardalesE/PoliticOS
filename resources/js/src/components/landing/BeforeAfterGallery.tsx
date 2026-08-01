"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { MoveHorizontal } from "lucide-react";
import { homeApi, type Achievement } from "@/lib/api";

function BeforeAfterCard({ a, index }: { a: Achievement; index: number }) {
  const [pos, setPos] = useState(50);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className="rounded-[20px] overflow-hidden bg-white"
      style={{ border: "1px solid var(--page-line)" }}
    >
      <div className="relative aspect-video select-none">
        {/* Después: capa base, siempre completa */}
        <Image src={a.photo_after_url!} alt={`${a.title} — después`} fill sizes="(max-width: 768px) 100vw, 600px" className="object-cover" draggable={false} />

        {/* Antes: capa recortada por la posición del slider */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          <Image src={a.photo_before_url!} alt={`${a.title} — antes`} fill sizes="(max-width: 768px) 100vw, 600px" className="object-cover" draggable={false} />
        </div>

        {/* Línea divisoria + manija */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white pointer-events-none"
          style={{ left: `${pos}%`, boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg grid place-items-center">
            <MoveHorizontal size={16} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
          </div>
        </div>

        {/* Etiquetas */}
        <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider bg-black/60 text-white px-2.5 py-1 rounded-full pointer-events-none">
          Antes
        </span>
        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full pointer-events-none" style={{ background: "rgb(var(--brand-primary-rgb))", color: "#fff" }}>
          Después
        </span>

        {/* Input de rango invisible, controla el slider (mouse/touch/teclado) */}
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Comparar antes y después: ${a.title}`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
        />
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif font-semibold text-base leading-snug" style={{ color: "var(--page-ink)" }}>
            {a.title}
          </h3>
          {a.metric_value && (
            <span className="shrink-0 text-sm font-extrabold" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
              {a.metric_value} {a.metric_label}
            </span>
          )}
        </div>
        {a.description && (
          <p className="text-sm leading-relaxed mt-1.5" style={{ color: "var(--page-ink-soft)" }}>
            {a.description}
          </p>
        )}
      </div>
    </motion.article>
  );
}

/**
 * "Obras destacadas" — mismo dato que AchievementGrid, pero solo las obras
 * que sí tienen fotos de antes/después (comparación visual), a diferencia
 * de AchievementGrid que muestra TODOS los logros con su métrica.
 */
export function BeforeAfterGallery() {
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    homeApi.achievements()
      .then((data) => {
        if (cancelled) return;
        setAchievements(data.filter((a) => a.is_active && a.photo_before_url && a.photo_after_url));
      })
      .catch(() => { if (!cancelled) setAchievements([]); });
    return () => { cancelled = true; };
  }, []);

  if (!achievements || achievements.length === 0) return null;

  return (
    <section id="obras" className="py-20 md:py-28 px-5" style={{ background: "var(--page-bg)" }}>
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
            Obras destacadas
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            Desliza y mira el{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
              antes y después.
            </em>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-5">
          {achievements.map((a, i) => (
            <BeforeAfterCard key={a.id} a={a} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
