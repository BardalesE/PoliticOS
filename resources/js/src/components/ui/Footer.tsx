"use client";
import Link from "next/link";
import { Shield, Facebook, MessageCircle, Instagram, ExternalLink, MapPin, ChevronRight, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { useCandidate } from "@/context/CandidateContext";

const navLinks = [
  { href: "/propuestas", label: "Propuestas" },
  { href: "/distritos",  label: "Distritos" },
  { href: "/videos",     label: "Videos" },
  { href: "/galeria",    label: "Galería" },
  { href: "/en-vivo",    label: "En vivo" },
  { href: "/documentos", label: "Documentos" },
  { href: "/chat",       label: "Chatbot IA", highlight: true },
];

export function Footer() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  const socials = [
    profile.facebook_url && {
      href: profile.facebook_url, icon: Facebook,
      label: "Facebook", bg: "hover:bg-[#1877F2] hover:border-[#1877F2]",
    },
    profile.whatsapp_number && {
      href: `https://wa.me/${profile.whatsapp_number.replace(/[^0-9]/g, "")}`,
      icon: MessageCircle, label: "WhatsApp",
      bg: "hover:bg-[#25D366] hover:border-[#25D366]",
    },
    profile.instagram_url && {
      href: profile.instagram_url, icon: Instagram,
      label: "Instagram", bg: "hover:bg-[#E1306C] hover:border-[#E1306C]",
    },
    profile.tiktok_url && {
      href: profile.tiktok_url, icon: ExternalLink,
      label: "TikTok", bg: "hover:bg-ink-700 hover:border-ink-700",
    },
  ].filter(Boolean) as { href: string; icon: React.ElementType; label: string; bg: string }[];

  return (
    <footer className="relative bg-white border-t border-ink-200">

      {/* Franja azul top */}
      <div
        className="h-1"
        style={{ background: "linear-gradient(90deg,#DC2626,#EF4444,#DC2626)" }}
      />

      {/* Fondo muy sutil */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 60% at 100% 100%, #FEF2F2 0%, transparent 60%)" }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-5 pt-14 pb-8">

        {/* Grid principal */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">

          {/* Col 1: Marca — 5 cols */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-4 mb-5">
              <div
                className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0"
                style={{ boxShadow: "0 4px 16px rgba(220,38,38,0.20)" }}
              >
                {profile.logo_url ? (
                  <img src={profile.logo_url} alt={profile.party || "Logo"} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full grid place-items-center font-serif font-extrabold text-xl text-white"
                    style={{ background: "linear-gradient(145deg,#DC2626,#EF4444)" }}
                  >
                    {profile.list_number || "1"}
                  </div>
                )}
              </div>
              <div>
                <p className="font-serif font-bold text-ink-900 text-lg leading-tight">{profile.name}</p>
                <p
                  className="text-[10px] font-extrabold uppercase tracking-[2px] mt-0.5"
                  style={{ color: "#DC2626" }}
                >
                  {profile.party || "Perú Primero"} · Lista N°{profile.list_number}
                </p>
              </div>
            </div>

            <p className="text-ink-500 text-sm leading-relaxed font-medium mb-5 max-w-xs">
              {profile.tagline
                ? `"${profile.tagline}"`
                : `Candidato a Alcalde de ${profile.location.split("·")[0].trim()}. Hijo del pueblo, no de la política.`}
            </p>

            <div className="flex items-center gap-2 text-ink-400 text-xs font-semibold mb-6">
              <MapPin size={12} className="text-brand-500" />
              {profile.location}
            </div>

            {socials.length > 0 && (
              <div className="flex gap-2">
                {socials.map((s) => {
                  const Icon = s.icon;
                  return (
                    <motion.a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      whileHover={{ scale: 1.1, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      className={`w-9 h-9 rounded-xl bg-white border border-ink-200 grid place-items-center text-ink-500 hover:text-white transition-all duration-200 ${s.bg}`}
                      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                    >
                      <Icon size={15} />
                    </motion.a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Col 2: Navegación — 3 cols */}
          <div className="md:col-span-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-brand-500 mb-5">
              Navegación
            </p>
            <ul className="space-y-2.5">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`group flex items-center gap-1.5 text-sm font-semibold transition-colors duration-200 ${
                      l.highlight ? "text-brand-600 hover:text-brand-900" : "text-ink-500 hover:text-brand-700"
                    }`}
                  >
                    <ChevronRight
                      size={12}
                      className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-brand-400"
                    />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Contacto + CTAs — 4 cols */}
          <div className="md:col-span-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-brand-500 mb-5">
              Contacto
            </p>

            <div className="space-y-2 mb-7">
              <p className="text-ink-500 text-sm font-medium">
                {profile.location.split("·")[0].trim()}, Cajamarca — Perú
              </p>
              <p className="text-ink-400 text-xs font-medium">
                Elecciones municipales {profile.election_date ?? "2026"}
              </p>
            </div>

            <Link
              href="/transparencia"
              className="group inline-flex items-center gap-2 border-2 border-brand-200 hover:border-brand-600 bg-brand-50 hover:bg-brand-600 text-brand-700 hover:text-white text-xs font-extrabold uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all duration-200 mb-3"
            >
              <Shield size={13} />
              Portal de Transparencia
              <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/chat"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider text-white transition-all duration-200"
                style={{
                  background: "linear-gradient(135deg,#DC2626,#EF4444)",
                  boxShadow: "0 6px 20px rgba(220,38,38,0.28)",
                }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                Chatear con {shortName}
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Separador */}
        <div className="h-px w-full bg-ink-200 mb-6" />

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-ink-400 text-xs font-semibold text-center sm:text-left">
            © 2026 {profile.name} · {profile.party} · {profile.location.split("·")[0].trim()}, Cajamarca
          </p>
          <p className="text-ink-300 text-[10px] font-semibold tracking-wider uppercase">
            Plataforma digital de campaña
          </p>
        </div>
      </div>
    </footer>
  );
}
