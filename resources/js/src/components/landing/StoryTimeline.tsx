"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Home, GraduationCap, Briefcase, Users, HeartHandshake, Flag, Milestone,
  ArrowRight, type LucideIcon,
} from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
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

function iconFor(category?: string | null): LucideIcon {
  if (category && CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
  return Milestone;
}

function Dot({ category }: { category?: string | null }) {
  const Icon = iconFor(category);
  return (
    <span
      className="absolute -left-[31px] top-1 w-8 h-8 rounded-full grid place-items-center shrink-0 md:static md:mb-3"
      style={{ background: "rgb(var(--brand-primary-rgb))" }}
    >
      <Icon size={14} className="text-white" aria-hidden />
    </span>
  );
}

/**
 * Línea de tiempo de vida del candidato — extraída de BioSection para poder
 * reusarla en la sección "Mi Historia" del rediseño narrativo. Mobile: lista
 * vertical con riel a la izquierda (igual que antes). Desktop (md+): tira
 * horizontal con scroll-snap, una tarjeta por hito — se siente más a
 * "documental" que la lista simple.
 */
export function StoryTimeline({ milestones }: { milestones: BioMilestone[] }) {
  if (milestones.length === 0) return null;

  return (
    <div>
      {/* ── Mobile: vertical ── */}
      <ol
        className="md:hidden relative border-l-2 pl-6 space-y-7"
        style={{ borderColor: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 25%, transparent)" }}
      >
        {milestones.map((m, i) => (
          <motion.li
            key={`${m.year}-${i}`}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="relative"
          >
            <Dot category={m.category} />
            {m.photo_url && (
              <div className="relative w-full h-32 rounded-xl overflow-hidden mb-2">
                <Image src={m.photo_url} alt={m.title} fill sizes="320px" className="object-cover" />
              </div>
            )}
            <p className="text-[11px] font-bold uppercase tracking-[.15em]" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
              {m.year}
            </p>
            <p className="font-serif font-semibold text-base mt-0.5" style={{ color: "var(--page-ink)" }}>
              {m.title}
            </p>
            {m.detail && (
              <p className="text-sm leading-relaxed mt-1" style={{ color: "var(--page-ink-soft)" }}>
                {m.detail}
              </p>
            )}
          </motion.li>
        ))}
      </ol>

      {/* ── Desktop: tira horizontal con scroll-snap ── */}
      <div className="hidden md:block relative">
        <div
          className="absolute left-0 right-0 top-4 h-0.5"
          style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 20%, transparent)" }}
        />
        <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scroll-pl-1" style={{ scrollbarWidth: "thin" }}>
          {milestones.map((m, i) => (
            <motion.div
              key={`${m.year}-${i}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="relative shrink-0 w-[260px] snap-start pt-1"
            >
              <Dot category={m.category} />
              <div
                className="rounded-2xl bg-white overflow-hidden h-full flex flex-col"
                style={{ border: "1px solid var(--page-line)" }}
              >
                {m.photo_url && (
                  <div className="relative w-full h-28">
                    <Image src={m.photo_url} alt={m.title} fill sizes="260px" className="object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[.15em]" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
                    {m.year}
                  </p>
                  <p className="font-serif font-semibold text-[15px] mt-0.5 leading-snug" style={{ color: "var(--page-ink)" }}>
                    {m.title}
                  </p>
                  {m.detail && (
                    <p className="text-xs leading-relaxed mt-1.5 line-clamp-4" style={{ color: "var(--page-ink-soft)" }}>
                      {m.detail}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Cierre: "la historia continúa contigo" */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4 }}
        className="mt-8 flex items-center gap-3 flex-wrap"
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
