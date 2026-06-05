"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TenantLink } from "@/components/ui/TenantLink";
import { ArrowRight } from "lucide-react";
import { api, type Proposal } from "@/lib/api";

interface ProposalExtended extends Proposal {
  eje?: string | null;
  year_range?: string | null;
}

const FALLBACK: ProposalExtended[] = [
  { id: 1, title: "Agua potable para todos los caseríos", description: "Sistema integral de agua y saneamiento con financiamiento regional y mantenimiento garantizado.", district: null, topic: "agua", status: "propuesta" as const },
  { id: 2, title: "Carreteras y conectividad rural", description: "Pavimentación de vías secundarias y puentes que conecten cada comunidad con su mercado.", district: null, topic: "infraestructura", status: "propuesta" as const },
  { id: 3, title: "Salud comunitaria en cada caserío", description: "Postas médicas equipadas y brigadas de salud preventiva que lleguen donde hoy no llega nadie.", district: null, topic: "salud", status: "propuesta" as const },
  { id: 4, title: "Educación de calidad", description: "Mejora de infraestructura educativa, conectividad y becas para toda la provincia.", district: null, topic: "educacion", status: "propuesta" as const },
  { id: 5, title: "Reactivación económica local", description: "Apoyo a microempresarios, ferias agropecuarias y capital semilla para emprendedores.", district: null, topic: "economia", status: "propuesta" as const },
  { id: 6, title: "Seguridad ciudadana", description: "Red de cámaras, serenazgo ampliado y trabajo coordinado con la PNP.", district: null, topic: "seguridad", status: "propuesta" as const },
];

export function Proposals({ initialData }: { initialData?: ProposalExtended[] }) {
  const [proposals, setProposals] = useState<ProposalExtended[]>(() => {
    if (!initialData?.length) return [];
    return [...initialData].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).slice(0, 6);
  });
  const [loaded, setLoaded] = useState(!!initialData?.length);

  useEffect(() => {
    if (initialData?.length) return;
    api.proposals
      .list()
      .then((data) => {
        const sorted = [...data].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
        setProposals(sorted.slice(0, 6) as ProposalExtended[]);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayProposals = loaded && proposals.length === 0 ? FALLBACK : proposals;

  return (
    <section id="propuestas" className="py-20 md:py-28 px-5" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
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
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "rgb(var(--brand-primary-rgb))" }}
            />
            Propuestas prioritarias
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            Lo que haremos en los{" "}
            <em
              className="not-italic"
              style={{ color: "rgb(var(--brand-dark-rgb))" }}
            >
              primeros 100 días.
            </em>
          </h2>
          <p className="mt-3 text-base" style={{ color: "#4c5b51" }}>
            Compromisos medibles, con fechas y responsables.
          </p>
        </motion.div>

        {/* Grid de propuestas — 3 columnas */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayProposals.map((p, i) => (
            <motion.article
              key={p.id}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.07, type: "spring", stiffness: 80 }}
              className="group relative bg-white rounded-[20px] overflow-hidden transition-all duration-300 cursor-default"
              style={{
                border: "1px solid var(--page-line)",
                padding: "34px 28px 30px",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-6px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 30px 60px -34px var(--page-shadow)";
                (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 30%, transparent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--page-line)";
              }}
            >
              {/* Número de fondo gigante */}
              <span
                className="absolute select-none leading-none font-serif font-black pointer-events-none transition-colors duration-300"
                style={{
                  top: "-14px",
                  right: "6px",
                  fontSize: "120px",
                  color: "color-mix(in srgb, var(--page-ink) 5%, transparent)",
                  lineHeight: 1,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              {/* Contenido relativo */}
              <div className="relative z-10">
                {/* Tag con pip */}
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.1em] mb-4"
                  style={{ color: "rgb(var(--brand-primary-rgb))" }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "rgb(var(--brand-dark-rgb))" }}
                  />
                  {p.topic ?? "propuesta"}
                  {((p as ProposalExtended).year_range) && (
                    <span className="ml-1 opacity-50 font-normal lowercase tracking-normal">
                      · {(p as ProposalExtended).year_range}
                    </span>
                  )}
                </span>

                {/* Título */}
                <h3
                  className="font-serif font-semibold leading-[1.14] mb-3"
                  style={{ fontSize: "23px", color: "var(--page-ink)" }}
                >
                  {p.title}
                </h3>

                {/* Descripción */}
                {p.description && (
                  <p className="text-sm leading-relaxed" style={{ color: "#4c5b51" }}>
                    {p.description.slice(0, 140)}{p.description.length > 140 ? "…" : ""}
                  </p>
                )}

                {/* Línea animada inferior */}
                <div
                  className="mt-5 h-[3px] w-10 rounded-full transition-all duration-350 group-hover:w-20"
                  style={{
                    background: "rgb(var(--brand-primary-rgb))",
                    transitionDuration: "350ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgb(var(--brand-dark-rgb))";
                  }}
                />
              </div>
            </motion.article>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="mt-10 text-center"
        >
          <TenantLink
            href="/propuestas"
            className="inline-flex items-center gap-2.5 font-bold text-base pb-1 transition-all duration-200"
            style={{
              color: "var(--page-ink)",
              borderBottom: "2px solid rgb(var(--brand-primary-rgb))",
            }}
          >
            Ver todas las propuestas
            <ArrowRight size={18} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
          </TenantLink>
        </motion.div>
      </div>
    </section>
  );
}
