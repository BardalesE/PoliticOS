// Host del backend (sirve los uploads) — derivado de la URL de la API en build.
// Cubre tanto dominios (api.politicos.pe) como deploys por IP directa.
const apiHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,

  // Produces a self-contained .next/standalone/server.js
  // Supervisor runs: node .next/standalone/server.js
  output: 'standalone',

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
