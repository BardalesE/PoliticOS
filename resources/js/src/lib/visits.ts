/**
 * lib/visits.ts
 * Contador público de visitas únicas por IP de la plataforma.
 *
 * La visita se registra DESDE EL NAVEGADOR (no en el server-side render de
 * Next.js): si la registrara el servidor de Vercel, todas las visitas llegarían
 * al API con la IP de Vercel y el contador se quedaría en 1.
 *
 * Es un contador GLOBAL de la plataforma, por eso NO manda X-Tenant ni ?tenant=.
 */
import { normalizeApiBase } from "@/lib/api";

const API_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");
const SESSION_KEY = "politicos_visit_registered";

/**
 * Registra la visita (una sola vez por sesión de pestaña; el servidor además
 * deduplica por IP) y devuelve el total de visitantes únicos.
 * Devuelve null si el API no responde — la UI debe ocultar el contador en ese
 * caso en vez de mostrar un "0" falso.
 */
export async function syncVisits(): Promise<number | null> {
  let alreadyRegistered = false;
  try {
    alreadyRegistered = sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {}

  try {
    // POST sin body ni Content-Type: es una "simple request" de CORS, sin preflight.
    const res = await fetch(`${API_URL}/site-visits`, {
      method: alreadyRegistered ? "GET" : "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data: { visits?: unknown } = await res.json();
    if (typeof data.visits !== "number") return null;

    if (!alreadyRegistered) {
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
    }
    return data.visits;
  } catch {
    return null;
  }
}
