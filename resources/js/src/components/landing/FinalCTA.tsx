"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

export function FinalCTA() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  return (
    <section
      id="ia"
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgb(var(--brand-dark-rgb)), color-mix(in srgb, rgb(var(--brand-dark-rgb)) 50%, #04140a))",
      }}
    >
      {/* Orbs decorativos */}
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          top: "-120px", left: "-80px",
          width: "480px", height: "480px",
          background: "radial-gradient(circle, color-mix(in srgb, rgb(var(--brand-primary-rgb)) 25%, transparent), transparent 65%)",
        }}
      />
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          bottom: "-140px", right: "-60px",
          width: "420px", height: "420px",
          background: "radial-gradient(circle, color-mix(in srgb, rgb(var(--brand-dark-rgb)) 22%, transparent), transparent 65%)",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-5 py-20 md:py-28">
        <div className="grid md:grid-cols-[1fr_auto] gap-10 md:gap-14 items-center">

          {/* Texto */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, type: "spring", stiffness: 70 }}
          >
            <span
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-5"
              style={{ color: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)" }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)" }}
              />
              Asistente con IA
            </span>

            <h2
              className="font-serif font-semibold leading-[1.05] text-white mb-4"
              style={{ fontSize: "clamp(30px,4vw,46px)", maxWidth: "560px" }}
            >
              Pregúntale al asistente sobre el{" "}
              <em
                className="not-italic italic"
                style={{ color: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)" }}
              >
                plan de gobierno.
              </em>
            </h2>

            <p className="text-base max-w-[480px] mb-6" style={{ color: "#a9bdb0" }}>
              Un asistente entrenado con las propuestas oficiales. Responde tus dudas al instante, en lenguaje claro y sin promesas vacías.
            </p>

            <div className="flex items-center gap-2" style={{ color: "#86a08e", fontSize: "12.5px" }}>
              <span
                className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 80%, white)" }}
              />
              Asistente IA · no es {shortName} en persona
            </div>
          </motion.div>

          {/* Botón */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, type: "spring", stiffness: 70, delay: 0.1 }}
            className="shrink-0"
          >
            <motion.div
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <Link
                href="/chat"
                className="inline-flex items-center gap-2.5 bg-white hover:bg-gray-50 font-bold transition-all duration-200 rounded-full"
                style={{
                  color: "var(--page-ink)",
                  padding: "15px 28px",
                  fontSize: "15px",
                  boxShadow: "0 16px 34px -14px rgba(0,0,0,0.4)",
                }}
              >
                <MessageCircle size={18} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
                Conversar con el asistente
              </Link>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
