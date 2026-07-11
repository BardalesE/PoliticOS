import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Source_Serif_4 } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { CandidateProvider } from "@/context/CandidateContext";
import { DynamicTitle } from "@/components/DynamicTitle";
import { TenantGuard } from "@/components/TenantGuard";
import type { CandidatePublicData } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

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
    const res = await fetch(`${API_URL}/candidate`, {
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#D91023",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Next.js deduplicates this fetch with generateMetadata — one request per render
  const initialCandidate = await fetchCandidate();

  return (
    <html lang="es" className={`${inter.variable} ${serif.variable} ${fraunces.variable}`} suppressHydrationWarning>
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
