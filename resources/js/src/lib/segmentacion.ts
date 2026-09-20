/**
 * lib/segmentacion.ts
 * Cliente del segmentador por zona + mini encuesta de apoyo del chat
 * (ver SegmentacionController). Anónimo: solo viaja el UUID estable del navegador.
 */
import { normalizeApiBase, tenantHeaders } from "@/lib/api";

const API = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

export interface ZonaInfo {
  distrito_id: number;
  provincia_id: number;
  departamento_id: number;
  distrito: string;
  provincia: string | null;
  departamento: string | null;
}

export interface CandidatoCercano {
  slug: string;
  name: string;
  party?: string | null;
  title?: string | null;
  list_number?: string | null;
  photo_url?: string | null;
  alcance: "distrito" | "provincia" | "departamento";
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

export async function setZona(distritoId: number): Promise<SegmentacionEstado | null> {
  try {
    const r = await fetch(`${API}/segmentacion/zona`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ visitor_id: getVisitorId(), distrito_id: distritoId }),
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
