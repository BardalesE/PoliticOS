"use client";
import dynamic from "next/dynamic";

// ── Crítico (above-fold) — carga inmediata ────────────────────────────────────
import { Navbar }            from "@/components/ui/Navbar";
import { Hero }              from "@/components/landing/Hero";
import { StatsBar }          from "@/components/landing/StatsBar";
import { Countdown }         from "@/components/landing/Countdown";
import { LiveStreamBanner }  from "@/components/landing/LiveStreamBanner";

// ── Bajo el fold — carga diferida (split de bundle) ──────────────────────────
const DosVias         = dynamic(() => import("@/components/landing/DosVias").then(m => ({ default: m.DosVias })));
const BioSection      = dynamic(() => import("@/components/landing/BioSection").then(m => ({ default: m.BioSection })));
const HomeTabs        = dynamic(() => import("@/components/landing/HomeTabs").then(m => ({ default: m.HomeTabs })));
const Connection      = dynamic(() => import("@/components/landing/Connection").then(m => ({ default: m.Connection })));
const Footer          = dynamic(() => import("@/components/ui/Footer").then(m => ({ default: m.Footer })));
const ChatFAB         = dynamic(() => import("@/components/ui/ChatFAB").then(m => ({ default: m.ChatFAB })));

import type {
  HomeSettings, HeroSettings,
  Proposal, CampaignEvent, TeamMember,
  CampaignPhoto, CampaignVideo,
} from "@/lib/api";

const DEFAULTS: HomeSettings = {
  show_hero:          "1",
  show_bio:           "1",
  show_assistant:     "1",
  show_proposals:     "1",
  show_multimedia:    "1",
  show_documents:     "1",
  show_events:        "1",
  show_districts:     "1",
  show_team:          "1",
  show_opinion:       "1",
  show_connection:    "1",
  events_title:       "Próximos encuentros con el pueblo.",
  events_badge:       "Agenda",
  election_date_iso:  "2026-10-04",
};

function on(s: HomeSettings, key: string): boolean {
  return s[key] !== "0";
}

interface Props {
  initialHero?:      HeroSettings | null;
  initialSettings?:  HomeSettings | null;
  initialProposals?: Proposal[];
  initialEvents?:    CampaignEvent[];
  initialFeatured?:  CampaignEvent | null;
  initialTeam?:      TeamMember[];
  initialGallery?:   CampaignPhoto[];
  initialVideos?:    CampaignVideo[];
}

export default function DynamicHome({
  initialHero,
  initialSettings,
  initialProposals = [],
  initialEvents    = [],
  initialFeatured  = null,
  initialTeam      = [],
  initialGallery   = [],
  initialVideos    = [],
}: Props) {
  const settings = { ...DEFAULTS, ...(initialSettings ?? {}) };

  // Fase 7 (mockup rigo_home_7tabs validado): la home dejó el scroll continuo.
  // Arriba queda el bloque siempre visible (gancho + identidad + doble vía);
  // las 7 secciones de contenido viven en HomeTabs, con la pestaña activa en
  // la URL (?seccion=) para que los links internos puedan abrirlas.
  //
  // AssistantPreview ("Servicios al ciudadano") YA NO se renderiza a propósito
  // — no lo reactives sin saber que es redundante: sus 4 tarjetas están
  // cubiertas por DosVias (chat + "dile qué necesita"), la pestaña "Base del
  // Conocimiento" (transparencia + documentos) y "Lugares Visitados"
  // (reclamos por caserío). El archivo se conserva por si se rediseña.
  //
  // OpinionSection tampoco se renderiza aquí: es un Modal (OpinionModal) que
  // abre el botón "Dile qué necesita tu caserío" dentro de DosVias.
  return (
    <main className="landing-main">
      <LiveStreamBanner />
      <Navbar />
      {on(settings, "show_hero")       && <Hero initialHero={initialHero ?? null} />}
      <Countdown featured={initialFeatured} electionDateIso={settings.election_date_iso} />
      {on(settings, "show_hero")       && <StatsBar proposalsCount={initialProposals.length} settings={settings} />}
      {on(settings, "show_assistant") && on(settings, "show_opinion") && <DosVias />}
      {on(settings, "show_bio")        && <BioSection />}
      <HomeTabs
        settings={settings}
        initialProposals={initialProposals}
        initialEvents={initialEvents}
        initialFeatured={initialFeatured}
        initialTeam={initialTeam}
        initialGallery={initialGallery}
        initialVideos={initialVideos}
      />
      {on(settings, "show_connection") && <Connection />}
      <Footer />
      <ChatFAB />
    </main>
  );
}
