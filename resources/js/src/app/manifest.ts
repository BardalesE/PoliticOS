import type { MetadataRoute } from "next";

/**
 * "Agregar a pantalla de inicio": PoliticOS se abre como app (sin barra del
 * navegador). El color y el ícono son los de la plataforma, no los de un candidato.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PoliticOS — Conoce antes de decidir",
    short_name: "PoliticOS",
    description: "Pregunta por las propuestas de tus candidatos con sus documentos oficiales.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#14532d",
    lang: "es-PE",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
