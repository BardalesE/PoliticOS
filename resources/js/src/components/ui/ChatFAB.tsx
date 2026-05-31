"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useCandidate } from "@/context/CandidateContext";

const SZ = {
  sm: { pill: "px-3 py-2",  icon: "w-5 h-5", circle: "w-10 h-10", text: "text-xs",   sub: "text-[10px]" },
  md: { pill: "px-4 py-3",  icon: "w-6 h-6", circle: "w-13 h-13", text: "text-sm",   sub: "text-xs"     },
  lg: { pill: "px-5 py-4",  icon: "w-7 h-7", circle: "w-15 h-15", text: "text-base", sub: "text-[11px]" },
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function ChatFAB() {
  const { profile, chatBtn } = useCandidate();
  const firstName = profile.name.split(" ")[0];
  const label     = chatBtn.text || `Conversar con ${firstName}`;
  const subtitle  = chatBtn.subtitle || "IA · 24/7";
  const size      = chatBtn.size || "md";
  const isCircle  = chatBtn.shape === "circle";
  const sz        = SZ[size] ?? SZ.md;

  const posClass  = chatBtn.position === "bottom-left"
    ? "bottom-4 left-4 md:bottom-6 md:left-6"
    : "bottom-4 right-4 md:bottom-6 md:right-6";

  const colorStyle = chatBtn.color
    ? { backgroundColor: chatBtn.color, boxShadow: `0 0 0 4px ${chatBtn.color}40` }
    : undefined;

  const baseClass = `text-white shadow-lg transition-all duration-200 active:scale-95
    ${chatBtn.color ? "" : "bg-chat-500 hover:bg-chat-600 ring-4 ring-chat-500/25"}`;

  if (isCircle) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.25 }}
        className={`fixed z-50 ${posClass}`}
      >
        <Link href="/chat" aria-label={label} style={colorStyle}
          className={`${sz.circle} rounded-full flex items-center justify-center ${baseClass}`}>
          <WhatsAppIcon className={sz.icon} />
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.25 }}
      className={`fixed z-50 ${posClass}`}
    >
      <Link href="/chat" aria-label={label} style={colorStyle}
        className={`flex items-center gap-3 rounded-full ${sz.pill} ${baseClass}`}>
        <WhatsAppIcon className={`${sz.icon} shrink-0`} />
        <div className="hidden sm:block leading-tight">
          <p className={`font-extrabold ${sz.text}`}>{label}</p>
          <p className={`opacity-75 font-semibold ${sz.sub}`}>{subtitle}</p>
        </div>
      </Link>
    </motion.div>
  );
}
