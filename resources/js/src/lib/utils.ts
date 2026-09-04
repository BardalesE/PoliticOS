import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { resolveTenantSlug } from "@/lib/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Namespacing por tenant para claves de localStorage compartidas por todos
 * los candidatos en el mismo dominio (?tenant= sobre el mismo origen, no
 * subdominios). Sin esto, un ciudadano que visita al Candidato A y luego al
 * Candidato B en el mismo navegador hereda su sesión/historial/puntos.
 */
export function tenantStorageKey(base: string): string {
  const slug = resolveTenantSlug() || "default";
  return `${base}_${slug}`;
}

/**
 * Presupuesto de una propuesta como monto en soles sin decimales
 * (S/ 1,250,000). Laravel serializa el cast `decimal:2` como string, así que
 * se normaliza con Number(). Sin cifra cargada (null / 0 / vacío) devuelve
 * "Presupuesto por definir" — el candidato aún no lo publicó, no que la
 * propuesta no cueste.
 */
export function formatBudget(budget?: number | string | null): string {
  const n = Number(budget);
  if (!Number.isFinite(n) || n <= 0) return "Presupuesto por definir";
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(n);
}
