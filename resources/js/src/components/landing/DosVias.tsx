"use client";
import { motion } from "framer-motion";
import { MessageCircle, Mic } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { useCandidate } from "@/context/CandidateContext";
import { ConcernsWidget } from "@/components/landing/ConcernsWidget";

// Bloque de doble vía: el candidato lleva su mensaje (Hero, arriba) y aquí
// se hace igual de visible el canal de vuelta — el votante pide algo.
// No duplica AssistantPreview (id="servicios") ni OpinionSection
// (id="opiniones"): solo agrega un punto de entrada visual más arriba en
// la página a los dos mecanismos que ya existen.
export function DosVias() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  const cards = [
    {
      href: "/chat",
      icon: MessageCircle,
      title: `Pregúntale a ${shortName}`,
      desc: "Respuesta al toque",
    },
    {
      href: "/#opiniones",
      icon: Mic,
      title: "Dile qué necesita tu caserío",
      desc: "Él lo lee, no su equipo",
    },
  ];

  return (
    <section className="py-8 px-5" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.href}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, delay: i * 0.08 }}
              >
                <TenantLink
                  href={c.href}
                  className="group flex items-center gap-3 bg-white rounded-2xl p-4 transition-colors duration-150"
                  style={{ border: "1px solid var(--page-line)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgb(var(--brand-primary-rgb))";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--page-line)";
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                    style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 10%, transparent)" }}
                  >
                    <Icon size={19} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight truncate" style={{ color: "var(--page-ink)" }}>
                      {c.title}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--page-ink-soft)" }}>
                      {c.desc}
                    </p>
                  </div>
                </TenantLink>
              </motion.div>
            );
          })}
        </div>

        <ConcernsWidget />
      </div>
    </section>
  );
}
