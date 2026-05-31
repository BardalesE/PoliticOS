"use client";
import { motion } from "framer-motion";
import { useCandidate } from "@/context/CandidateContext";

export function ListaUnoBanner() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  return (
    <section className="bg-brand-500 text-white py-8 px-5 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.25 }}
        className="max-w-3xl mx-auto"
      >
        <p className="text-[11px] font-extrabold uppercase tracking-[1.5px] opacity-95 mb-1">
          Vota el 4 de octubre de 2026
        </p>
        <p className="font-serif text-2xl md:text-3xl font-extrabold uppercase">
          {profile.party || "Perú Primero"}
        </p>
        <p className="text-sm font-bold mt-3 opacity-90">
          {shortName} · {profile.location.split("·")[0].trim()}
        </p>
      </motion.div>
    </section>
  );
}
