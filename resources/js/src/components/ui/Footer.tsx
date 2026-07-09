"use client";
import { MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { useCandidate } from "@/context/CandidateContext";
import { TenantLink } from "@/components/ui/TenantLink";

// Las anclas usan la forma /#id para funcionar también desde otras páginas.
const contentLinks = [
  { href: "/propuestas",   label: "Propuestas" },
  { href: "/distritos",    label: "Caseríos" },
  { href: "/galeria",      label: "Galería" },
  { href: "/videos",       label: "Videos" },
  { href: "/#documentos",  label: "Documentos" },
];

const participaLinks = [
  { href: "/#eventos",        label: "Agenda" },
  { href: "/#servicios",      label: "Servicios" },
  { href: "/#opiniones",      label: "Tu voz" },
  { href: "/en-vivo",         label: "En vivo" },
  { href: "/chat",            label: "Chatbot IA" },
];

export function Footer() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  return (
    <footer style={{ background: "var(--page-ink, #0f1a12)", color: "#cfe0d3" }}>

      {/* Franja tricolor */}
      <div className="flex h-[5px]">
        <div className="flex-1" style={{ background: "rgb(var(--brand-dark-rgb))" }} />
        <div className="flex-1 bg-white" />
        <div className="flex-1" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
      </div>

      {/* Grid principal */}
      <div className="max-w-5xl mx-auto px-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-9 py-16">

          {/* Columna 1: Marca */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
            className="lg:col-span-1"
          >
            {/* Badge + meta */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-[13px] grid place-items-center text-white font-serif font-bold text-xl flex-shrink-0 overflow-hidden"
                style={{ background: "linear-gradient(150deg, rgb(var(--brand-primary-rgb)), rgb(var(--brand-dark-rgb)))" }}
              >
                {profile.logo_url ? (
                  <img src={profile.logo_url} alt={profile.party || "Logo"} className="w-full h-full object-cover" />
                ) : (
                  profile.list_number || "1"
                )}
              </div>
              <div>
                <b
                  className="block text-[11px] font-bold uppercase tracking-[.16em]"
                  style={{ color: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)" }}
                >
                  {profile.party || "Campaña Electoral"}
                  {profile.list_number ? ` · Lista N°${profile.list_number}` : ""}
                </b>
                <span className="text-sm font-semibold text-white leading-tight">
                  {profile.name}
                </span>
              </div>
            </div>

            {/* Quote */}
            {(profile.tagline) && (
              <p
                className="font-serif italic text-white mb-4 leading-snug"
                style={{ fontSize: "18px", maxWidth: "300px" }}
              >
                "{profile.tagline}"
              </p>
            )}

            {/* Ubicación */}
            <span className="flex items-center gap-2 text-sm" style={{ color: "#a9bdb0" }}>
              <MapPin size={15} style={{ color: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)", flexShrink: 0 }} />
              {profile.location}
            </span>
          </motion.div>

          {/* Columna 2: Contenido */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.07 }}
          >
            <h4
              className="text-[11.5px] font-bold uppercase tracking-[.16em] mb-4"
              style={{ color: "#86a08e" }}
            >
              Contenido
            </h4>
            {contentLinks.map((l) => (
              <TenantLink
                key={l.href}
                href={l.href}
                className="block text-sm font-semibold py-1.5 transition-all duration-200 hover:translate-x-1"
                style={{ color: "#cfe0d3" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#cfe0d3";
                }}
              >
                {l.label}
              </TenantLink>
            ))}
          </motion.div>

          {/* Columna 3: Participa */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.13 }}
          >
            <h4
              className="text-[11.5px] font-bold uppercase tracking-[.16em] mb-4"
              style={{ color: "#86a08e" }}
            >
              Participa
            </h4>
            {participaLinks.map((l) => (
              <TenantLink
                key={l.href}
                href={l.href}
                className="block text-sm font-semibold py-1.5 transition-all duration-200 hover:translate-x-1"
                style={{ color: "#cfe0d3" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#cfe0d3";
                }}
              >
                {l.label}
              </TenantLink>
            ))}
          </motion.div>

          {/* Columna 4: Elecciones + CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.19 }}
          >
            <h4
              className="text-[11.5px] font-bold uppercase tracking-[.16em] mb-4"
              style={{ color: "#86a08e" }}
            >
              Elecciones
            </h4>
            <p className="text-sm mb-1" style={{ color: "#a9bdb0" }}>
              {profile.party || "Campaña Electoral"}
            </p>
            <p className="text-sm font-semibold text-white mb-5">
              {profile.election_date ?? "2026"}
            </p>

            <motion.div whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}>
              <TenantLink
                href="/chat"
                className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 font-bold text-sm rounded-full transition-all duration-200"
                style={{
                  color: "var(--page-ink, #0f1a12)",
                  padding: "11px 18px",
                }}
              >
                <span
                  className="relative flex h-2 w-2"
                >
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: "rgb(var(--brand-primary-rgb))" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ background: "rgb(var(--brand-primary-rgb))" }}
                  />
                </span>
                Chatear con {shortName}
              </TenantLink>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.09)" }}>
        <div className="max-w-5xl mx-auto px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[12.5px]" style={{ color: "#86a08e" }}>
            © {new Date().getFullYear()} {profile.name}
            {profile.party ? ` · ${profile.party}` : ""}
            {profile.location ? ` · ${profile.location}` : ""}
          </span>
          <span
            className="text-[12.5px] font-semibold uppercase tracking-[.14em]"
            style={{ color: "#86a08e", opacity: 0.7 }}
          >
            Plataforma digital de campaña
          </span>
        </div>
      </div>
    </footer>
  );
}
