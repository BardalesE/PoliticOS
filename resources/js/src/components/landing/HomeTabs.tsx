"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Radio, ArrowRight } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { tenantHeaders, type HomeSettings } from "@/lib/api";
import type {
  Proposal, CampaignEvent, TeamMember, CampaignPhoto, CampaignVideo,
} from "@/lib/api";

import { Proposals }        from "@/components/landing/Proposals";
import { EventsSection }    from "@/components/landing/EventsSection";
import { MediaSection }     from "@/components/landing/MediaSection";
import { Districts }        from "@/components/landing/Districts";
import { TeamSection }      from "@/components/landing/TeamSection";
import { DocumentsSection } from "@/components/landing/DocumentsSection";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Las 7 pestañas de la home (orden validado en el mockup rigo_home_7tabs).
// `flag` es el toggle de home-settings que puede apagar la pestaña por tenant;
// "En Vivo" no tiene flag (igual que LiveStreamBanner, siempre disponible).
const TABS = [
  { slug: "propuestas", label: "Propuestas",            flag: "show_proposals" },
  { slug: "eventos",    label: "Eventos y Cronómetro",  flag: "show_events" },
  { slug: "en-vivo",    label: "En Vivo",               flag: null },
  { slug: "galeria",    label: "Galería",               flag: "show_multimedia" },
  { slug: "lugares",    label: "Lugares Visitados",     flag: "show_districts" },
  { slug: "equipo",     label: "Equipo",                flag: "show_team" },
  { slug: "documentos", label: "Base del Conocimiento", flag: "show_documents" },
] as const;

type TabSlug = (typeof TABS)[number]["slug"];

interface LiveStreamLite {
  title: string;
  stream_key: string;
  current_viewers: number;
  status: "live" | "ended" | "idle";
}

// ── Panel "En Vivo" ───────────────────────────────────────────────────────────
// No duplica LivePlayer (vive en /en-vivo/[key]): si hay transmisión activa
// muestra una tarjeta expandida que lleva al visor; si no, un estado vacío.
function EnVivoPanel() {
  const [live, setLive]     = useState<LiveStreamLite | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API}/livestreams`, { headers: tenantHeaders() });
        if (!res.ok) return;
        const data: LiveStreamLite[] = await res.json();
        setLive(data.find((s) => s.status === "live") ?? null);
      } catch {} finally { setLoaded(true); }
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, []);

  if (live) {
    return (
      <section className="py-14 px-5">
        <div className="max-w-5xl mx-auto">
          <TenantLink
            href={`/en-vivo/${live.stream_key}`}
            className="flex flex-col sm:flex-row sm:items-center gap-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl p-6 sm:p-8 transition-colors"
          >
            <span className="inline-flex items-center gap-2 shrink-0">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
              </span>
              <Radio size={18} />
              <b className="uppercase tracking-wide text-sm">En vivo ahora</b>
            </span>
            <span className="flex-1 min-w-0 font-serif font-bold text-lg leading-snug">
              {live.title}
            </span>
            <span className="inline-flex items-center gap-1.5 font-bold text-sm shrink-0">
              Ver transmisión <ArrowRight size={15} />
            </span>
          </TenantLink>
        </div>
      </section>
    );
  }

  return (
    <section className="py-14 px-5">
      <div
        className="max-w-5xl mx-auto rounded-2xl bg-white text-center py-16 px-6"
        style={{ border: "1px solid var(--page-line)" }}
      >
        <Radio size={36} className="mx-auto mb-4" style={{ color: "var(--page-ink-soft)" }} aria-hidden />
        <p className="font-serif font-semibold text-lg" style={{ color: "var(--page-ink)" }}>
          {loaded ? "No hay transmisión en este momento." : "Buscando transmisiones…"}
        </p>
        <p className="text-sm mt-1 mb-6" style={{ color: "var(--page-ink-soft)" }}>
          Cuando el candidato salga en vivo, aparecerá aquí.
        </p>
        <TenantLink
          href="/en-vivo"
          className="inline-flex items-center gap-2 text-sm font-bold pb-0.5"
          style={{ color: "var(--page-ink)", borderBottom: "2px solid rgb(var(--brand-primary-rgb))" }}
        >
          Ver transmisiones anteriores <ArrowRight size={15} />
        </TenantLink>
      </div>
    </section>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface HomeTabsProps {
  settings:         HomeSettings;
  initialProposals: Proposal[];
  initialEvents:    CampaignEvent[];
  initialFeatured:  CampaignEvent | null;
  initialTeam:      TeamMember[];
  initialGallery:   CampaignPhoto[];
  initialVideos:    CampaignVideo[];
}

function flagOn(settings: HomeSettings, key: string | null): boolean {
  return key === null || settings[key] !== "0";
}

// ── Núcleo (necesita useSearchParams → va dentro de <Suspense>) ───────────────
function HomeTabsInner(props: HomeTabsProps) {
  const { settings } = props;
  const router       = useRouter();
  const searchParams = useSearchParams();
  const barRef       = useRef<HTMLDivElement>(null);
  const firstRender  = useRef(true);

  const visibleTabs = TABS.filter((t) => flagOn(settings, t.flag));
  const param       = searchParams.get("seccion");
  const active: TabSlug =
    (visibleTabs.find((t) => t.slug === param)?.slug as TabSlug | undefined)
    ?? visibleTabs[0]?.slug
    ?? "propuestas";

  // Deep-link: si la página cargó con ?seccion= (o el param cambió por
  // navegación externa, ej. "Mi zona" del Hero), lleva las pestañas a la
  // vista. block:"nearest" no mueve nada si ya son visibles.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (!param) return; // carga normal de la home: no saltar el hero
    }
    barRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [param]);

  const selectTab = (slug: TabSlug) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("seccion", slug);
    router.replace(`/?${sp.toString()}`, { scroll: false });
  };

  if (visibleTabs.length === 0) return null;

  return (
    <div id="secciones" ref={barRef} style={{ scrollMarginTop: "90px" }}>
      {/* Barra de pestañas — scroll horizontal en móvil, sin overflow del body */}
      <div
        className="sticky top-[68px] sm:top-[92px] z-30 border-b bg-white/95"
        style={{ borderColor: "var(--page-line)" }}
      >
        <nav
          aria-label="Secciones de la campaña"
          className="max-w-5xl mx-auto px-5 flex gap-1 overflow-x-auto"
        >
          {visibleTabs.map((t) => {
            const isActive = t.slug === active;
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => selectTab(t.slug)}
                aria-current={isActive ? "page" : undefined}
                className="relative shrink-0 whitespace-nowrap px-4 py-3.5 text-[13px] font-bold uppercase tracking-wide transition-colors duration-150"
                style={{
                  color: isActive ? "var(--page-ink)" : "var(--page-ink-soft)",
                }}
              >
                {t.label}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full"
                    style={{ background: "rgb(var(--brand-primary-rgb))" }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Panel activo — los componentes existentes, sin reescribir */}
      {active === "propuestas" && <Proposals initialData={props.initialProposals} />}
      {active === "eventos" && (
        <EventsSection
          initialEvents={props.initialEvents}
          initialFeatured={props.initialFeatured}
          title={settings.events_title}
          badge={settings.events_badge}
          electionDateIso={settings.election_date_iso}
        />
      )}
      {active === "en-vivo" && <EnVivoPanel />}
      {active === "galeria" && (
        <MediaSection initialPhotos={props.initialGallery} initialVideos={props.initialVideos} />
      )}
      {active === "lugares" && <Districts />}
      {active === "equipo" && <TeamSection initialMembers={props.initialTeam} />}
      {active === "documentos" && <DocumentsSection />}
    </div>
  );
}

/**
 * Navegación por pestañas de la home (mockup rigo_home_7tabs validado).
 * El estado vive en la URL (?seccion=) para que cualquier link interno o
 * externo pueda abrir una pestaña directamente — nunca estado React puro.
 * useSearchParams exige Suspense en Next 15; el fallback null es seguro
 * porque el wrapper solo se resuelve en cliente.
 */
export function HomeTabs(props: HomeTabsProps) {
  return (
    <Suspense fallback={null}>
      <HomeTabsInner {...props} />
    </Suspense>
  );
}
