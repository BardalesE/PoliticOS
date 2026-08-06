"use client";
import dynamic from "next/dynamic";

// ── Crítico (above-fold) — carga inmediata ────────────────────────────────────
import { Navbar }            from "@/components/ui/Navbar";
import { Hero }              from "@/components/landing/Hero";
import { StatsBar }          from "@/components/landing/StatsBar";
import { Countdown }         from "@/components/landing/Countdown";
import { LiveStreamBanner }  from "@/components/landing/LiveStreamBanner";

// ── Bajo el fold — carga diferida (split de bundle) ──────────────────────────
// Orden = orden narrativo real de la home (Fase D del rediseño): historia de
// vida → resultados → motivación → objetivos → comunidad → prueba social →
// participación, y solo al final la profundización por pestañas (HomeTabs).
const BioSection          = dynamic(() => import("@/components/landing/BioSection").then(m => ({ default: m.BioSection })));
const AchievementGrid     = dynamic(() => import("@/components/landing/AchievementGrid").then(m => ({ default: m.AchievementGrid })));
const BeforeAfterGallery  = dynamic(() => import("@/components/landing/BeforeAfterGallery").then(m => ({ default: m.BeforeAfterGallery })));
const WhyRunning          = dynamic(() => import("@/components/landing/WhyRunning").then(m => ({ default: m.WhyRunning })));
const Differentiator      = dynamic(() => import("@/components/landing/Differentiator").then(m => ({ default: m.Differentiator })));
const GoalCards           = dynamic(() => import("@/components/landing/GoalCards").then(m => ({ default: m.GoalCards })));
const CommunityTimeline   = dynamic(() => import("@/components/landing/CommunityTimeline").then(m => ({ default: m.CommunityTimeline })));
const TestimonialCarousel = dynamic(() => import("@/components/landing/TestimonialCarousel").then(m => ({ default: m.TestimonialCarousel })));
const VideoMessage        = dynamic(() => import("@/components/landing/VideoMessage").then(m => ({ default: m.VideoMessage })));
const ParticipateCTA      = dynamic(() => import("@/components/landing/ParticipateCTA").then(m => ({ default: m.ParticipateCTA })));
const HomeTabs            = dynamic(() => import("@/components/landing/HomeTabs").then(m => ({ default: m.HomeTabs })));
const Footer              = dynamic(() => import("@/components/ui/Footer").then(m => ({ default: m.Footer })));
const ChatFAB             = dynamic(() => import("@/components/ui/ChatFAB").then(m => ({ default: m.ChatFAB })));
const SocialFAB           = dynamic(() => import("@/components/ui/SocialFAB").then(m => ({ default: m.SocialFAB })));
const StickyCampaignBar   = dynamic(() => import("@/components/ui/StickyCampaignBar").then(m => ({ default: m.StickyCampaignBar })));
const MobileBottomNav     = dynamic(() => import("@/components/ui/MobileBottomNav").then(m => ({ default: m.MobileBottomNav })));
const ScrollToTopFab      = dynamic(() => import("@/components/ui/ScrollToTopFab").then(m => ({ default: m.ScrollToTopFab })));

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

  // Fase D (rediseño narrativo): la home vuelve a ser scroll continuo, ahora
  // contando una historia de vida real en vez de solo mostrar un portal
  // institucional — Hero → ¿Quién soy?/Historia → Resultados → Obras →
  // Motivación → Objetivos → Comunidad → Testimonios → Video → Participa, y
  // solo AL FINAL el sistema de pestañas (HomeTabs) queda como "Explora todo"
  // para quien quiera profundizar en el contenido completo (documentos,
  // galería, equipo, etc.) — no se eliminó nada de lo que ya funcionaba.
  //
  // DosVias/OpinionModal se eliminaron (ver commit): ParticipateCTA es un
  // superset de su funcionalidad (chat + formulario WhatsApp + ConcernsWidget)
  // y quedaron sin ningún otro consumidor tras este cambio.
  //
  // AssistantPreview NUNCA se renderiza a propósito (ver nota histórica: sus
  // 4 tarjetas ya están cubiertas por ParticipateCTA + pestañas de HomeTabs).
  return (
    <main className="landing-main">
      {/* Franja superior fija — acento del rediseño "documental", por
          encima del Navbar (que es sticky, no fixed, así que no compite). */}
      <div
        className="fixed top-0 inset-x-0 h-[3px] z-[60] pointer-events-none"
        style={{ background: "rgb(var(--brand-primary-rgb))" }}
      />
      <LiveStreamBanner />
      <Navbar />
      {on(settings, "show_hero") && <Hero initialHero={initialHero ?? null} />}
      <Countdown featured={initialFeatured} electionDateIso={settings.election_date_iso} />
      {on(settings, "show_hero") && <StatsBar proposalsCount={initialProposals.length} settings={settings} />}
      {on(settings, "show_bio") && <BioSection />}
      <AchievementGrid />
      <BeforeAfterGallery />
      <WhyRunning />
      <Differentiator />
      <GoalCards />
      <CommunityTimeline />
      <TestimonialCarousel />
      <VideoMessage />
      {on(settings, "show_assistant") && on(settings, "show_opinion") && <ParticipateCTA />}

      {/* CTA hacia la profundización por pestañas */}
      <div className="pt-4 pb-2 px-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[.2em]" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
          ¿Quieres ver todo?
        </p>
        <h3 className="font-serif font-semibold mt-1" style={{ fontSize: "clamp(20px,2.6vw,28px)", color: "var(--page-ink)" }}>
          Explora propuestas, eventos, equipo y más.
        </h3>
      </div>
      <HomeTabs
        settings={settings}
        initialProposals={initialProposals}
        initialEvents={initialEvents}
        initialFeatured={initialFeatured}
        initialTeam={initialTeam}
        initialGallery={initialGallery}
        initialVideos={initialVideos}
      />
      <Footer />
      <ChatFAB />
      {on(settings, "show_connection") && <SocialFAB />}
      <StickyCampaignBar />
      <MobileBottomNav />
      <ScrollToTopFab />
    </main>
  );
}
