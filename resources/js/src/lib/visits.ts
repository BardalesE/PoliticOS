/**
 * lib/visits.ts
 * Contadores públicos de la home de la plataforma.
 *
 * Cada vez que alguien abre la home se registra una VISTA (como TikTok). El
 * servidor aplica un enfriamiento por dispositivo (30 s) para que recargar sin
 * parar no infle la cifra; volver más tarde sí suma.
 *
 * La vista se registra DESDE EL NAVEGADOR (no en el render de Next.js): si la
 * registrara el servidor de Vercel, todas llegarían con la IP de Vercel.
 * Es global de la plataforma: NO manda X-Tenant ni ?tenant=.
 */
import { normalizeApiBase } from "@/lib/api";

const API_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

export interface SiteStats {
  views: number;
  questions: number | null;
}

/** Registra la vista y devuelve los contadores. null si el API no responde (la UI se oculta). */
export async function syncVisits(): Promise<SiteStats | null> {
  try {
    // POST sin body ni Content-Type: "simple request" de CORS, sin preflight.
    const res = await fetch(`${API_URL}/site-visits`, {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data: { visits?: unknown; questions?: unknown } = await res.json();
    if (typeof data.visits !== "number") return null;

    return {
      views: data.visits,
      questions: typeof data.questions === "number" ? data.questions : null,
    };
  } catch {
    return null;
  }
}
