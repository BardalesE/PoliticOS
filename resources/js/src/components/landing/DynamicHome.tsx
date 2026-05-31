"use client";
import dynamic from "next/dynamic";

// ── Crítico (above-fold) — carga inmediata ────────────────────────────────────
import { Navbar }            from "@/components/ui/Navbar";
import { Hero }              from "@/components/landing/Hero";
import { ListaUnoBanner }    from "@/components/landing/ListaUnoBanner";
import { AssistantPreview }  from "@/components/landing/AssistantPreview";
import { LiveStreamBanner }  from "@/components/landing/LiveStreamBanner";

// ── Bajo el fold — carga diferida (split de bundle) ──────────────────────────
const Proposals       = dynamic(() => import("@/components/landing/Proposals").then(m => ({ default: m.Proposals })));
const MediaSection    = dynamic(() => import("@/components/landing/MediaSection").then(m => ({ default: m.MediaSection })));
const DocumentsSection= dynamic(() => import("@/components/landing/DocumentsSection").then(m => ({ default: m.DocumentsSection })));
const EventsSection   = dynamic(() => import("@/components/landing/EventsSection").then(m => ({ default: m.EventsSection })));
const Districts       = dynamic(() => import("@/components/landing/Districts").then(m => ({ default: m.Districts })));
const TeamSection     = dynamic(() => import("@/components/landing/TeamSection").then(m => ({ default: m.TeamSection })));
const Connection      = dynamic(() => import("@/components/landing/Connection").then(m => ({ default: m.Connection })));
const OpinionSection  = dynamic(() => import("@/components/landing/OpinionSection").then(m => ({ default: m.OpinionSection })));
const FinalCTA        = dynamic(() => import("@/components/landing/FinalCTA").then(m => ({ default: m.FinalCTA })));
const Footer          = dynamic(() => import("@/components/ui/Footer").then(m => ({ default: m.Footer })));
const ChatFAB         = dynamic(() => import("@/components/ui/ChatFAB").then(m => ({ default: m.ChatFAB })));

import type {
  HomeSettings, HeroSettings,
  Proposal, CampaignEvent, TeamMember,
  CampaignPhoto, CampaignVideo,
} from "@/lib/api";

const DEFAULTS: HomeSettings = {
  show_hero:       "1",
  show_assistant:  "1",
  show_proposals:  "1",
  show_multimedia: "1",
  show_documents:  "1",
  show_events:     "1",
  show_districts:  "1",
  show_team:       "1",
  show_connection: "1",
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

  return (
    <main className="relative">
      <LiveStreamBanner />
      <Navbar />
      {on(settings, "show_hero")       && <Hero initialHero={initialHero ?? null} />}
      {on(settings, "show_hero")       && <ListaUnoBanner />}
      {on(settings, "show_assistant")  && <AssistantPreview />}
      {on(settings, "show_proposals")  && <Proposals initialData={initialProposals} />}
      {on(settings, "show_multimedia") && <MediaSection initialPhotos={initialGallery} initialVideos={initialVideos} />}
      {on(settings, "show_documents")  && <DocumentsSection />}
      {on(settings, "show_events")     && <EventsSection initialEvents={initialEvents} initialFeatured={initialFeatured} />}
      {on(settings, "show_districts")  && <Districts />}
      {on(settings, "show_team")       && <TeamSection initialMembers={initialTeam} />}
      {on(settings, "show_connection") && <Connection />}
      <OpinionSection />
      <FinalCTA />
      <Footer />
      <ChatFAB />
    </main>
  );
}
