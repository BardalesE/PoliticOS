"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

export function ListaUnoBanner() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  return (
    <section
      className="relative overflow-hidden py-5 px-5"
      style={{ background: "var(--brand-grad)" }}
    >
      {/* Patrón sutil */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.3 }}
        className="relative z-10 max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3"
      >
        <div className="flex items-center gap-4 text-white">
          {profile.logo_url && (
            <img
              src={profile.logo_url}
              alt={profile.party || "Logo"}
              className="w-8 h-8 rounded-lg object-cover border border-white/20 shrink-0"
            />
          )}
          <div>
            {profile.party && (
              <p className="text-[10px] font-extrabold uppercase tracking-[2px] opacity-75">
                {profile.party}{profile.list_number ? ` · Lista N°${profile.list_number}` : ""}
              </p>
            )}
            <p className="font-serif font-bold text-sm sm:text-base leading-tight">
              {profile.name}
              {profile.title ? <span className="font-normal opacity-80"> · {profile.title}</span> : null}
            </p>
          </div>
        </div>

        <Link
          href="/chat"
          className="flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-extrabold uppercase tracking-wider px-4 py-2 rounded-full transition-colors shrink-0"
        >
          Hablar con {shortName} <ArrowRight size={12} />
        </Link>
      </motion.div>
    </section>
  );
}
