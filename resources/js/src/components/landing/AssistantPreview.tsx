"use client";
import { TenantLink } from "@/components/ui/TenantLink";
import { motion } from "framer-motion";
import { MessageCircle, FileText, MapPin, Flag, ArrowRight } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

export function AssistantPreview() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  const services = [
    {
      href:  "/chat",
      icon:  MessageCircle,
      title: `Escríbele a ${shortName}`,
      desc:  "Envía tu opinión y propuesta directamente al equipo.",
      to:    "chat",
    },
    {
      href:  "/transparencia",
      icon:  Flag,
      title: "Portal de Transparencia",
      desc:  "Consulta el financiamiento y los gastos de campaña.",
      to:    "transparencia",
    },
    {
      href:  "/documentos",
      icon:  FileText,
      title: "Documentos públicos",
      desc:  "Plan de gobierno, hoja de vida y declaraciones juradas.",
      to:    "documentos",
    },
    {
      href:  "/distritos",
      icon:  MapPin,
      title: "Reclamos y sugerencias",
      desc:  "Reporta una necesidad de tu comunidad. Te respondemos.",
      to:    "distritos",
    },
  ];

  return (
    <section
      id="servicios"
      className="py-20 md:py-28 px-5"
      style={{ background: "linear-gradient(180deg, var(--page-soft), var(--page-bg))" }}
    >
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
            style={{ color: "rgb(var(--brand-dark-rgb))" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-dark-rgb))" }} />
            Servicios al ciudadano
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            Estamos para{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-primary-rgb))" }}>servirte.</em>
          </h2>
          <p className="mt-3 text-base" style={{ color: "var(--page-ink-soft)" }}>
            Canales directos entre tú y la campaña. Transparencia y respuesta en cada paso.
          </p>
        </motion.div>

        {/* Grid 4 columnas */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((s, i) => {
            const Icon = s.icon;
            const isEven = i % 2 === 1;
            return (
              <motion.div
                key={s.href}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
              >
                <TenantLink
                  href={s.href}
                  className="group flex flex-col h-full bg-white rounded-[18px] overflow-hidden transition-all duration-300"
                  style={{ border: "1px solid var(--page-line)", padding: "28px 24px" }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "translateY(-5px)";
                    el.style.boxShadow = "0 26px 50px -30px var(--page-shadow)";
                    el.style.borderColor = "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 30%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "";
                    el.style.boxShadow = "";
                    el.style.borderColor = "var(--page-line)";
                  }}
                >
                  {/* Icono */}
                  <div
                    className="w-12 h-12 rounded-[14px] grid place-items-center mb-4 flex-shrink-0 transition-all duration-300"
                    style={{
                      background: isEven
                        ? "color-mix(in srgb, rgb(var(--brand-dark-rgb)) 10%, transparent)"
                        : "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 10%, transparent)",
                    }}
                  >
                    <Icon
                      size={22}
                      style={{
                        color: isEven
                          ? "rgb(var(--brand-dark-rgb))"
                          : "rgb(var(--brand-primary-rgb))",
                      }}
                    />
                  </div>

                  {/* Texto */}
                  <h3
                    className="font-serif font-semibold mb-2 leading-tight"
                    style={{ fontSize: "19px", color: "var(--page-ink)" }}
                  >
                    {s.title}
                  </h3>
                  <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--page-ink-soft)" }}>
                    {s.desc}
                  </p>

                  {/* Flecha */}
                  <span
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold transition-all duration-200"
                    style={{ color: "rgb(var(--brand-primary-rgb))" }}
                  >
                    Acceder
                    <ArrowRight
                      size={14}
                      className="transition-transform duration-200 group-hover:translate-x-1"
                    />
                  </span>
                </TenantLink>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
