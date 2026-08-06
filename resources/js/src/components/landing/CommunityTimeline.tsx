"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import { MapPin, ArrowRight } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { useCandidate } from "@/context/CandidateContext";

function formatVisitedDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * "Presencia en la comunidad" — versión narrativa de Districts.tsx: un
 * camino recorrido en orden cronológico (solo lugares con visita real
 * documentada), no una grilla de zonas por visitar. Districts.tsx sigue
 * intacto para HomeTabs (grid + modal + fallback de zonas sin visitar).
 */
export function CommunityTimeline() {
  const { visitedPlaces } = useCandidate();

  if (visitedPlaces.length === 0) return null;

  const ordered = [...visitedPlaces].sort(
    (a, b) => new Date(a.visited_at).getTime() - new Date(b.visited_at).getTime()
  );

  return (
    <section id="comunidad" className="py-20 md:py-28 px-5 overflow-hidden" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-10 max-w-xl flex items-end justify-between gap-4 flex-wrap"
        >
          <div>
            <span
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
              style={{ color: "rgb(var(--brand-primary-rgb))" }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
              {ordered.length} visitas reales
            </span>
            <h2
              className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
              style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
            >
              El camino que ya{" "}
              <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
                recorrimos.
              </em>
            </h2>
          </div>
        </motion.div>

        <div className="relative">
          <div
            className="absolute left-0 right-0 top-4 h-0.5 hidden sm:block"
            style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 20%, transparent)" }}
          />
          <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory -mx-5 px-5" style={{ scrollbarWidth: "thin" }}>
            {ordered.map((place, i) => (
              <motion.div
                key={place.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="relative shrink-0 w-[220px] snap-start pt-1"
              >
                <span
                  className="hidden sm:grid absolute -top-1 left-4 w-6 h-6 rounded-full place-items-center"
                  style={{ background: "rgb(var(--brand-primary-rgb))" }}
                >
                  <MapPin size={11} className="text-white" aria-hidden />
                </span>
                <div className="rounded-2xl bg-white overflow-hidden h-full flex flex-col" style={{ border: "1px solid var(--page-line)" }}>
                  {place.highlight_photo_url && (
                    <div className="relative w-full h-24">
                      <Image src={place.highlight_photo_url} alt={place.name} fill sizes="220px" className="object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[.15em]" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
                      {formatVisitedDate(place.visited_at)}
                    </p>
                    <p className="font-serif font-semibold text-sm mt-0.5 leading-snug" style={{ color: "var(--page-ink)" }}>
                      {place.name}
                    </p>
                    {place.highlight_text && (
                      <p className="text-xs leading-relaxed mt-1.5 line-clamp-3" style={{ color: "var(--page-ink-soft)" }}>
                        {place.highlight_text}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-8 text-center"
        >
          <TenantLink
            href="/distritos"
            className="inline-flex items-center gap-2.5 font-bold text-base pb-1"
            style={{ color: "var(--page-ink)", borderBottom: "2px solid rgb(var(--brand-primary-rgb))" }}
          >
            Ver todos los lugares
            <ArrowRight size={18} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
          </TenantLink>
        </motion.div>
      </div>
    </section>
  );
}
