"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Sparkles } from "lucide-react";
import type { HeroSettings } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";

interface HeroProps {
  initialHero?: HeroSettings | null;
}


function renderTitleWithEmphasis(title: string, onDark: boolean) {
  return title.split(/(\*[^*]+\*|\n)/).map((part, i) => {
    if (part === "\n") return <br key={i} />;
    if (part.startsWith("*") && part.endsWith("*"))
      return (
        <span
          key={i}
          className={`relative inline-block ${onDark ? "text-brand-300" : ""}`}
          style={
            !onDark
              ? {
                  background: "var(--brand-grad)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }
              : {}
          }
        >
          {part.slice(1, -1)}
        </span>
      );
    return <span key={i}>{part}</span>;
  });
}

const floatingOrbs = [
  { size: 500, top: "-10%", right: "-5%", color: "from-brand-100/60 to-brand-50/20", delay: 0 },
  { size: 350, bottom: "5%", left: "-8%", color: "from-brand-200/40 to-transparent", delay: 1.5 },
  { size: 200, top: "40%", right: "15%", color: "from-brand-500/5 to-transparent", delay: 3 },
];

export function Hero({ initialHero }: HeroProps) {
  const { profile } = useCandidate();
  const [videoError, setVideoError] = useState(false);

  const location = profile.location.split("·")[0].trim() || profile.location;
  const d = {
    title:      initialHero?.title           ?? profile.tagline ?? "Un *compromiso* real\ncon nuestra gente.",
    subtitle:   initialHero?.subtitle        ?? (profile.title ? `${profile.title} · ${profile.location}` : profile.location),
    badge_text: initialHero?.badge_text      ?? (profile.party ? `${profile.party}${profile.list_number ? ` · Lista N°${profile.list_number}` : ""}` : "Campaña Electoral"),
    btn1_label: initialHero?.btn1_label      ?? "Conocer propuestas",
    btn1_url:   initialHero?.btn1_url        ?? "/propuestas",
    btn2_label: initialHero?.btn2_label      ?? "Sobre el candidato",
    btn2_url:   initialHero?.btn2_url        ?? "#sobre",
    btn3_label: initialHero?.btn3_label      ?? null,
    btn3_url:   initialHero?.btn3_url        ?? null,
    video_url:      initialHero?.video_url       ?? null,
    image_url:      initialHero?.image_url       ?? null,
    opacity:        initialHero?.overlay_opacity ?? 0.55,
    overlay_color:  initialHero?.overlay_color   ?? null,
  };

  const hasBackground = (d.video_url && !videoError) || d.image_url;
  const onDark = !!hasBackground;

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12 } },
  };
  const item = {
    hidden: { opacity: 0, y: 32 },
    show:   { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 70, damping: 18 } },
  };

  return (
    <section
      className={`relative overflow-hidden ${
        onDark
          ? "min-h-screen flex items-center"
          : "bg-white min-h-[94vh] flex items-center"
      }`}
    >
      {/* ── Fondo blanco: orbs decorativos + grid (CSS-only, sin JS) ── */}
      {!hasBackground && (
        <>
          <div className={`absolute rounded-full bg-gradient-to-br ${floatingOrbs[0].color} blur-3xl pointer-events-none anim-orb-1`}
            style={{ width: floatingOrbs[0].size, height: floatingOrbs[0].size, top: floatingOrbs[0].top, right: floatingOrbs[0].right }} />
          <div className={`absolute rounded-full bg-gradient-to-br ${floatingOrbs[1].color} blur-3xl pointer-events-none anim-orb-2`}
            style={{ width: floatingOrbs[1].size, height: floatingOrbs[1].size, bottom: floatingOrbs[1].bottom, left: floatingOrbs[1].left }} />
          <div className={`absolute rounded-full bg-gradient-to-br ${floatingOrbs[2].color} blur-3xl pointer-events-none anim-orb-3`}
            style={{ width: floatingOrbs[2].size, height: floatingOrbs[2].size, top: floatingOrbs[2].top, right: floatingOrbs[2].right }} />

          {/* Dot grid */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle, rgb(var(--brand-primary-rgb) / 0.06) 1.5px, transparent 1.5px)",
              backgroundSize: "36px 36px",
            }}
          />

          {/* Anillos concéntricos — CSS puro */}
          <div className="absolute rounded-full border border-brand-500/10 pointer-events-none anim-ring-1"
            style={{ width: 280, height: 280, top: "50%", left: "75%", transform: "translate(-50%,-50%)" }} />
          <div className="absolute rounded-full border border-brand-500/10 pointer-events-none anim-ring-2"
            style={{ width: 500, height: 500, top: "50%", left: "75%", transform: "translate(-50%,-50%)" }} />
          <div className="absolute rounded-full border border-brand-500/10 pointer-events-none anim-ring-3"
            style={{ width: 720, height: 720, top: "50%", left: "75%", transform: "translate(-50%,-50%)" }} />
        </>
      )}

      {/* ── Fondo: video o imagen ── */}
      {hasBackground && (
        <>
          {d.video_url && !videoError ? (
            <video
              src={d.video_url}
              autoPlay muted loop playsInline
              onError={() => setVideoError(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : d.image_url ? (
            <Image src={d.image_url} alt="" fill priority className="object-cover" />
          ) : null}

          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(160deg, rgba(0,0,0,${d.opacity * 0.7}) 0%, rgba(0,0,0,${d.opacity}) 100%)`,
            }}
          />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/40 to-transparent" />
        </>
      )}

      {/* ── Contenido ── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className={`relative z-10 w-full px-5 ${onDark ? "py-28 md:py-36" : "py-20 md:py-28"}`}
      >
        <div className="max-w-5xl mx-auto">

          {/* Badge */}
          <motion.div variants={item} className="mb-7">
            <span
              className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-[2px] ${
                onDark
                  ? "bg-white/10 backdrop-blur-md border border-white/20 text-white/90"
                  : "bg-brand-50 border border-brand-200 text-brand-700 shadow-sm"
              }`}
            >
              <Sparkles size={12} className="shrink-0" />
              {d.badge_text}
              <Sparkles size={12} className="shrink-0" />
            </span>
          </motion.div>

          {/* Título */}
          <motion.h1
            variants={item}
            className={`font-serif font-extrabold leading-[1.0] tracking-tight mb-6
              text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem]
              ${onDark ? "text-white" : "text-ink-900"}`}
          >
            {renderTitleWithEmphasis(d.title, onDark)}
          </motion.h1>

          {/* Línea decorativa */}
          <motion.div
            variants={item}
            className={`w-20 h-1.5 rounded-full mb-6 ${onDark ? "bg-brand-400" : "bg-brand-500"}`}
          />

          {/* Subtítulo */}
          {d.subtitle && (
            <motion.p
              variants={item}
              className={`text-lg md:text-xl font-medium max-w-2xl mb-10 leading-relaxed ${
                onDark ? "text-white/80" : "text-ink-600"
              }`}
            >
              {d.subtitle}
            </motion.p>
          )}

          {/* CTAs */}
          <motion.div variants={item} className="flex flex-wrap items-center gap-4 mb-12">
            {d.btn1_label && d.btn1_url && (
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link
                  href={d.btn1_url}
                  className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-extrabold uppercase tracking-wider shadow-lg transition-all duration-200 ${
                    onDark
                      ? "bg-brand-500 hover:bg-brand-600 text-white shadow-brand-500/30 hover:shadow-brand-500/50"
                      : "bg-brand-700 hover:bg-brand-900 text-white shadow-brand-700/30 hover:shadow-brand-700/50"
                  }`}
                  style={{ boxShadow: onDark ? undefined : "0 8px 30px var(--brand-glow-35)" }}
                >
                  {d.btn1_label}
                </Link>
              </motion.div>
            )}
            {d.btn2_label && d.btn2_url && (
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link
                  href={d.btn2_url}
                  className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-extrabold uppercase tracking-wider transition-all duration-200 ${
                    onDark
                      ? "border-2 border-white/40 text-white hover:bg-white/10"
                      : "border-2 border-brand-700 text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  {d.btn2_label}
                </Link>
              </motion.div>
            )}
            {d.btn3_label && d.btn3_url && (
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link
                  href={d.btn3_url}
                  className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-extrabold uppercase tracking-wider transition-all duration-200 ${
                    onDark
                      ? "border-2 border-white/40 text-white hover:bg-white/10"
                      : "border-2 border-brand-700 text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  {d.btn3_label}
                </Link>
              </motion.div>
            )}
          </motion.div>

          {/* Status bar */}
          <motion.div
            variants={item}
            className={`flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-semibold ${
              onDark ? "text-white/55" : "text-ink-400"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chat-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-chat-500" />
              </span>
              Asistente IA en línea
            </div>
            <span className={`hidden sm:block h-3 w-px ${onDark ? "bg-white/20" : "bg-ink-200"}`} />
            <span>{profile.location}</span>
            <span className={`hidden sm:block h-3 w-px ${onDark ? "bg-white/20" : "bg-ink-200"}`} />
            <span>Elecciones: {profile.election_date ?? "2026"}</span>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 ${
          onDark ? "text-white/40" : "text-ink-300"
        }`}
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-[10px] uppercase tracking-[2px] font-bold">scroll</span>
        <ChevronDown size={18} />
      </motion.div>

      {/* Franja inferior */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: "linear-gradient(90deg, rgb(var(--brand-primary-rgb)), rgb(var(--brand-dark-rgb)), rgb(var(--brand-primary-rgb)))" }}
      />
    </section>
  );
}
