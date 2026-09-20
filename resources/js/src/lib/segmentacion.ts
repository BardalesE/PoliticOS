/**
 * lib/segmentacion.ts
 * Cliente del segmentador por zona + mini encuesta de apoyo del chat
 * (ver SegmentacionController). Anónimo: solo viaja el UUID estable del navegador.
 */
import { normalizeApiBase, tenantHeaders } from "@/lib/api";

const API = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

/** Zona elegida. Puede ser de cualquier nivel: provincia/distrito son null si el visitante no bajó a ese nivel. */
export interface ZonaInfo {
  nivel: "departamento" | "provincia" | "distrito";
  departamento_id: number;
  provincia_id: number | null;
  distrito_id: number | null;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
}

/** Lo más específico que conoce el visitante; el API deriva los niveles superiores. */
export type ZonaSeleccion =
  | { departamento_id: number }
  | { provincia_id: number }
  | { distrito_id: number };

export interface CandidatoCercano {
  slug: string;
  name: string;
  party?: string | null;
  title?: string | null;
  list_number?: string | null;
  photo_url?: string | null;
  distrito?: string | null;
}

export interface SegmentacionEstado {
  zona: ZonaInfo | null;
  candidatos: CandidatoCercano[];
  poll_enabled: boolean;
  /** slug → true (apoya) / false (no apoya). Solo los votos de ESTE visitante. */
  votos: Record<string, boolean>;
}

/** UUID estable del navegador: identifica al visitante para topes, zona y voto. */
export function getVisitorId(): string {
  const KEY = "politicos_visitor_uuid";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "";
  }
}

const jsonHeaders = () => ({ "Content-Type": "application/json", Accept: "application/json", ...tenantHeaders() });

/** null = el API no respondió (el chat cae al modo sin zona). */
export async function getZona(): Promise<SegmentacionEstado | null> {
  try {
    const r = await fetch(`${API}/segmentacion/zona?visitor_id=${encodeURIComponent(getVisitorId())}`, { headers: jsonHeaders() });
    return r.ok ? ((await r.json()) as SegmentacionEstado) : null;
  } catch {
    return null;
  }
}

export async function setZona(sel: ZonaSeleccion): Promise<SegmentacionEstado | null> {
  try {
    const r = await fetch(`${API}/segmentacion/zona`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ visitor_id: getVisitorId(), ...sel }),
    });
    return r.ok ? ((await r.json()) as SegmentacionEstado) : null;
  } catch {
    return null;
  }
}

/** Devuelve los votos actualizados del visitante, o null si falló. */
export async function votarApoyo(candidateSlug: string, supports: boolean): Promise<Record<string, boolean> | null> {
  try {
    const r = await fetch(`${API}/segmentacion/apoyo`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ visitor_id: getVisitorId(), candidate_slug: candidateSlug, supports }),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { votos: Record<string, boolean> }).votos ?? {};
  } catch {
    return null;
  }
}
