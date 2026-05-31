/**
 * lib/api.ts
 * Cliente API tipado para el backend Laravel.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
// Dev: set NEXT_PUBLIC_TENANT_SLUG in .env.local
// Prod: auto-detected from subdomain (james.politicos.pe → "james")
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "";

function resolveTenantSlug(): string {
  const envSlug = process.env.NEXT_PUBLIC_TENANT_SLUG;
  if (envSlug) return envSlug;
  if (typeof window !== "undefined" && BASE_DOMAIN) {
    const host = window.location.hostname; // e.g. "james.politicos.pe"
    if (host.endsWith(`.${BASE_DOMAIN}`)) {
      return host.slice(0, -(BASE_DOMAIN.length + 1));
    }
  }
  return "";
}

function tenantHeaders(): Record<string, string> {
  const slug = resolveTenantSlug();
  return slug ? { "X-Tenant": slug } : {};
}

async function upload<T>(
  endpoint: string,
  formData: FormData,
  token: string,
  method: "POST" | "PUT" = "POST"
): Promise<T> {
  // PHP can't parse multipart bodies for non-POST requests; use method spoofing
  if (method === "PUT") {
    formData.append("_method", "PUT");
  }
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...tenantHeaders(),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? `Upload error ${res.status}`, body);
  }
  return res.json();
}

// In-memory GET cache — 30s TTL, cleared on POST/PUT/DELETE mutations
const _cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 30_000;

function cacheKey(endpoint: string, token?: string | null) {
  return token ? `${token.slice(-8)}:${endpoint}` : endpoint;
}

export function invalidateCache(prefix?: string) {
  if (!prefix) { _cache.clear(); return; }
  for (const k of _cache.keys()) {
    if (k.includes(prefix)) _cache.delete(k);
  }
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
  ttl: number = CACHE_TTL
): Promise<T> {
  const isGet = !options.method || options.method === "GET";

  // Return cached response for GET requests
  if (isGet) {
    const key    = cacheKey(endpoint, token);
    const cached = _cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.data as T;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...tenantHeaders(),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? `API ${res.status}: ${endpoint}`, body);
  }
  const data = (await res.json()) as T;

  if (isGet) {
    _cache.set(cacheKey(endpoint, token), { data, expires: Date.now() + ttl });
  }
  return data;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

// ─── Tipos públicos ────────────────────────────────────────────────────

export type Proposal = {
  id: number;
  title: string;
  description: string;
  district: string | null;
  topic: string;
  budget?: number | null;
  priority?: number;
  status: "propuesta" | "en_curso" | "completada";
  image?: string | null;
  document_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Video = {
  id: number;
  title: string;
  url: string;
  thumbnail: string | null;
  views: number;
  topic: string | null;
  published_at?: string | null;
  created_at?: string;
};

export type Faq = {
  id: number;
  question: string;
  answer: string;
  topic: string | null;
  priority: number;
  created_at?: string;
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "editor";
  created_at?: string;
};

export type ChatSession = {
  id: number;
  session_id: string;
  ip: string | null;
  user_agent: string | null;
  started_at: string | null;
  created_at: string;
  messages_count?: number;
  messages?: ChatMessage[];
};

export type ChatMessage = {
  id: number;
  role: "user" | "james";
  content: string;
  topic: string | null;
  created_at: string;
};

export type Paginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type AnalyticsSummary = {
  total_conversations: number;
  total_messages: number;
  top_questions: { question: string; count: number }[];
  top_topics: { topic: string; count: number }[];
  conversations_per_day: { date: string; count: number }[];
};

// ─── API pública ───────────────────────────────────────────────────────

export const api = {
  chat: {
    send: (message: string, sessionId?: string) =>
      request<{
        reply: string;
        media?: { type: "video" | "image" | "pdf" | "map"; url: string; title?: string }[];
        topic?: string;
        sessionId: string;
      }>("/chat", {
        method: "POST",
        body: JSON.stringify({ message, session_id: sessionId }),
      }),
  },
  proposals: {
    list: () => request<Proposal[]>("/proposals"),
    byDistrict: (district: string) =>
      request<Proposal[]>(`/proposals?district=${encodeURIComponent(district)}`),
  },
  videos: { list: () => request<Video[]>("/videos") },
  analytics: { summary: () => request<AnalyticsSummary>("/analytics/summary") },
};

// ─── API admin (requiere token) ────────────────────────────────────────

export const adminApi = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: AdminUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    logout: (token: string) =>
      request<{ message: string }>("/auth/logout", { method: "POST" }, token),
    me: (token: string) =>
      request<AdminUser>("/auth/me", {}, token),
  },

  proposals: {
    list: (token: string, page = 1) =>
      request<Paginated<Proposal>>(`/admin/proposals?page=${page}`, {}, token),
    create: (token: string, formData: FormData) =>
      upload<Proposal>("/admin/proposals", formData, token),
    update: (token: string, id: number, formData: FormData) =>
      upload<Proposal>(`/admin/proposals/${id}`, formData, token, "PUT"),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/proposals/${id}`, { method: "DELETE" }, token),
  },

  videos: {
    list: (token: string, page = 1) =>
      request<Paginated<Video>>(`/admin/videos?page=${page}`, {}, token),
    create: (token: string, formData: FormData) =>
      upload<Video>("/admin/videos", formData, token),
    update: (token: string, id: number, formData: FormData) =>
      upload<Video>(`/admin/videos/${id}`, formData, token, "PUT"),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/videos/${id}`, { method: "DELETE" }, token),
  },

  faqs: {
    list: (token: string, page = 1) =>
      request<Paginated<Faq>>(`/admin/faqs?page=${page}`, {}, token),
    create: (token: string, data: Omit<Faq, "id" | "created_at">) =>
      request<Faq>("/admin/faqs", { method: "POST", body: JSON.stringify(data) }, token),
    update: (token: string, id: number, data: Partial<Faq>) =>
      request<Faq>(`/admin/faqs/${id}`, { method: "PUT", body: JSON.stringify(data) }, token),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/faqs/${id}`, { method: "DELETE" }, token),
  },

  users: {
    list: (token: string, page = 1) =>
      request<Paginated<AdminUser>>(`/admin/users?page=${page}`, {}, token),
    create: (token: string, data: { name: string; email: string; password: string; role?: string }) =>
      request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(data) }, token),
    update: (token: string, id: number, data: Partial<AdminUser> & { password?: string }) =>
      request<AdminUser>(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }, token),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/users/${id}`, { method: "DELETE" }, token),
  },

  chatSessions: {
    list: (token: string, page = 1) =>
      request<Paginated<ChatSession>>(`/admin/chat-sessions?page=${page}`, {}, token),
    show: (token: string, id: number) =>
      request<ChatSession>(`/admin/chat-sessions/${id}`, {}, token),
  },

  analytics: {
    summary: (token: string) =>
      request<AdminAnalytics>("/admin/analytics", {}, token, 5_000),
  },

  gallery: {
    list: (token: string, page = 1) =>
      request<Paginated<CampaignPhoto>>(`/admin/gallery?page=${page}`, {}, token),
    upload: (token: string, formData: FormData) =>
      upload<CampaignPhoto>("/admin/gallery", formData, token),
    update: (token: string, id: number, formData: FormData) =>
      upload<CampaignPhoto>(`/admin/gallery/${id}`, formData, token, "PUT"),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/gallery/${id}`, { method: "DELETE" }, token),
  },

  campaignVideos: {
    list: (token: string, page = 1) =>
      request<Paginated<CampaignVideo>>(`/admin/campaign-videos?page=${page}`, {}, token),
    upload: (token: string, formData: FormData) =>
      upload<CampaignVideo>("/admin/campaign-videos", formData, token),
    update: (token: string, id: number, formData: FormData) =>
      upload<CampaignVideo>(`/admin/campaign-videos/${id}`, formData, token, "PUT"),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/campaign-videos/${id}`, { method: "DELETE" }, token),
  },

  heroSettings: {
    get: (token: string) =>
      request<HeroSettings>("/admin/hero-settings", {}, token),
    update: (token: string, data: Partial<HeroSettings>) =>
      request<HeroSettings>("/admin/hero-settings", { method: "PUT", body: JSON.stringify(data) }, token),
    uploadVideo: (token: string, file: File) => {
      const fd = new FormData();
      fd.append("video", file);
      return upload<{ url: string; hero: HeroSettings }>("/admin/hero-settings/upload-video", fd, token);
    },
  },

  events: {
    list: (token: string, page = 1) =>
      request<Paginated<CampaignEvent>>(`/admin/events?page=${page}`, {}, token),
    create: (token: string, formData: FormData) =>
      upload<CampaignEvent>("/admin/events", formData, token),
    update: (token: string, id: number, formData: FormData) =>
      upload<CampaignEvent>(`/admin/events/${id}`, formData, token, "PUT"),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/events/${id}`, { method: "DELETE" }, token),
  },

  team: {
    list: (token: string, page = 1) =>
      request<Paginated<TeamMember>>(`/admin/team-members?page=${page}`, {}, token),
    create: (token: string, formData: FormData) =>
      upload<TeamMember>("/admin/team-members", formData, token),
    update: (token: string, id: number, formData: FormData) =>
      upload<TeamMember>(`/admin/team-members/${id}`, formData, token, "PUT"),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/team-members/${id}`, { method: "DELETE" }, token),
  },

  settings: {
    get: (token: string) =>
      request<HomeSettings>("/admin/settings", {}, token),
    update: (token: string, settings: Record<string, string>) =>
      request<HomeSettings>("/admin/settings", { method: "PUT", body: JSON.stringify({ settings }) }, token),
  },

  knowledge: {
    list: (token: string, page = 1) =>
      request<Paginated<KnowledgeDocument>>(`/admin/knowledge?page=${page}`, {}, token),
    upload: (token: string, formData: FormData) =>
      upload<KnowledgeDocument>("/admin/knowledge", formData, token),
    update: (token: string, id: number, data: { title?: string; description?: string; topic?: string; is_active?: boolean }) =>
      request<KnowledgeDocument>(`/admin/knowledge/${id}`, { method: "PUT", body: JSON.stringify(data) }, token),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/knowledge/${id}`, { method: "DELETE" }, token),
  },
};

// ─── Tipos multimedia ──────────────────────────────────────────────────

export type CampaignPhoto = {
  id: number;
  url: string;
  title: string | null;
  category: string;
  size: number | null;
  created_at: string;
};

export type CampaignVideo = {
  id: number;
  url: string;
  thumbnail: string | null;
  title: string | null;
  category: string;
  size: number | null;
  created_at: string;
};

// ─── Tipos dinámicos de Home ───────────────────────────────────────────

export type HeroSettings = {
  id: number;
  title: string;
  subtitle: string | null;
  badge_text: string | null;
  video_url: string | null;
  image_url: string | null;
  overlay_opacity: number;
  btn1_label: string | null;
  btn1_url: string | null;
  btn2_label: string | null;
  btn2_url: string | null;
  btn3_label: string | null;
  btn3_url: string | null;
  is_active: boolean;
};

export type CampaignEvent = {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  location: string | null;
  address: string | null;
  image_url: string | null;
  stream_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
};

export type TeamMember = {
  id: number;
  name: string;
  role: string;
  description: string | null;
  photo_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type HomeSettings = Record<string, string>;

// ─── API pública multimedia ────────────────────────────────────────────

export const mediaApi = {
  gallery: {
    list: (category?: string) =>
      request<Paginated<CampaignPhoto>>(
        `/gallery${category && category !== "todos" ? `?category=${encodeURIComponent(category)}` : ""}`
      ),
    categories: () => request<string[]>("/gallery/categories"),
  },
  campaignVideos: {
    list: (category?: string) =>
      request<Paginated<CampaignVideo>>(
        `/campaign-videos${category && category !== "todos" ? `?category=${encodeURIComponent(category)}` : ""}`
      ),
  },
};

// ─── API pública dinámica (home) ───────────────────────────────────────

export const homeApi = {
  heroSettings: () => request<HeroSettings | null>("/hero-settings"),
  events:       () => request<CampaignEvent[]>("/events"),
  featuredEvent:() => request<CampaignEvent | null>("/events/featured"),
  teamMembers:  () => request<TeamMember[]>("/team-members"),
  settings:     () => request<HomeSettings>("/home-settings"),
};

export type KnowledgeDocument = {
  id: number;
  title: string;
  description: string | null;
  file_url: string;
  original_name: string | null;
  content: string | null;
  topic: string | null;
  file_size: number | null;
  is_active: boolean;
  created_at: string;
};

export type AdminAnalytics = {
  content_counts: { proposals: number; videos: number; faqs: number };
  proposals_by_status: Record<string, number>;
  proposals_by_topic: { topic: string; count: number }[];
  sessions: { total: number; today: number; this_week: number; avg_messages: number };
  messages: { total: number; by_role: Record<string, number> };
  conversations_per_day: { date: string; count: number }[];
  top_topics: { topic: string; count: number }[];
  top_questions: { question: string; count: number }[];
  recent_sessions: { id: number; session_id: string; ip: string | null; created_at: string; messages_count: number }[];
};

// ─── Tipos multi-tenant ────────────────────────────────────────────────

export type CandidatePreset = CandidateProfile & {
  id: number;
  preset_name: string;
  is_active: boolean;
  created_at: string;
};

export type CandidateProfile = {
  id?: number;
  preset_name?: string;
  is_active?: boolean;
  name: string;
  title: string;
  location: string;
  party: string;
  list_number: string;
  bio: string | null;
  tagline: string | null;
  election_date: string | null;
  photo_url: string | null;
  logo_url: string | null;
  hero_photo_url: string | null;
  hero_video_url: string | null;
  color_primary: string;
  color_dark: string;
  color_accent: string;
  tiktok_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  whatsapp_number: string | null;
};

export type TopicItem = {
  name: string;
  label: string;
  emoji: string;
  color: string;
};

export type TopicFull = TopicItem & {
  id: number;
  keywords: string[];
  sort_order: number;
  is_active: boolean;
};

export type DistrictItem = {
  id: number;
  name: string;
  keywords: string[];
  sort_order: number;
  is_active: boolean;
};

export type SuggestedQuestion = {
  id?: number;
  question: string;
  topic: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ChatBtnConfig = {
  text:     string | null;
  subtitle: string | null;
  shape:    "pill" | "circle";
  color:    string | null;
  size:     "sm" | "md" | "lg";
  position: "bottom-right" | "bottom-left";
};

export type AiSetting = {
  id?: number;
  provider: "groq" | "claude" | "openai";
  model: string;
  max_tokens: number;
  temperature: number;
  fallback_provider: "groq" | "claude" | "openai" | null;
  system_prompt: string;
  chat_subtitle:     string | null;
  chat_btn_text:     string | null;
  chat_btn_shape:    "pill" | "circle";
  chat_btn_color:    string | null;
  chat_btn_size:     "sm" | "md" | "lg";
  chat_btn_position: "bottom-right" | "bottom-left";
};

export type Tenant = {
  id: number;
  slug: string;
  name: string;
  db_name: string;
  plan: "starter" | "pro" | "elite";
  is_active: boolean;
  created_at: string;
};

export type CandidatePublicData = {
  profile: CandidateProfile | null;
  suggested_questions: Pick<SuggestedQuestion, "question" | "topic">[];
  topics: TopicItem[];
  districts: string[];
  chat_btn: ChatBtnConfig;
};

// ─── Endpoints nuevos en adminApi ─────────────────────────────────────

// Adjuntar a adminApi como extensión (para no romper imports existentes)
export const adminApiExtended = {
  candidateProfile: {
    get: (token: string) =>
      request<CandidateProfile>("/admin/candidate-profile", {}, token),
    update: (token: string, data: Partial<CandidateProfile>) =>
      request<CandidateProfile>("/admin/candidate-profile", { method: "PUT", body: JSON.stringify(data) }, token),
    uploadPhoto: (token: string, file: File) => {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("category", "perfil");
      return upload<CampaignPhoto>("/admin/gallery", fd, token);
    },
    uploadVideo: (token: string, file: File) => {
      const fd = new FormData();
      fd.append("video", file);
      return upload<{ url: string; hero: HeroSettings }>("/admin/hero-settings/upload-video", fd, token);
    },
  },

  candidatePresets: {
    list: (token: string) =>
      request<CandidatePreset[]>("/admin/candidate-presets", {}, token),
    create: (token: string, data: Partial<CandidatePreset>) =>
      request<CandidatePreset>("/admin/candidate-presets", { method: "POST", body: JSON.stringify(data) }, token),
    activate: (token: string, id: number) =>
      request<CandidatePreset>(`/admin/candidate-presets/${id}/activate`, { method: "POST" }, token),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/candidate-presets/${id}`, { method: "DELETE" }, token),
  },

  aiSettings: {
    get: (token: string) =>
      request<AiSetting>("/admin/ai-settings", {}, token),
    update: (token: string, data: Partial<AiSetting>) =>
      request<AiSetting>("/admin/ai-settings", { method: "PUT", body: JSON.stringify(data) }, token),
  },

  districts: {
    list: (token: string, page = 1) =>
      request<Paginated<DistrictItem>>(`/admin/districts?page=${page}`, {}, token),
    create: (token: string, data: Omit<DistrictItem, "id">) =>
      request<DistrictItem>("/admin/districts", { method: "POST", body: JSON.stringify(data) }, token),
    update: (token: string, id: number, data: Partial<DistrictItem>) =>
      request<DistrictItem>(`/admin/districts/${id}`, { method: "PUT", body: JSON.stringify(data) }, token),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/districts/${id}`, { method: "DELETE" }, token),
  },

  topics: {
    list: (token: string, page = 1) =>
      request<Paginated<TopicFull>>(`/admin/topics?page=${page}`, {}, token),
    create: (token: string, data: Omit<TopicFull, "id">) =>
      request<TopicFull>("/admin/topics", { method: "POST", body: JSON.stringify(data) }, token),
    update: (token: string, id: number, data: Partial<TopicFull>) =>
      request<TopicFull>(`/admin/topics/${id}`, { method: "PUT", body: JSON.stringify(data) }, token),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/topics/${id}`, { method: "DELETE" }, token),
  },

  suggestedQuestions: {
    list: (token: string, page = 1) =>
      request<Paginated<SuggestedQuestion>>(`/admin/suggested-questions?page=${page}`, {}, token),
    create: (token: string, data: Omit<SuggestedQuestion, "id">) =>
      request<SuggestedQuestion>("/admin/suggested-questions", { method: "POST", body: JSON.stringify(data) }, token),
    update: (token: string, id: number, data: Partial<SuggestedQuestion>) =>
      request<SuggestedQuestion>(`/admin/suggested-questions/${id}`, { method: "PUT", body: JSON.stringify(data) }, token),
    delete: (token: string, id: number) =>
      request<{ deleted: boolean }>(`/admin/suggested-questions/${id}`, { method: "DELETE" }, token),
  },
};

// ─── API pública del candidato ─────────────────────────────────────────

export const candidateApi = {
  get: () => request<CandidatePublicData>("/candidate"),
};

// ─── SuperAdmin API (autenticación por X-Super-Admin-Key) ─────────────

async function saRequest<T>(path: string, saKey: string, options: RequestInit = {}): Promise<T> {
  const isGet = !options.method || options.method === "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Super-Admin-Key": saKey,
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? `SA API ${res.status}: ${path}`, body);
  }
  return res.json();
}

export type TenantStats = {
  chat_sessions: number;
  chat_messages: number;
  proposals: number;
};

export type TenantWithStats = Tenant & { stats?: TenantStats | { error: string } };

export type ProvisionPayload = {
  slug: string;
  name: string;
  db_name: string;
  admin_email: string;
  admin_password: string;
  plan?: "starter" | "pro" | "elite";
  db_host?: string;
  db_port?: number;
  db_user?: string;
  db_password?: string;
};

export const superadminApi = {
  tenants: {
    list: (saKey: string) =>
      saRequest<{ data: Tenant[]; total: number; last_page: number; per_page: number }>(
        "/superadmin/tenants", saKey
      ),
    provision: (saKey: string, payload: ProvisionPayload) =>
      saRequest<{ tenant: Tenant; message: string; output: string }>(
        "/superadmin/tenants/provision", saKey,
        { method: "POST", body: JSON.stringify(payload) }
      ),
    create: (saKey: string, payload: Partial<Tenant> & { db_name: string }) =>
      saRequest<Tenant>("/superadmin/tenants", saKey, {
        method: "POST", body: JSON.stringify(payload),
      }),
    update: (saKey: string, id: number, payload: Partial<Tenant>) =>
      saRequest<Tenant>(`/superadmin/tenants/${id}`, saKey, {
        method: "PUT", body: JSON.stringify(payload),
      }),
    delete: (saKey: string, id: number) =>
      saRequest<{ deleted: boolean }>(`/superadmin/tenants/${id}`, saKey, { method: "DELETE" }),
    stats: (saKey: string, id: number) =>
      saRequest<{ tenant: Tenant; stats: TenantStats | { error: string } }>(
        `/superadmin/tenants/${id}/stats`, saKey
      ),
  },
};
