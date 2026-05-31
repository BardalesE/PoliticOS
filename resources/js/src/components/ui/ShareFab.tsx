"use client";
import { motion } from "framer-motion";
import { Share2, MessageCircle, Copy, Facebook, X } from "lucide-react";
import { useState } from "react";
import { useCandidate } from "@/context/CandidateContext";

export function ShareFab() {
  const [open, setOpen] = useState(false);
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];
  const url = typeof window !== "undefined" ? window.location.href : "";
  const text = `Habla con ${shortName}, candidato a ${profile.title} en ${profile.location}.`;

  const actions = [
    {
      icon: MessageCircle,
      label: "WhatsApp",
      color: "bg-green-500 hover:bg-green-400",
      onClick: () => window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`),
    },
    {
      icon: Facebook,
      label: "Facebook",
      color: "bg-blue-600 hover:bg-blue-500",
      onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`),
    },
    {
      icon: Copy,
      label: "Copiar",
      color: "bg-ink-100 hover:bg-ink-200",
      onClick: () => navigator.clipboard.writeText(url),
    },
  ];

  return (
    <div className="fixed bottom-6 right-4 sm:right-6 z-40 safe-bottom flex flex-col items-end gap-3">
      {actions.map((a, i) => (
        <motion.button
          key={a.label}
          initial={{ scale: 0, opacity: 0 }}
          animate={open ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ delay: open ? i * 0.05 : 0, type: "spring", stiffness: 300, damping: 20 }}
          onClick={a.onClick}
          className={`${a.color} text-white grid place-items-center h-12 w-12 rounded-full shadow-xl`}
          aria-label={a.label}>
          <a.icon size={20} />
        </motion.button>
      ))}
      <motion.button
        onClick={() => setOpen(!open)}
        whileTap={{ scale: 0.9 }}
        className="bg-gradient-to-br from-brand-400 to-brand-700 text-white grid place-items-center h-14 w-14 rounded-full shadow-2xl shadow-brand-500/40 animate-pulse-glow"
        aria-label="Compartir">
        {open ? <X size={22} /> : <Share2 size={22} />}
      </motion.button>
    </div>
  );
}
