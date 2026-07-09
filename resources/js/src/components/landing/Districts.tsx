"use client";
import { motion } from "framer-motion";
import { TenantLink } from "@/components/ui/TenantLink";
import { MapPin } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

export function Districts() {
  const { districts } = useCandidate();

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
            {districts.length || 0} caseríos
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            Conociendo cada rincón de{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
              nuestra tierra.
            </em>
          </h2>
          <p className="mt-3 text-base" style={{ color: "var(--page-ink-soft)" }}>
            Haz clic en tu caserío para ver qué haremos por ti. Cada comunidad tiene su propio plan.
          </p>
        </motion.div>

        {/* Grid de territorios */}
        {districts.length > 0 ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))" }}
          >
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
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "rgb(var(--brand-primary-rgb))";
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = "0 18px 36px -22px var(--page-shadow)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "var(--page-line)";
                    el.style.transform = "";
                    el.style.boxShadow = "";
                  }}
                >
                  {/* Left accent bar */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-transform duration-300 origin-top scale-y-0 group-hover:scale-y-100"
                    style={{ background: "rgb(var(--brand-dark-rgb))" }}
                  />

                  {/* Pin icon */}
                  <div
                    className="w-8 h-8 rounded-[9px] grid place-items-center mb-3 flex-shrink-0"
                    style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 10%, transparent)" }}
                  >
                    <MapPin size={15} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
                  </div>

                  <b className="block text-sm font-bold leading-tight" style={{ color: "var(--page-ink)" }}>
                    {district}
                  </b>
                  <span className="text-xs mt-0.5" style={{ color: "#6b7b6f" }}>
                    Ver plan local
                  </span>
                </TenantLink>
              </motion.div>
            ))}
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))" }}
          >
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
    </section>
  );
}
