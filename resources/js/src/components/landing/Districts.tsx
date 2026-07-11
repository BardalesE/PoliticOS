"use client";
import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { TenantLink } from "@/components/ui/TenantLink";
import { Modal } from "@/components/ui/Modal";
import { MapPin, X, ArrowRight } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";
import type { VisitedPlace } from "@/lib/api";

function formatVisitedDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Card de un lugar visitado ─────────────────────────────────────────────
// Dos capas de datos, la de turismo es opcional: si `highlight_text` o
// `highlight_photo_url` no llegaron todavía (contenido pendiente), el card
// se ve bien solo con la capa de campaña — nunca un hueco vacío ni un
// placeholder tipo "próximamente".
function PlaceCard({ place, onOpen }: { place: VisitedPlace; onOpen: () => void }) {
  const hasHighlight = !!(place.highlight_text || place.highlight_photo_url);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, type: "spring", stiffness: 100 }}
      className="group relative bg-white rounded-[14px] overflow-hidden text-left w-full flex flex-col"
      style={{ border: "1px solid var(--page-line)" }}
    >
      <div
        className="relative h-24 w-full overflow-hidden"
        style={{
          background: place.highlight_photo_url
            ? undefined
            : "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 8%, #ebebeb)",
        }}
      >
        {place.highlight_photo_url ? (
          <Image
            src={place.highlight_photo_url}
            alt={`Foto de ${place.name}`}
            fill
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <MapPin size={22} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
          </div>
        )}
      </div>
      <div className="p-3.5 flex-1 flex flex-col">
        <b className="block text-sm font-bold leading-tight" style={{ color: "var(--page-ink)" }}>
          {place.name}
        </b>
        <span className="text-[11px] mt-0.5" style={{ color: "#6e695f" }}>
          Visitado {formatVisitedDate(place.visited_at)}
        </span>
        {hasHighlight && place.highlight_text && (
          <p className="text-xs mt-2 line-clamp-2 flex-1" style={{ color: "var(--page-ink-soft)" }}>
            {place.highlight_text}
          </p>
        )}
      </div>
    </motion.button>
  );
}

// ── Detalle en modal ──────────────────────────────────────────────────────
function PlaceDetail({ place, onClose }: { place: VisitedPlace; onClose: () => void }) {
  return (
    <Modal onClose={onClose} label={place.name} className="max-w-lg">
      {place.highlight_photo_url && (
        <div className="relative h-48 w-full overflow-hidden">
          <Image
            src={place.highlight_photo_url}
            alt={`Foto de ${place.name}`}
            fill
            sizes="(max-width: 640px) 100vw, 512px"
            className="object-cover"
          />
        </div>
      )}
      <div className="p-6">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/90 grid place-items-center shadow"
        >
          <X size={16} />
        </button>
        <b className="font-serif text-xl block" style={{ color: "var(--page-ink)" }}>
          {place.name}
        </b>
        <span className="text-xs font-semibold" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
          Visitado {formatVisitedDate(place.visited_at)}
          {place.event_type ? ` · ${place.event_type}` : ""}
        </span>
        {place.highlight_text ? (
          <p className="text-sm mt-4 leading-relaxed" style={{ color: "var(--page-ink-soft)" }}>
            {place.highlight_text}
          </p>
        ) : (
          <p className="text-sm mt-4 leading-relaxed" style={{ color: "var(--page-ink-soft)" }}>
            Todavía no hay reseña de este lugar — pronto contaremos qué lo hace único.
          </p>
        )}
        <TenantLink
          href={`/chat?q=${encodeURIComponent(`¿Qué harás en ${place.name}?`)}`}
          className="inline-flex items-center gap-1.5 mt-5 text-sm font-bold"
          style={{ color: "rgb(var(--brand-primary-rgb))" }}
        >
          Ver plan local <ArrowRight size={14} />
        </TenantLink>
      </div>
    </Modal>
  );
}

// ── Fallback: lista simple de nombres (sin fecha/turismo todavía) ─────────
// Se usa mientras el tenant no tiene ningún lugar con `visited_at` cargado
// — mantiene el comportamiento anterior en vez de mostrar una sección vacía.
function PlainDistrictsFallback({ districts }: { districts: string[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))" }}>
      {districts.map((district, i) => (
        <motion.div
          key={district}
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35, delay: (i % 6) * 0.05, type: "spring", stiffness: 100 }}
        >
          <TenantLink
            href={`/chat?q=${encodeURIComponent(`¿Qué harás en ${district}?`)}`}
            className="group relative bg-white rounded-[14px] flex flex-col overflow-hidden transition-all duration-250 block"
            style={{ border: "1px solid var(--page-line)", padding: "18px" }}
          >
            <div
              className="w-8 h-8 rounded-[9px] grid place-items-center mb-3 flex-shrink-0"
              style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 10%, transparent)" }}
            >
              <MapPin size={15} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
            </div>
            <b className="block text-sm font-bold leading-tight" style={{ color: "var(--page-ink)" }}>
              {district}
            </b>
            <span className="text-xs mt-0.5" style={{ color: "#6e695f" }}>
              Ver plan local
            </span>
          </TenantLink>
        </motion.div>
      ))}
    </div>
  );
}

export function Districts() {
  const { districts, visitedPlaces } = useCandidate();
  const [active, setActive] = useState<VisitedPlace | null>(null);
  const hasVisited = visitedPlaces.length > 0;

  return (
    <section
      id="caserios"
      className="py-20 md:py-28 px-5"
      style={{ background: "var(--page-bg)" }}
    >
      <div className="max-w-5xl mx-auto">

        {/* Header centrado */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center max-w-xl mx-auto"
        >
          <span
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
            style={{ color: "rgb(var(--brand-primary-rgb))" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
            {hasVisited ? visitedPlaces.length : districts.length || 0} caseríos
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            {hasVisited ? (
              <>
                Lugares que ya{" "}
                <em className="not-italic" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
                  visitamos.
                </em>
              </>
            ) : (
              <>
                Conociendo cada rincón de{" "}
                <em className="not-italic" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
                  nuestra tierra.
                </em>
              </>
            )}
          </h2>
          <p className="mt-3 text-base" style={{ color: "var(--page-ink-soft)" }}>
            {hasVisited
              ? "Cada caserío tiene algo propio. Haz clic para conocerlo y ver qué haremos por ti."
              : "Haz clic en tu caserío para ver qué haremos por ti. Cada comunidad tiene su propio plan."}
          </p>
        </motion.div>

        {/* Grid de lugares */}
        {hasVisited ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {visitedPlaces.map((place) => (
              <PlaceCard key={place.id} place={place} onOpen={() => setActive(place)} />
            ))}
          </div>
        ) : districts.length > 0 ? (
          <PlainDistrictsFallback districts={districts} />
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))" }}>
            {Array.from({ length: 13 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[14px] animate-pulse"
                style={{
                  height: "88px",
                  background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 5%, #ebebeb)",
                  border: "1px solid var(--page-line)",
                }}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {active && <PlaceDetail place={active} onClose={() => setActive(null)} />}
      </AnimatePresence>
    </section>
  );
}
