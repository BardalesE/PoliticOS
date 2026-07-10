// Host del backend (sirve los uploads) — derivado de la URL de la API en build.
// Cubre tanto dominios (api.politicos.pe) como deploys por IP directa.
const apiHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

// Headers de seguridad del documento HTML servido por Next.js.
// QA_COMPLETO.md (Fase 9): SecurityHeaders (Laravel) solo cubre las respuestas
// de /api/*; el HTML real que ve el usuario (incluido todo /admin/*) no llevaba
// ningún header de seguridad — sin protección de documento contra clickjacking.
// Mismas directivas que app/Http/Middleware/SecurityHeaders.php del lado API,
// adaptadas para el documento (agrega connect-src hacia el backend).
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requiere unsafe-eval en dev
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob:",
  `connect-src 'self' ${apiUrl} https://api.anthropic.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },

  // Produces a self-contained .next/standalone/server.js
  // Supervisor runs: node .next/standalone/server.js
  // En Vercel (VERCEL=1) se desactiva: Vercel usa su propio formato de salida y
  // 'standalone' provoca fallo post-build. Se mantiene para auto-hospedaje.
  output: process.env.VERCEL ? undefined : 'standalone',

  images: {
    remotePatterns: [
      // Dominios propios (uploads servidos por el backend de cada tenant)
      { protocol: "https", hostname: "politicos.pe" },
      { protocol: "https", hostname: "**.politicos.pe" },
      // Hosts externos que el contenido ya referencia
      { protocol: "https", hostname: "img.youtube.com" },     // thumbnails de videos
      { protocol: "https", hostname: "images.unsplash.com" }, // placeholders del landing
      // Desarrollo local y deploys por IP directa
      { protocol: "http", hostname: "localhost" },
      ...(apiHost && apiHost !== "localhost"
        ? [
            { protocol: "https", hostname: apiHost },
            { protocol: "http", hostname: apiHost },
          ]
        : []),
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,      // 24h (era 1h)
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "recharts",
      "@radix-ui/react-dialog",
    ],
    // Compila con turbopack en dev para arranque más rápido
    turbo: {},
  },

};

module.exports = nextConfig;
