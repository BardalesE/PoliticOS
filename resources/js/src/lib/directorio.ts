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
/** `provinciales`: candidatos de cargos provinciales (sin distrito). */
export interface ProvinciaDisp { id: number; ubigeo: string; nombre: string; candidatos: number; provinciales?: number; distritos: DistritoDisp[] }
/** `regionales`: candidatos de cargos regionales (gobernador, consejero…). */
export interface DepartamentoDisp { id: number; ubigeo: string; nombre: string; candidatos: number; regionales?: number; provincias: ProvinciaDisp[] }

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
  perfil_completado?: boolean;
  ambito?: Ambito | null;
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
  /** Ausente si el API aún no se actualizó. */
  regidores?: RegidorPublico[];
}

export interface RegidorPublico {
  orden: number;
  nombre: string;
  cargo: string;
  foto_url: string | null;
  /** true = PEPA ya puede responder con su Hoja de Vida (el PDF nunca se enlaza). */
  hoja_de_vida: boolean;
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
  /** Nombres del ubigeo (MAYÚSCULAS, como en el INEI) para agrupar la tabla. */
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  ambito?: Ambito | null;
  documentos: AdminDocumento[];
  regidores?: AdminRegidor[];
  /** Último control de calidad del chat: aprobado | fallas | incompleto | null (nunca corrido). */
  qa_estado?: QaEstadoGlobal | null;
  qa_at?: string | null;
}

// ─── Control de calidad del chat ───────────────────────────────────────

export type QaEstadoGlobal = "aprobado" | "fallas" | "incompleto";
export type QaEstadoCaso = "ok" | "falla" | "sin_respuesta";

export interface QaCaso { id: string; titulo: string }

export interface QaResultado {
  id: string;
  titulo: string;
  estado: QaEstadoCaso;
  turnos: { pregunta: string; respuesta: string; citas: { id: string | null; title: string | null; page: number | null }[] }[];
  checks: { nombre: string; ok: boolean; detalle: string }[];
}

export interface QaResumenItem { id: string; titulo: string; estado: QaEstadoCaso; fallas?: string[] }

export interface AdminRegidor {
  id: number;
  orden: number;
  nombre: string;
  cargo: string;
  foto_url: string | null;
  knowledge_document_id: number | null;
}

export interface AdminDocumento {
  id: number;
  title: string;
  topic: string | null;
  status: "pending" | "processing" | "ready" | "failed";
  error_message: string | null;
  file_url: string | null;
  file_size: number | null;
  is_active: boolean;
}

export type Ambito = "regional" | "provincial" | "distrital";

/** Nivel del cargo: decide hasta dónde se pide la ubicación y a quién se le muestra. */
export function nivelDeCargo(cargo: string): Ambito {
  const c = cargo.toLowerCase();
  if (c.includes("regional")) return "regional";      // gobernador, vicegobernador, consejero
  if (c.includes("provincial")) return "provincial";
  return "distrital";
}

export interface AdminCandidatoInput {
  name: string;
  title: string;
  party: string;
  departamento_id?: number | null;
  provincia_id?: number | null;
  distrito_id?: number | null;
  list_number?: string | null;
  bio?: string | null;
  tagline?: string | null;
  photo_url?: string | null;
  logo_url?: string | null;
  tiktok_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tipo_cuenta?: "publico_gratuito" | "cliente_pago";
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
  addRegidores: (token: string, candidatoId: number, nombres: string[]) =>
    request<AdminCandidato>(`/admin/directorio/candidatos/${candidatoId}/regidores`, { method: "POST", body: json({ nombres }) }, token),
  updateRegidor: (token: string, id: number, data: Partial<Pick<AdminRegidor, "nombre" | "orden" | "cargo" | "knowledge_document_id">>) =>
    request<AdminCandidato>(`/admin/directorio/regidores/${id}`, { method: "PUT", body: json(data) }, token),
  removeRegidor: (token: string, id: number) =>
    request<AdminCandidato>(`/admin/directorio/regidores/${id}`, { method: "DELETE" }, token),
  qaCasos: (token: string, id: number) =>
    request<{ casos: QaCaso[]; ultimo: { estado: QaEstadoGlobal | null; at: string | null; resumen: QaResumenItem[] } }>(
      `/admin/directorio/candidatos/${id}/qa`, {}, token, 0),
  qaEjecutar: (token: string, id: number, caso: string) =>
    request<QaResultado>(`/admin/directorio/candidatos/${id}/qa/${caso}`, { method: "POST" }, token),
  qaGuardar: (token: string, id: number, resultados: QaResumenItem[]) =>
    request<{ estado: QaEstadoGlobal; at: string }>(`/admin/directorio/candidatos/${id}/qa`, { method: "POST", body: json({ resultados }) }, token),
};

export const ubigeoApi = {
  departamentos: () => request<UbigeoItem[]>("/ubigeo/departamentos", {}, null, 5 * 60_000),
  provincias: (departamentoId: number) =>
    request<UbigeoItem[]>(`/ubigeo/provincias?departamento_id=${departamentoId}`, {}, null, 5 * 60_000),
  distritos: (provinciaId: number) =>
    request<UbigeoItem[]>(`/ubigeo/distritos?provincia_id=${provinciaId}`, {}, null, 5 * 60_000),
};
