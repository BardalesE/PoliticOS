import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { CandidateProvider } from "@/context/CandidateContext";
import type { CandidatePublicData } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function fetchCandidate(): Promise<CandidatePublicData | null> {
  try {
    const res = await fetch(`${API_URL}/candidate`, { next: { revalidate: 60 } });
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

export async function generateMetadata(): Promise<Metadata> {
  const data = await fetchCandidate();
  const name     = data?.profile?.name     ?? "Candidato";
  const location = data?.profile?.location ?? "Perú";
  const tagline  = data?.profile?.tagline  ?? "Plataforma de campaña política";
  const shortName = name.split(" ")[0];

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
    <html lang="es" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-white font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <CandidateProvider initialData={initialCandidate}>
            {children}
          </CandidateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
