"use client";
import { motion } from "framer-motion";
import { Facebook, Instagram } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0115.54 3h-3.09v12.4a2.592 2.592 0 01-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 004.3 1.38V7.3s-1.88.09-3.24-1.48z" />
    </svg>
  );
}

// Barra flotante de redes sociales — reemplaza la sección grande "Redes
// oficiales del candidato" (Connection.tsx, ya no se renderiza en la home).
// Vertical, en el borde izquierdo centrado: no choca con ChatFAB (abajo-
// derecha) ni con ScrollToTopFab (abajo-izquierda, solo tras scrollear).
export function SocialFAB() {
  const { profile } = useCandidate();

  const links = [
    profile.facebook_url && {
      href: profile.facebook_url, label: "Facebook",
      icon: Facebook, bg: "#1877F2",
    },
    profile.whatsapp_number && {
      href: `https://wa.me/${profile.whatsapp_number.replace(/[^0-9]/g, "")}`,
      label: "WhatsApp", icon: WhatsAppIcon, bg: "#25D366",
    },
    profile.tiktok_url && {
      href: profile.tiktok_url, label: "TikTok",
      icon: TikTokIcon, bg: "#111111",
    },
    profile.instagram_url && {
      href: profile.instagram_url, label: "Instagram",
      icon: Instagram, bg: "#C1367B",
    },
  ].filter(Boolean) as { href: string; label: string; icon: React.ElementType; bg: string }[];

  if (links.length === 0) return null;

  return (
    <div className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 flex-col gap-2.5">
      {links.map((s, i) => {
        const Icon = s.icon;
        return (
          <motion.a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            title={s.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.06, duration: 0.25 }}
            whileHover={{ scale: 1.08, x: 2 }}
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg"
            style={{ background: s.bg }}
          >
            <Icon className="w-[18px] h-[18px]" />
          </motion.a>
        );
      })}
    </div>
  );
}
