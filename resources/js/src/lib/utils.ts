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
