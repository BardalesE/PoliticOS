"use client";
import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: visitas y páginas vistas sin cookies ni datos personales.
 * No cuenta el panel admin (ni las pruebas del equipo): solo el tráfico ciudadano.
 */
export function VercelAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => (new URL(event.url).pathname.startsWith("/admin") ? null : event)}
    />
  );
}
