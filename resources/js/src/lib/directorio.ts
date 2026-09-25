/**
 * lib/directorio.ts
 * Cliente del directorio público de candidatos (ver CLAUDE.md § "Arquitectura
 * del directorio público").
 *
 * El directorio vive en UN tenant nacional. Como la home de la plataforma no
 * tiene tenant propio, todas las llamadas públicas mandan explícitamente el
 * tenant del directorio (NEXT_PUBLIC_DIRECTORY_TENANT). Sin esa variable se usa
 * la BD por defecto del API (modo single-tenant / desarrollo local).
 */
import { normalizeApiBase, request } from "@/lib/api";

const API_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api");

export const DIRECTORY_TENANT = process.env.NEXT_PUBLIC_DIRECTORY_TENANT ?? "";

// ─── Tipos (contrato de /api/directorio/*) ─────────────────────────────

export interface DistritoDisp  { id: number; ubigeo: string; nombre: string; candidatos: number }
export interface ProvinciaDisp { id: number; ubigeo: string; nombre: string; candidatos: number; distritos: DistritoDisp[] }
export interface DepartamentoDisp { id: number; ubigeo: string; nombre: string; candidatos: number; provincias: ProvinciaDisp[] }

export interface Ubicaciones {
  departamentos: DepartamentoDisp[];
  total_candidatos: number;
  total_distritos: number;
}

export interface CandidatoResumen {
  id: number;
  slug: string;
  name: string;
  title: string;
  party: string;
  list_number: string | null;
  photo_url: string | null;
  logo_url?: string | null;   // símbolo del partido
  location: string;
  distrito: { id: number; nombre: string; provincia: string | null; departamento: string | null } | null;
  documentos_count: number;
}

export interface DocumentoPublico {
  id: number;
  title: string;
  description: string | null;
  topic: string | null;
  file_url: string | null;
  source_url: string | null;
  source_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface CandidatoFicha extends CandidatoResumen {
  bio: string | null;
  tagline: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  documentos: DocumentoPublico[];
}

export type FiltroLugar =
  | { distrito_id: number }
  | { provincia_id: number }
  | { departamento_id: number };

const SMALL_WORDS = new Set(["de", "del", "la", "las", "los", "el", "y"]);

/** El INEI entrega los nombres en MAYÚSCULAS: "SAN SILVESTRE DE COCHAN" → "San Silvestre de Cochan". */
export function prettyPlace(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ─── Lectura pública (server y cliente) ────────────────────────────────

async function getPublic<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    // El tenant va también en la URL: el Data Cache de Next usa la URL como
    // clave y no considera headers custom (mismo criterio que app/page.tsx).
    const sep = path.includes("?") ? "&" : "?";
    const url = DIRECTORY_TENANT
      ? `${API_URL}${path}${sep}tenant=${encodeURIComponent(DIRECTORY_TENANT)}`
      : `${API_URL}${path}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json", ...(DIRECTORY_TENANT ? { "X-Tenant": DIRECTORY_TENANT } : {}) },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Lugares con candidato publicado + base de conocimiento lista. null = API caída. */
export const getUbicaciones = () =>
  getPublic<Ubicaciones>("/directorio/ubicaciones", 60);

export async function getCandidatos(filtro?: FiltroLugar): Promise<CandidatoResumen[] | null> {
  const qs = filtro ? "?" + new URLSearchParams(Object.entries(filtro).map(([k, v]) => [k, String(v)])).toString() : "";
  const res = await getPublic<{ data: CandidatoResumen[] }>(`/directorio/candidatos${qs}`, 60);
  return res ? res.data : null;
}

export const getCandidato = (slug: string) =>
  getPublic<CandidatoFicha>(`/directorio/candidatos/${encodeURIComponent(slug)}`, 60);

// ─── Panel admin (usa el tenant del login, no DIRECTORY_TENANT) ────────

export interface AdminCandidato {
  id: number;
  name: string;
  title: string;
  party: string;
  list_number: string | null;
  slug: string | null;
  photo_url: string | null;
  logo_url: string | null;
  bio: string | null;
  tagline: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  location: string;
  distrito_id: number | null;
  departamento_id: number | null;
  provincia_id: number | null;
  estado_publicacion: "borrador" | "publicado";
  tipo_cuenta: "publico_gratuito" | "cliente_pago";
  is_active: boolean;
  documentos_total: number;
  documentos_listos: number;
  documentos_procesando: number;
  documentos_fallidos: number;
  visible: boolean;
}

export interface AdminCandidatoInput {
  name: string;
  title: string;
  party: string;
  distrito_id: number;
  list_number?: string | null;
  bio?: string | null;
  tagline?: string | null;
  photo_url?: string | null;
  logo_url?: string | null;
  tiktok_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
}

export interface UbigeoItem { id: number; nombre: string; ubigeo: string }

const json = (data: unknown) => JSON.stringify(data);

export const directorioAdmin = {
  list: (token: string) =>
    request<{ data: AdminCandidato[] }>("/admin/directorio/candidatos", {}, token, 0).then((r) => r.data),
  create: (token: string, data: AdminCandidatoInput) =>
    request<AdminCandidato>("/admin/directorio/candidatos", { method: "POST", body: json(data) }, token),
  update: (token: string, id: number, data: Partial<AdminCandidatoInput>) =>
    request<AdminCandidato>(`/admin/directorio/candidatos/${id}`, { method: "PUT", body: json(data) }, token),
  publish: (token: string, id: number) =>
    request<AdminCandidato>(`/admin/directorio/candidatos/${id}/publicar`, { method: "POST" }, token),
  unpublish: (token: string, id: number) =>
    request<AdminCandidato>(`/admin/directorio/candidatos/${id}/despublicar`, { method: "POST" }, token),
  remove: (token: string, id: number) =>
    request<{ deleted: boolean }>(`/admin/directorio/candidatos/${id}`, { method: "DELETE" }, token),
};

export const ubigeoApi = {
  departamentos: () => request<UbigeoItem[]>("/ubigeo/departamentos", {}, null, 5 * 60_000),
  provincias: (departamentoId: number) =>
    request<UbigeoItem[]>(`/ubigeo/provincias?departamento_id=${departamentoId}`, {}, null, 5 * 60_000),
  distritos: (provinciaId: number) =>
    request<UbigeoItem[]>(`/ubigeo/distritos?provincia_id=${provinciaId}`, {}, null, 5 * 60_000),
};
