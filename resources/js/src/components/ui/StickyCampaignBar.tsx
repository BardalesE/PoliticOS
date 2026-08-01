"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { MessageCircle, User, X } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { useCandidate } from "@/context/CandidateContext";

/**
 * Barra de CTA persistente — solo desktop/tablet (en mobile esa función la
 * cumple MobileBottomNav, montar ambas a la vez se pisaría en la esquina
 * inferior). Aparece después de pasar el alto de un viewport (ya se dejó
 * atrás el Hero) y se puede cerrar por el resto de la sesión.
 */
export function StickyCampaignBar() {
  const { profile } = useCandidate();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shortName = profile.name.split(" ")[0];

  useEffect(() => {
    if (sessionStorage.getItem("sticky_campaign_bar_dismissed") === "1") {
      setDismissed(true);
      return;
    }
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.85);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem("sticky_campaign_bar_dismissed", "1"); } catch {}
  };

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="hidden md:flex fixed bottom-5 left-5 z-40 items-center gap-4 bg-white rounded-full pl-2 pr-2.5 py-2 shadow-xl max-w-[420px]"
          style={{ border: "1px solid var(--page-line)" }}
        >
          <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0 bg-brand-50 grid place-items-center">
            {profile.photo_url ? (
              <Image src={profile.photo_url} alt={profile.name} fill sizes="36px" className="object-cover" />
            ) : (
              <User size={16} className="text-brand-300" />
            )}
          </div>
          <div className="pr-1">
            <p className="text-xs font-bold leading-tight" style={{ color: "var(--page-ink)" }}>{profile.name}</p>
            <p className="text-[11px] leading-tight" style={{ color: "var(--page-ink-soft)" }}>{profile.title}</p>
          </div>
          <TenantLink
            href="/chat"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide text-white shrink-0"
            style={{ background: "rgb(var(--brand-primary-rgb))" }}
          >
            <MessageCircle size={13} />
            Chatea con {shortName}
          </TenantLink>
          <button
            onClick={dismiss}
            aria-label="Cerrar"
            className="w-7 h-7 rounded-full grid place-items-center shrink-0 transition-colors hover:bg-black/5"
            style={{ color: "var(--page-ink-soft)" }}
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
