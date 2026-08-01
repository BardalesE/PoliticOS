import type { Metadata, Viewport } from "next";
import { Anton, Fraunces, Inter, Source_Serif_4 } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { CandidateProvider } from "@/context/CandidateContext";
import { DynamicTitle } from "@/components/DynamicTitle";
import { TenantGuard } from "@/components/TenantGuard";
import type { CandidatePublicData } from "@/lib/api";
import { normalizeApiBase } from "@/lib/api";

const API_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api");

async function resolveTenantSlugServer(): Promise<string> {
  const reqHeaders = await headers();

  // Set by middleware from ?tenant= param or subdomain
  const fromMiddleware = reqHeaders.get("x-tenant-slug");
  if (fromMiddleware) return fromMiddleware;

  // Fallback: direct subdomain check (e.g. when middleware isn't invoked)
  const host = reqHeaders.get("host") ?? "";
  const parts = host.split(".");
  if (parts.length >= 3 && !["www", "app", "api"].includes(parts[0])) {
    return parts[0];
  }

  return process.env.NEXT_PUBLIC_TENANT_SLUG ?? "";
}

async function fetchCandidate(): Promise<CandidatePublicData | null> {
  try {
    const slug = await resolveTenantSlugServer();
    // El slug va también en la URL (no solo en el header X-Tenant): el Data
    // Cache de Next.js usa la URL como cache key y NO considera headers
    // custom, así que dos tenants pidiendo la misma ruta con headers
    // distintos podían compartir la respuesta cacheada de uno al otro
    // (flash del rojo por defecto u otro tenant, ver informe de QA).
    const url = slug ? `${API_URL}/candidate?tenant=${encodeURIComponent(slug)}` : `${API_URL}/candidate`;
    const res = await fetch(url, {
      headers: slug ? { "X-Tenant": slug } : {},
      next: { revalidate: 60, tags: slug ? [`candidate-${slug}`] : [] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "600", "700", "800"],   // elimina 500 — no se usa
  style: ["normal", "italic"],
  display: "swap",
  preload: true,
});

// Fraunces solo para titulares (h1/h2 de la landing, vía --font-display):
// el cuerpo de texto largo se queda en Source Serif 4, más legible en párrafos.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

// Anton: condensada/bold, uso acotado a propósito — NO reemplaza Fraunces en
// todo el sitio. Solo para los momentos "documentales" del rediseño (Hero,
// año gigante de cada capítulo de StoryTimeline, píldora flotante) — el
// resto de titulares (h1/h2 general) se queda en Fraunces.
const anton = Anton({
  subsets: ["latin"],
  variable: "--font-condensed",
  weight: "400",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const data = await fetchCandidate();
  const name      = data?.profile?.name     ?? "Candidato";
  const location  = data?.profile?.location ?? "Perú";
  const tagline   = data?.profile?.tagline  ?? "Plataforma de campaña política";
  const shortName = name.split(" ")[0];

  // "Candidato" means the fetch returned no tenant data — use generic title
  if (name === "Candidato") {
    return {
      title: "PoliticOS",
      description: "Plataforma de campaña política",
    };
  }

  return {
    title: `Habla con ${shortName} — ${location}`,
    description: `Conversa directamente con ${name}. Pregúntale sobre sus propuestas y lo que hará por ${location}.`,
    openGraph: {
      title: `Habla con ${shortName}`,
      description: tagline,
      type: "website",
      locale: "es_PE",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  // Next.js deduplica este fetch con generateMetadata() y RootLayout — una
  // sola llamada real por render. Antes themeColor era fijo "#D91023"
  // (rojo de PoliticOS): la barra de dirección/pestañas del navegador móvil
  // salía roja sin importar el candidato.
  const data = await fetchCandidate();
  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    themeColor: data?.profile?.color_primary ?? "#D91023",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Next.js deduplicates this fetch with generateMetadata — one request per render
  const initialCandidate = await fetchCandidate();

  return (
    <html lang="es" className={`${inter.variable} ${serif.variable} ${fraunces.variable} ${anton.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-white font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <CandidateProvider initialData={initialCandidate}>
            <TenantGuard />
            <DynamicTitle />
            {children}
          </CandidateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
