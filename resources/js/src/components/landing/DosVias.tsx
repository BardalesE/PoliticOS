"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Mic } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { useCandidate } from "@/context/CandidateContext";
import { ConcernsWidget } from "@/components/landing/ConcernsWidget";
import { OpinionModal } from "@/components/landing/OpinionSection";

const cardClass = "group flex w-full items-center gap-3 bg-white rounded-2xl p-4 text-left transition-colors duration-150";

const cardHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.borderColor = "rgb(var(--brand-primary-rgb))";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--page-line)";
  },
};

function CardBody({ icon: Icon, title, desc }: { icon: typeof Mic; title: string; desc: string }) {
  return (
    <>
      <div
        className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
        style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 10%, transparent)" }}
      >
        <Icon size={19} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight truncate" style={{ color: "var(--page-ink)" }}>
          {title}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--page-ink-soft)" }}>
          {desc}
        </p>
      </div>
    </>
  );
}

// Bloque de doble vía: el candidato lleva su mensaje (Hero, arriba) y aquí
// se hace igual de visible el canal de vuelta — el votante pide algo.
// Desde la Fase 7 el formulario de opinión ya no es una sección scrolleable:
// el segundo botón abre el OpinionModal directamente.
export function DosVias() {
  const { profile } = useCandidate();
  const [opinionOpen, setOpinionOpen] = useState(false);
  const shortName = profile.name.split(" ")[0];

  return (
    <section className="py-8 px-5" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35 }}
          >
            <TenantLink
              href="/chat"
              className={cardClass}
              style={{ border: "1px solid var(--page-line)" }}
              {...cardHover}
            >
              <CardBody icon={MessageCircle} title={`Pregúntale a ${shortName}`} desc="Respuesta al toque" />
            </TenantLink>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            <button
              type="button"
              onClick={() => setOpinionOpen(true)}
              className={cardClass}
              style={{ border: "1px solid var(--page-line)" }}
              {...cardHover}
            >
              <CardBody icon={Mic} title="Dile qué necesita tu caserío" desc="Él lo lee, no su equipo" />
            </button>
          </motion.div>
        </div>

        <ConcernsWidget />
      </div>

      <AnimatePresence>
        {opinionOpen && <OpinionModal onClose={() => setOpinionOpen(false)} />}
      </AnimatePresence>
    </section>
  );
}
