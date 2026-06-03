import { headers } from "next/headers";
import DynamicHome from "@/components/landing/DynamicHome";
import type {
  HeroSettings, HomeSettings,
  Proposal, CampaignEvent, TeamMember,
  CampaignPhoto, CampaignVideo,
} from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function get<T>(
  path: string,
  tenant: string,
  revalidate = 30,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: tenant ? { "X-Tenant": tenant } : {},
      next: { revalidate, tags: tenant ? [`tenant-${tenant}`] : [] },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function resolveTenant(): Promise<string> {
  const reqHeaders = await headers();
  return (
    reqHeaders.get("x-tenant-slug") ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    ""
  );
}

export default async function HomePage() {
  const tenant = await resolveTenant();

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
    get<HeroSettings>("/hero-settings", tenant, 30),
    get<HomeSettings>("/home-settings", tenant, 60),
    get<Proposal[]>("/proposals", tenant, 60),
    get<CampaignEvent[]>("/events", tenant, 60),
    get<CampaignEvent>("/events/featured", tenant, 60),
    get<TeamMember[]>("/team-members", tenant, 120),
    get<{ data: CampaignPhoto[] }>("/gallery", tenant, 120),
    get<{ data: CampaignVideo[] }>("/campaign-videos", tenant, 120),
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
