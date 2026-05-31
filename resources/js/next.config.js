/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,

  // Produces a self-contained .next/standalone/server.js
  // Supervisor runs: node .next/standalone/server.js
  output: 'standalone',

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http",  hostname: "localhost" },
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
