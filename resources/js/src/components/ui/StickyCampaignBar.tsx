"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { useCandidate } from "@/context/CandidateContext";

/**
 * Píldora de CTA flotante — visible desde la carga (no tras pasar el Hero,
 * a diferencia de la versión anterior de este componente), fija bajo el
 * Navbar. Solo desktop/tablet (en mobile esa función la cumple el botón
 * "Chat" de MobileBottomNav, montar ambas chocaría). Se puede cerrar por el
 * resto de la sesión (mismo mecanismo de siempre, solo cambió cuándo
 * aparece).
 */
export function StickyCampaignBar() {
  const { profile } = useCandidate();
  const [dismissed, setDismissed] = useState(true); // arranca oculta hasta confirmar sessionStorage (evita flash)

  useEffect(() => {
    setDismissed(sessionStorage.getItem("sticky_campaign_bar_dismissed") === "1");
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem("sticky_campaign_bar_dismissed", "1"); } catch {}
  };

  const shortName = profile.name.split(" ")[0];

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.6 }}
          className="hidden md:flex fixed top-[130px] left-1/2 -translate-x-1/2 z-40 items-center gap-1 rounded-full pl-5 pr-2 py-1.5 shadow-xl"
          style={{ background: "rgb(var(--brand-primary-rgb))" }}
        >
          <TenantLink
            href="/chat"
            className="font-condensed text-white text-sm tracking-wide pr-3"
          >
            ¡Habla con {shortName} ahora!
          </TenantLink>
          <button
            onClick={dismiss}
            aria-label="Cerrar"
            className="w-7 h-7 rounded-full grid place-items-center shrink-0 text-white/80 hover:text-white hover:bg-black/10 transition-colors"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
