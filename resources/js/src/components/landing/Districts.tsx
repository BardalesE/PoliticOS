"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

export function Districts() {
  const { districts } = useCandidate();

  return (
    <section className="relative bg-white py-20 md:py-28 px-5 overflow-hidden">
      {/* Fondo decorativo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% 100%, #FEF2F2 0%, transparent 60%)",
        }}
      />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <span className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-extrabold uppercase tracking-[2px] px-4 py-2 rounded-full mb-4">
            <MapPin size={11} />
            {districts.length || 13} caseríos
          </span>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mt-3">
            Conociendo cada rincón de{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #DC2626, #EF4444)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              nuestra tierra.
            </span>
          </h2>
          <p className="text-ink-500 mt-3 font-medium">
            Haz clic en tu caserío para ver qué haremos por ti.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {districts.map((district, i) => (
            <motion.div
              key={district}
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.04, type: "spring", stiffness: 90 }}
            >
              <motion.div whileHover={{ y: -3, scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                <Link
                  href={`/chat?q=${encodeURIComponent(`¿Qué harás en ${district}?`)}`}
                  className="group flex items-center gap-3 p-3.5 rounded-xl bg-white border border-ink-200 hover:border-brand-400 transition-all duration-200 overflow-hidden relative"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 8px 24px rgba(220,38,38,0.12)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
                  }}
                >
                  {/* Barra izquierda animada */}
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand-500 scale-y-0 group-hover:scale-y-100 transition-transform duration-200 origin-top rounded-r" />

                  <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-all duration-200 flex-shrink-0 border border-brand-100 group-hover:border-brand-600">
                    <MapPin size={13} />
                  </span>
                  <span className="text-sm font-semibold text-ink-700 group-hover:text-brand-700 transition-colors leading-tight flex-1">
                    {district}
                  </span>
                  <ArrowRight size={12} className="text-ink-300 group-hover:text-brand-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" />
                </Link>
              </motion.div>
            </motion.div>
          ))}
        </div>

        {districts.length === 0 && (
          <p className="text-ink-500 text-sm font-medium text-center">Cargando caseríos...</p>
        )}
      </div>
    </section>
  );
}
