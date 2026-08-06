"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Home, GraduationCap, Briefcase, Users, HeartHandshake, Flag, Milestone,
  ArrowRight, type LucideIcon,
} from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import { EmphasisText } from "@/lib/textEmphasis";
import type { BioMilestone } from "@/lib/api";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  origen: Home,
  educacion: GraduationCap,
  trabajo: Briefcase,
  liderazgo: Users,
  servicio: HeartHandshake,
  fundacion: Flag,
  decision: Milestone,
};

const CATEGORY_LABELS: Record<string, string> = {
  origen: "Origen",
  educacion: "Educación",
  trabajo: "Trabajo",
  liderazgo: "Liderazgo",
  servicio: "Servicio",
  fundacion: "Fundación",
  decision: "Decisión",
};

function iconFor(category?: string | null): LucideIcon {
  if (category && CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
  return Milestone;
}

/**
 * Línea de tiempo de vida del candidato — rediseño "documental" (inspirado
 * en el lenguaje de capítulos de una historia de vida: año gigante en
 * tipografía condensada sobre un riel continuo, foto grande, título con
 * efecto máquina de escribir, chip de categoría, párrafo con resaltados).
 * Un solo layout para mobile y desktop (antes había una tira horizontal
 * aparte en desktop; se unificó para que cada capítulo se sienta como su
 * propia "página" del scroll, más fiel a la referencia).
 */
export function StoryTimeline({ milestones }: { milestones: BioMilestone[] }) {
  if (milestones.length === 0) return null;

  return (
    <div className="relative">
      {/* Riel continuo — solo desktop, donde la columna del año tiene una
          posición fija y predecible (en mobile cada capítulo lleva su
          propio riel corto, más simple de alinear al apilarse). */}
      <div
        className="hidden md:block absolute left-[55px] top-3 bottom-3 w-0.5"
        style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 25%, transparent)" }}
      />

      <div className="space-y-16 md:space-y-24">
        {milestones.map((m, i) => {
          const Icon = iconFor(m.category);
          const hasPhoto = !!m.photo_url;

          return (
            <motion.div
              key={`${m.year}-${i}`}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
              className="relative md:grid md:grid-cols-[110px_260px_1fr] md:gap-8 lg:gap-10"
            >
              {/* Año */}
              <div className="relative mb-4 md:mb-0">
                <span
                  className="font-condensed leading-none block"
                  style={{ fontSize: "clamp(44px,7vw,64px)", color: "rgb(var(--brand-primary-rgb))" }}
                >
                  {m.year}
                </span>
                <span
                  className="hidden md:block absolute -left-[55px] top-4 w-3 h-3 rounded-full -translate-x-1/2"
                  style={{ background: "rgb(var(--brand-primary-rgb))" }}
                  aria-hidden
                />
                {/* Riel corto — solo mobile, un tramo por capítulo */}
                <span
                  className="md:hidden absolute left-0 top-[1.15em] bottom-[-64px] w-0.5"
                  style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 25%, transparent)" }}
                  aria-hidden
                />
              </div>

              {/* Foto */}
              {hasPhoto && (
                <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden mb-5 md:mb-0 max-w-sm md:max-w-none">
                  <Image
                    src={m.photo_url!}
                    alt={m.title}
                    fill
                    sizes="(max-width: 768px) 90vw, 260px"
                    className="object-cover"
                  />
                </div>
              )}

              {/* Texto */}
              <div className={hasPhoto ? "" : "md:col-start-2 md:col-span-2"}>
                <TypewriterHeading
                  text={m.title}
                  as="h3"
                  className="font-condensed leading-[0.98] mb-3"
                  style={{ fontSize: "clamp(28px,4vw,44px)", color: "var(--page-ink)" }}
                />
                {m.category && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3"
                    style={{
                      color: "rgb(var(--brand-primary-rgb))",
                      border: "1px solid color-mix(in srgb, rgb(var(--brand-primary-rgb)) 35%, transparent)",
                    }}
                  >
                    <Icon size={12} aria-hidden />
                    {CATEGORY_LABELS[m.category] ?? m.category}
                  </span>
                )}
                {m.detail && (
                  <p className="leading-relaxed" style={{ color: "var(--page-ink-soft)", fontSize: "16px" }}>
                    <EmphasisText text={m.detail} />
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Cierre: "la historia continúa contigo" */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4 }}
        className="mt-16 md:mt-20 flex items-center gap-3 flex-wrap"
      >
        <p className="font-serif font-semibold text-base" style={{ color: "var(--page-ink)" }}>
          La historia continúa contigo.
        </p>
        <TenantLink
          href="/chat"
          className="inline-flex items-center gap-1.5 text-sm font-bold pb-0.5"
          style={{ color: "rgb(var(--brand-primary-rgb))", borderBottom: "2px solid rgb(var(--brand-primary-rgb))" }}
        >
          Sé parte del próximo capítulo <ArrowRight size={14} />
        </TenantLink>
      </motion.div>
    </div>
  );
}
