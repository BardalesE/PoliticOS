/**
 * lib/feedback.ts
 * Calificacion (1-5 estrellas) + comentario libre de la PLATAFORMA.
 * Anonimo por diseno: no manda visitor_uuid ni nada identificable.
 */
import { normalizeApiBase } from "@/lib/api";

const API_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

export interface SendFeedbackInput {
  stars: number; // 1-5
  comment?: string;
  context?: "chat" | "home";
  candidateSlug?: string | null;
  tenantSlug?: string | null;
}

/** true si se guardó. Nunca lanza: un fallo de red no debe romper la UI. */
export async function sendFeedback(input: SendFeedbackInput): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        stars: input.stars,
        comment: input.comment?.trim() || undefined,
        context: input.context ?? "chat",
        candidate_slug: input.candidateSlug ?? undefined,
        tenant_slug: input.tenantSlug ?? undefined,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
