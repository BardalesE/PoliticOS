"use client";
import { motion } from "framer-motion";
import { Facebook, MessageCircle, ExternalLink, Instagram, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCandidate } from "@/context/CandidateContext";

export function Connection() {
  const { profile } = useCandidate();

  const socialLinks = [
    profile.facebook_url && {
      href:    profile.facebook_url,
      label:   "Facebook",
      sub:     "Síguenos en Facebook",
      icon:    Facebook,
      gradient:"from-[#1877F2] to-[#1565d8]",
      glow:    "rgba(24,119,242,0.35)",
    },
    profile.whatsapp_number && {
      href:    `https://wa.me/${profile.whatsapp_number.replace(/[^0-9]/g, "")}`,
      label:   "WhatsApp",
      sub:     "Escríbenos directo",
      icon:    MessageCircle,
      gradient:"from-[#25D366] to-[#128C7E]",
      glow:    "rgba(37,211,102,0.35)",
    },
    profile.tiktok_url && {
      href:    profile.tiktok_url,
      label:   "TikTok",
      sub:     "Videos de campaña",
      icon:    ExternalLink,
      gradient:"from-ink-700 to-ink-900",
      glow:    "rgba(26,26,26,0.30)",
    },
    profile.instagram_url && {
      href:    profile.instagram_url,
      label:   "Instagram",
      sub:     "Fotos y reels",
      icon:    Instagram,
      gradient:"from-[#E1306C] to-[#833AB4]",
      glow:    "rgba(225,48,108,0.35)",
    },
  ].filter(Boolean) as {
    href: string; label: string; sub: string;
    icon: React.ElementType; gradient: string; glow: string;
  }[];

  return (
    <section className="py-20 md:py-28 px-5 overflow-hidden" style={{ background: "var(--page-soft)" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <span className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-extrabold uppercase tracking-[2px] px-4 py-2 rounded-full mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            Conéctate
          </span>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mt-3">
            Redes{" "}
            <span
              style={{
                background: "var(--brand-grad)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              oficiales
            </span>{" "}
            del candidato.
          </h2>
        </motion.div>

        {socialLinks.length > 0 ? (
          // Con una sola red social la tarjeta va centrada en una columna,
          // no colgada en la celda izquierda de un grid de 2.
          <div
            className={cn(
              "grid grid-cols-1 gap-4 mx-auto",
              socialLinks.length > 1 ? "sm:grid-cols-2 max-w-2xl" : "max-w-md"
            )}
          >
            {socialLinks.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 24, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.08, type: "spring", stiffness: 80 }}
                >
                  <motion.a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ y: -6, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    style={{ boxShadow: `0 8px 32px ${s.glow}` }}
                    className={`group flex items-center justify-between p-5 rounded-2xl bg-gradient-to-br ${s.gradient} text-white overflow-hidden relative`}
                  >
                    {/* Orb decorativo */}
                    <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />

                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm grid place-items-center border border-white/30 flex-shrink-0">
                        <Icon size={22} />
                      </div>
                      <div>
                        <p className="font-extrabold text-base leading-none">{s.label}</p>
                        <p className="text-white/75 text-sm mt-1 font-medium">{s.sub}</p>
                      </div>
                    </div>
                    <div className="relative z-10 w-8 h-8 rounded-full bg-white/20 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <ArrowUpRight size={14} />
                    </div>
                  </motion.a>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.blockquote
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="max-w-3xl mx-auto text-center"
          >
            <p className="font-serif text-2xl sm:text-3xl text-ink-800 leading-relaxed italic">
              "{profile.tagline || "Mi compromiso es contigo, con tu familia y con el futuro de nuestra comunidad."}"
            </p>
            <footer className="mt-4 text-sm text-ink-500 font-semibold">— {profile.name || "El candidato"}</footer>
          </motion.blockquote>
        )}
      </div>
    </section>
  );
}
