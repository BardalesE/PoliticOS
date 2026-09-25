import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Leaf } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { ElectionCountdown } from "@/components/platform/ElectionCountdown";
import { VisitCounter } from "@/components/platform/VisitCounter";
import { DirectorioSelector } from "@/components/platform/DirectorioSelector";
import { getUbicaciones } from "@/lib/directorio";

/**
 * Primera vista de la plataforma (sin candidato): proceso electoral en grande,
 * cuenta regresiva, buscador de candidatos por lugar y dos accesos (IA + JNE).
 *
 * Identidad "eco": la paleta verde se fija AQUÍ con variables CSS locales, así
 * no depende del brand dinámico de los tenants (CandidateContext) ni lo pisa.
 * Todo lo que usa rgb(var(--brand-primary-rgb)) dentro de <main> sale verde.
 *
 * Decisión 2026-09-24: se retiran de la home los accesos a /propuestas y
 * /distritos (sacaban al usuario de la página). Las rutas siguen existiendo.
 */

const ECO_THEME = {
  "--brand-primary-rgb": "20 83 45",   // #14532D bosque — AA 9:1 con blanco
  "--brand-dark-rgb":    "12 58 31",   // #0C3A1F
} as CSSProperties;

const LEAF = "#2F7D4F";                // verde hoja — AA 5:1 con blanco
const JNE_URL = "https://votoinformado.jne.gob.pe/candidatos";

export async function PlatformLanding() {
  const accent = { color: "rgb(var(--brand-primary-rgb))" };
  // Solo lugares con candidato publicado + base de conocimiento lista (lo decide el API).
  const ubicaciones = await getUbicaciones();

  return (
    <main style={ECO_THEME} className="relative min-h-screen overflow-hidden bg-[#F2F6EF] text-ink-800">
      {/* Fondo orgánico sutil (decorativo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-16 -z-0 h-[520px] opacity-70"
        style={{
          background:
            "radial-gradient(40% 60% at 85% 20%, rgb(47 125 79 / .16), transparent 70%)," +
            "radial-gradient(35% 50% at 5% 60%, rgb(163 217 165 / .35), transparent 70%)",
        }}
      />

      {/* Franja de marca */}
      <header className="relative z-10" style={{ background: "rgb(var(--brand-primary-rgb))" }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="PoliticOS — inicio" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/politicos-mark.webp"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-full bg-black object-cover ring-2 ring-white/30"
            />
            <span className="font-condensed text-[28px] uppercase leading-none tracking-wide text-white">
              Politic<span className="text-[#A3D9A5]">OS</span>
            </span>
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1 text-[13px] font-semibold text-white sm:gap-3">
            <a href="#directorio" className="hidden rounded-full px-3 py-2 hover:bg-white/15 sm:block">
              Candidatos
            </a>
            <TenantLink href="/chat" className="rounded-full bg-white px-4 py-2 font-bold" style={accent}>
              Preguntar a la IA
            </TenantLink>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pt-14" aria-labelledby="hero-title">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-8">
          <div>
            <h1 id="hero-title" className="font-condensed leading-[.9] tracking-tight" style={{ fontSize: "clamp(72px, 13vw, 150px)" }}>
              <span style={accent}>ERM</span>
              <span style={{ color: LEAF }}>2026</span>
            </h1>
            <p className="mt-2 text-[clamp(20px,2.6vw,34px)] font-medium leading-tight text-ink-600">
              Elecciones Regionales y Municipales
            </p>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-500">
              Entiende la política con datos verificables. Sin propaganda: cada afirmación se puede rastrear hasta su fuente.
            </p>
            <p className="mt-4 inline-flex max-w-md items-start gap-2 rounded-2xl bg-white/80 px-4 py-3 text-[13px] leading-snug text-ink-600 ring-1 ring-[#2F7D4F]/15">
              <Leaf size={18} className="mt-0.5 shrink-0" style={{ color: LEAF }} aria-hidden />
              <span>
                <strong className="font-bold" style={accent}>Infórmate sin papel.</strong>{" "}
                Todo está aquí, en digital: menos volantes impresos, menos basura electoral.
              </span>
            </p>
            <VisitCounter className="mt-6" />
          </div>

          <ElectionCountdown />
        </div>
      </section>

      <div className="relative z-10">
        <DirectorioSelector ubicaciones={ubicaciones} />
      </div>

      {/* Accesos: la IA dentro de la plataforma + la fuente oficial */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-8" aria-label="Accesos directos">
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <TenantLink
            href="/chat"
            className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-3xl p-6 text-white shadow-sm transition
                       motion-safe:hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-800 sm:p-8"
            style={{ background: "linear-gradient(135deg, rgb(var(--brand-primary-rgb)), #2F7D4F)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/politicos-mark.webp"
              alt=""
              aria-hidden
              className="pointer-events-none absolute -bottom-6 -right-6 h-48 w-48 rounded-full object-cover opacity-25 mix-blend-screen sm:h-56 sm:w-56"
            />
            <Bot size={48} className="relative opacity-90" aria-hidden />
            <div className="relative mt-6">
              <h2 className="text-[clamp(28px,3.2vw,38px)] font-bold leading-tight">Pregúntale a la IA</h2>
              <p className="mt-2 max-w-sm text-[14px] leading-snug text-white/90">
                PEPA es nuestra IA neutral: compara propuestas y cita sus fuentes. Sin propaganda.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold" style={accent}>
                Consultar ahora
                <ArrowUpRight size={15} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
              </span>
            </div>
          </TenantLink>

          {/* Fuente oficial: neutralidad = mandar al dato original */}
          <a
            href={JNE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col justify-between gap-4 rounded-3xl bg-white p-6 text-ink-800 shadow-sm ring-1 ring-black/5 transition hover:shadow-md sm:p-8
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-800"
          >
            <ArrowUpRight size={28} className="self-end" style={accent} aria-hidden />
            <span>
              <span className="block text-[clamp(20px,2.2vw,26px)] font-bold leading-tight">Datos oficiales del JNE</span>
              <span className="mt-1 block text-[14px] text-ink-500">
                Hoja de vida y plan de gobierno de cada candidato, en la fuente original.
              </span>
            </span>
          </a>
        </div>
      </section>

      <footer className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-2 text-center text-[12px] leading-relaxed text-ink-400">
        Transparencia · Neutralidad · Datos verificables. PoliticOS es una plataforma independiente y no es un sitio oficial del JNE ni de ningún organismo electoral.
      </footer>
    </main>
  );
}
