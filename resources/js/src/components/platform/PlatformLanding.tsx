import type { ComponentType } from "react";
import { ArrowUpRight, FileText, MapPin, Users } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { ElectionCountdown } from "@/components/platform/ElectionCountdown";
import { VisitCounter } from "@/components/platform/VisitCounter";
import { DirectorioSelector } from "@/components/platform/DirectorioSelector";
import { getUbicaciones } from "@/lib/directorio";

/**
 * Primera vista de la plataforma (sin candidato): proceso electoral en grande,
 * cuenta regresiva a la jornada, contador de visitas y accesos directos.
 * Layout inspirado en portales cívicos de voto informado; marca y textos son de
 * PoliticOS (no es un sitio oficial del JNE, y lo dice en el pie).
 *
 * Para cambiar a dónde lleva cada tarjeta, edita solo el arreglo CARDS.
 */

interface Card {
  href: string;
  title: string;
  text: string;
  cta: string;
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  bg: string;          // color de fondo (AA con texto blanco)
  tall?: boolean;      // tarjeta alta (ocupa 2 filas en desktop)
}

const CARDS: Card[] = [
  {
    href: "/chat",
    title: "Pregúntale a la IA",
    text: "PEPA es nuestra IA neutral: compara propuestas y cita sus fuentes. Sin propaganda.",
    cta: "Consultar ahora",
    icon: Users,
    bg: "rgb(var(--brand-primary-rgb))",
    tall: true,
  },
  {
    href: "/propuestas",
    title: "Propuestas y planes de gobierno",
    text: "Qué proponen, por tema, con su fuente.",
    cta: "Ver propuestas",
    icon: FileText,
    bg: "#2F5D7E",
  },
  {
    href: "/distritos",
    title: "Mi comunidad",
    text: "Lugares y obras de tu distrito.",
    cta: "Explorar",
    icon: MapPin,
    bg: "#2E7D72",
  },
];

const JNE_URL = "https://votoinformado.jne.gob.pe/candidatos";

export async function PlatformLanding() {
  const accent = { color: "rgb(var(--brand-primary-rgb))" };
  // Solo lugares con candidato publicado + base de conocimiento lista (lo decide el API).
  const ubicaciones = await getUbicaciones();

  return (
    <main className="min-h-screen bg-[#EDEDED] text-ink-800">
      {/* Franja de marca */}
      <header style={{ background: "rgb(var(--brand-primary-rgb))" }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <TenantLink href="/" aria-label="PoliticOS — inicio" className="font-condensed text-[28px] uppercase leading-none tracking-wide text-white">
            Politic<span className="text-white/70">OS</span>
          </TenantLink>
          <nav aria-label="Principal" className="flex items-center gap-1 text-[13px] font-semibold text-white sm:gap-3">
            <TenantLink href="/propuestas" className="hidden rounded-full px-3 py-2 hover:bg-white/15 sm:block">
              Propuestas
            </TenantLink>
            <TenantLink href="/distritos" className="hidden rounded-full px-3 py-2 hover:bg-white/15 sm:block">
              Mi comunidad
            </TenantLink>
            <TenantLink href="/chat" className="rounded-full bg-white px-4 py-2 font-bold" style={accent}>
              Preguntar a la IA
            </TenantLink>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pt-14" aria-labelledby="hero-title">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-8">
          <div>
            <h1 id="hero-title" className="font-condensed leading-[.9] tracking-tight" style={{ fontSize: "clamp(72px, 13vw, 150px)" }}>
              <span style={accent}>ERM</span>
              <span className="text-ink-500">2026</span>
            </h1>
            <p className="mt-2 text-[clamp(20px,2.6vw,34px)] font-medium leading-tight text-ink-500">
              Elecciones Regionales y Municipales
            </p>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-500">
              Entiende la política con datos verificables. Sin propaganda: cada afirmación se puede rastrear hasta su fuente.
            </p>
            <VisitCounter className="mt-6" />
          </div>

          <ElectionCountdown />
        </div>
      </section>

      <DirectorioSelector ubicaciones={ubicaciones} />

      {/* Accesos directos */}
      <section className="mx-auto max-w-6xl px-5 pb-8" aria-label="Accesos directos">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[1fr_auto]">
          {CARDS.map(({ href, title, text, cta, icon: Icon, bg, tall }) => (
            <TenantLink
              key={href}
              href={href}
              className={`group flex flex-col justify-between rounded-3xl p-6 text-white shadow-sm transition
                          motion-safe:hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-800
                          ${tall ? "min-h-[280px] md:col-span-2 lg:col-span-1 lg:row-span-2" : "min-h-[190px]"}`}
              style={{ background: bg }}
            >
              <Icon size={tall ? 64 : 44} className="opacity-90" aria-hidden />
              <div className="mt-6">
                <h2 className={`font-bold leading-tight ${tall ? "text-[clamp(28px,3.2vw,38px)]" : "text-[clamp(22px,2.4vw,28px)]"}`}>
                  {title}
                </h2>
                <p className="mt-2 max-w-sm text-[14px] leading-snug text-white/90">{text}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold" style={{ color: bg }}>
                  {cta}
                  <ArrowUpRight size={15} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </span>
              </div>
            </TenantLink>
          ))}

          {/* Fuente oficial: neutralidad = mandar al dato original */}
          <a
            href={JNE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-4 rounded-3xl bg-ink-700 p-6 text-white shadow-sm transition hover:bg-ink-800 md:col-span-2
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-800"
          >
            <span>
              <span className="block text-[clamp(20px,2.2vw,26px)] font-bold leading-tight">Datos oficiales del JNE</span>
              <span className="mt-1 block text-[14px] text-white/80">
                Hoja de vida y plan de gobierno de cada candidato, en la fuente original.
              </span>
            </span>
            <ArrowUpRight size={28} className="shrink-0" aria-hidden />
          </a>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 pb-10 pt-2 text-center text-[12px] leading-relaxed text-ink-400">
        Transparencia · Neutralidad · Datos verificables. PoliticOS es una plataforma independiente y no es un sitio oficial del JNE ni de ningún organismo electoral.
      </footer>
    </main>
  );
}
