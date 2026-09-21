import { normalizeApiBase, tenantHeaders } from "@/lib/api";

const API = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

export type VerifyChannel = "email" | "whatsapp";

export interface VerificationConfig {
  enabled: boolean;
  channels: { email: boolean; whatsapp: boolean };
}

export interface VerifyResult {
  ok: boolean;
  message?: string;
  /** Segundos que faltan para poder reenviar (cooldown / rate limit). */
  retryAfter?: number;
  /** Solo en start: cuánto espera antes de poder reenviar. */
  resendIn?: number;
  masked?: string;
}

const headers = () => ({ "Content-Type": "application/json", Accept: "application/json", ...tenantHeaders() });

/** Sin config (API caída) se asume "sin verificación" y el servidor decide al registrar. */
export async function getVerificationConfig(): Promise<VerificationConfig> {
  try {
    const r = await fetch(`${API}/citizen/verify/config`, { headers: headers() });
    if (r.ok) return (await r.json()) as VerificationConfig;
  } catch { /* cae al default */ }
  return { enabled: false, channels: { email: false, whatsapp: false } };
}

async function call(path: string, body: Record<string, unknown>): Promise<VerifyResult> {
  try {
    const r = await fetch(`${API}/citizen/verify/${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, resendIn: data.resend_in, masked: data.masked };
    const firstError = data.errors ? (Object.values(data.errors)[0] as string[] | undefined)?.[0] : undefined;
    return { ok: false, message: data.message ?? firstError ?? "No pudimos completar la verificación.", retryAfter: data.retry_after };
  } catch {
    return { ok: false, message: "No pudimos conectar. Intenta de nuevo en un momento." };
  }
}

export const startVerification = (channel: VerifyChannel, contact: string, visitorId: string) =>
  call("start", { channel, contact, visitor_uuid: visitorId || null });

export const confirmVerification = (channel: VerifyChannel, contact: string, code: string, visitorId: string) =>
  call("confirm", { channel, contact, code, visitor_uuid: visitorId || null });
