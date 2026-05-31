import DynamicHome from "@/components/landing/DynamicHome";
import type {
  HeroSettings, HomeSettings,
  Proposal, CampaignEvent, TeamMember,
  CampaignPhoto, CampaignVideo,
} from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function get<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  // All fetches run in parallel — zero sequential waiting
  const [
    initialHero,
    initialSettings,
    initialProposals,
    initialEvents,
    initialFeatured,
    initialTeam,
    initialGallery,
    initialVideos,
  ] = await Promise.all([
    get<HeroSettings>("/hero-settings", 30),
    get<HomeSettings>("/home-settings", 60),
    get<Proposal[]>("/proposals", 60),
    get<CampaignEvent[]>("/events", 60),
    get<CampaignEvent>("/events/featured", 60),
    get<TeamMember[]>("/team-members", 120),
    get<{ data: CampaignPhoto[] }>("/gallery", 120),
    get<{ data: CampaignVideo[] }>("/campaign-videos", 120),
  ]);

  return (
    <DynamicHome
      initialHero={initialHero}
      initialSettings={initialSettings}
      initialProposals={initialProposals ?? []}
      initialEvents={initialEvents ?? []}
      initialFeatured={initialFeatured}
      initialTeam={initialTeam ?? []}
      initialGallery={initialGallery?.data ?? []}
      initialVideos={initialVideos?.data ?? []}
    />
  );
}
