"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { TenantLink } from "@/components/ui/TenantLink";
import { ChevronDown, LocateFixed, Search } from "lucide-react";
import { resolveTenantSlug, withTenant, type HeroSettings } from "@/lib/api";
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
          className="relative inline-block"
          style={{ color: onDark ? "rgb(var(--brand-primary-rgb))" : "rgb(var(--brand-primary-rgb))" }}
        >
          {part.slice(1, -1)}
        </span>
      );
    return <span key={i}>{part}</span>;
  });
}

export function Hero({ initialHero }: HeroProps) {
  const { profile, districts } = useCandidate();
  const [videoError, setVideoError] = useState(false);
  const [zone, setZone] = useState("");
  const router = useRouter();

  // Navegación programática preservando ?tenant= (mismo mecanismo que TenantLink)
  const goTenant = (href: string) => {
    const slug = resolveTenantSlug();
    router.push(slug ? withTenant(href, slug) : href);
  };

  // Búsqueda por zona: misma lógica que las tarjetas de Districts (plan local vía chat)
  const handleZoneSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = zone.trim();
    if (!q) return;
    const match = districts.find((d) => d.toLowerCase().includes(q.toLowerCase()));
    goTenant(`/chat?q=${encodeURIComponent(`¿Qué harás en ${match ?? q}?`)}`);
  };

  // "Mi zona": mismo mecanismo GPS del navegador que ya usa el chat (browser_lat/lng).
  // TODO: mapear lat/lng → distrito cuando la API exponga ese lookup; mientras
  // tanto lleva a la sección/página de territorios sin inventar backend.
  const handleMyZone = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => {
        const el = document.getElementById("caserios");
        if (el) el.scrollIntoView({ behavior: "smooth" });
        else goTenant("/distritos");
      },
      () => {} // silencioso si deniega, igual que en el chat
    );
  };

  const location = profile.location.split("·")[0].trim() || profile.location;
  const d = {
    title:      initialHero?.title           ?? profile.tagline ?? "Un *compromiso* real\ncon nuestra gente.",
    subtitle:   initialHero?.subtitle        ?? (profile.title ? `${profile.title} · ${profile.location}` : profile.location),
    badge_text: initialHero?.badge_text      ?? (profile.party ? `${profile.party}${profile.list_number ? ` · Lista N°${profile.list_number}` : ""}` : "Campaña Electoral"),
    btn1_label: initialHero?.btn1_label      ?? "Conocer propuestas",
    btn1_url:   initialHero?.btn1_url        ?? "/propuestas",
    btn2_label: initialHero?.btn2_label      ?? "Sobre el candidato",
    btn2_url:   initialHero?.btn2_url        ?? "#bio",
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
    show: { transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
  };

  return (
    <section
      className={`relative overflow-hidden ${
        onDark
          ? "min-h-screen flex items-center"
          : "bg-white min-h-[90vh] flex items-center"
      }`}
      style={!onDark ? { borderBottom: "1px solid var(--page-line)" } : undefined}
    >
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
              background: `linear-gradient(180deg, rgba(0,0,0,${d.opacity * 0.75}) 0%, rgba(0,0,0,${d.opacity}) 100%)`,
            }}
          />
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
          <motion.div variants={item} className="mb-6">
            <span
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[1.5px] ${
                onDark
                  ? "border border-white/25 text-white/85"
                  : "border text-ink-600"
              }`}
              style={!onDark ? { borderColor: "var(--page-line)" } : undefined}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "rgb(var(--brand-primary-rgb))" }}
              />
              {d.badge_text}
            </span>
          </motion.div>

          {/* Título */}
          <motion.h1
            variants={item}
            className={`font-serif font-semibold leading-[1.05] tracking-tight mb-6
              text-4xl sm:text-5xl md:text-6xl lg:text-7xl
              ${onDark ? "text-white" : "text-ink-900"}`}
          >
            {renderTitleWithEmphasis(d.title, onDark)}
          </motion.h1>

          {/* Línea decorativa */}
          <motion.div
            variants={item}
            className="w-14 h-[3px] rounded-full mb-6"
            style={{ background: "rgb(var(--brand-primary-rgb))" }}
          />

          {/* Subtítulo */}
          {d.subtitle && (
            <motion.p
              variants={item}
              className={`text-base md:text-lg font-medium max-w-2xl mb-9 leading-relaxed ${
                onDark ? "text-white/75" : "text-ink-600"
              }`}
            >
              {d.subtitle}
            </motion.p>
          )}

          {/* CTAs */}
          <motion.div variants={item} className="flex flex-wrap items-center gap-3 mb-6">
            {d.btn1_label && d.btn1_url && (
              <TenantLink
                href={d.btn1_url}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wide transition-colors duration-150 ${
                  onDark
                    ? "bg-white text-ink-900 hover:bg-white/90"
                    : "text-white"
                }`}
                style={!onDark ? { background: "rgb(var(--brand-primary-rgb))" } : undefined}
              >
                {d.btn1_label}
              </TenantLink>
            )}
            {d.btn2_label && d.btn2_url && (
              <TenantLink
                href={d.btn2_url}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wide border transition-colors duration-150 ${
                  onDark
                    ? "border-white/30 text-white hover:bg-white/10"
                    : "text-ink-700 hover:bg-ink-50"
                }`}
                style={!onDark ? { borderColor: "var(--page-line)" } : undefined}
              >
                {d.btn2_label}
              </TenantLink>
            )}
            {d.btn3_label && d.btn3_url && (
              <TenantLink
                href={d.btn3_url}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wide border transition-colors duration-150 ${
                  onDark
                    ? "border-white/30 text-white hover:bg-white/10"
                    : "text-ink-700 hover:bg-ink-50"
                }`}
                style={!onDark ? { borderColor: "var(--page-line)" } : undefined}
              >
                {d.btn3_label}
              </TenantLink>
            )}
          </motion.div>

          {/* Búsqueda por zona */}
          <motion.form
            variants={item}
            role="search"
            onSubmit={handleZoneSearch}
            className={`flex w-full max-w-md items-stretch gap-1.5 mb-10 rounded-xl p-1 border ${
              onDark ? "bg-white/8 border-white/20" : "bg-white"
            }`}
            style={!onDark ? { borderColor: "var(--page-line)" } : undefined}
          >
            <label htmlFor="hero-zone" className="sr-only">
              Buscar propuestas por caserío o zona
            </label>
            <Search
              size={15}
              aria-hidden
              className={`self-center ml-2 shrink-0 ${onDark ? "text-white/50" : "text-ink-400"}`}
            />
            <input
              id="hero-zone"
              list="hero-zone-list"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Escribe tu caserío o zona…"
              className={`flex-1 min-w-0 bg-transparent px-2 py-2 text-sm font-medium outline-none ${
                onDark ? "text-white placeholder-white/50" : "text-ink-900 placeholder-ink-400"
              }`}
            />
            <datalist id="hero-zone-list">
              {districts.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={handleMyZone}
              aria-label="Detectar mi zona con mi ubicación"
              className={`inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide shrink-0 transition-colors ${
                onDark
                  ? "border border-white/20 text-white hover:bg-white/10"
                  : "border text-ink-600 hover:bg-ink-50"
              }`}
              style={!onDark ? { borderColor: "var(--page-line)" } : undefined}
            >
              <LocateFixed size={13} aria-hidden />
              <span className="hidden sm:inline">Mi zona</span>
            </button>
            <button
              type="submit"
              aria-label="Buscar propuestas en la zona"
              className="inline-flex items-center justify-center px-3.5 rounded-lg text-white shrink-0 transition-colors"
              style={{ background: "rgb(var(--brand-primary-rgb))" }}
            >
              <Search size={15} aria-hidden />
            </button>
          </motion.form>

          {/* Status bar */}
          <motion.div
            variants={item}
            className={`flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium ${
              onDark ? "text-white/50" : "text-ink-400"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
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
          onDark ? "text-white/35" : "text-ink-300"
        }`}
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-[10px] uppercase tracking-[2px] font-bold">scroll</span>
        <ChevronDown size={16} />
      </motion.div>
    </section>
  );
}
