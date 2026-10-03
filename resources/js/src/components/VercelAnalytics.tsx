"use client";
import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: visitas y páginas vistas sin cookies ni datos personales.
 * No cuenta /admin ni /superadmin (pruebas del equipo): solo el tráfico ciudadano.
 */
const INTERNO = /^\/(admin|superadmin)(\/|$)/;

export function VercelAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => (INTERNO.test(new URL(event.url).pathname) ? null : event)}
    />
  );
}
