"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlayCircle, X, Loader2, VideoOff } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { GlassCard } from "@/components/ui/GlassCard";
import { api, mediaApi, type Video, type CampaignVideo } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export default function VideosPage() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];
  const [urlVideos, setUrlVideos]         = useState<Video[]>([]);
  const [campaignVids, setCampaignVids]   = useState<CampaignVideo[]>([]);
  const [loadingUrl, setLoadingUrl]       = useState(true);
  const [loadingCamp, setLoadingCamp]     = useState(true);
  const [activeVideo, setActiveVideo]     = useState<CampaignVideo | null>(null);

  useEffect(() => {
    api.videos.list()
      .then((data) => setUrlVideos(data))
      .catch(() => {})
      .finally(() => setLoadingUrl(false));

    mediaApi.campaignVideos.list()
      .then((res) => setCampaignVids(res.data))
      .catch(() => {})
      .finally(() => setLoadingCamp(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveVideo(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isLoading = loadingUrl && loadingCamp;
  const hasContent = urlVideos.length > 0 || campaignVids.length > 0;

  return (
    <main className="relative">
      <Navbar />

      <section className="pt-8 md:pt-12 pb-24 px-6">
        <div className="mx-auto max-w-6xl">

          {/* Hero header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="section-badge mb-5 mx-auto">Multimedia</div>
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 mt-2">
              Videos <span className="text-brand-500">de campaña</span>
            </h1>
            <p className="text-gray-600">
              Mira a {shortName} en acción, recorriendo cada rincón de {profile.location}.
            </p>
          </div>

          {/* Loading global */}
          {isLoading && (
            <div className="flex justify-center py-20">
              <Loader2 size={28} className="animate-spin text-brand-400" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !hasContent && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <VideoOff size={40} className="mb-3 opacity-30" />
              <p className="text-sm">No hay videos disponibles aún.</p>
            </div>
          )}

          {/* ── Sección 1: Videos con URL (TikTok / YouTube) ── */}
          {!loadingUrl && urlVideos.length > 0 && (
            <div className="mb-16">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="font-display text-2xl font-bold text-gray-900">En redes sociales</h2>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-300 text-xs text-gray-600">
                  {urlVideos.length} videos
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {urlVideos.map((v, i) => (
                  <a
                    key={v.id}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <GlassCard delay={i * 0.05} className="overflow-hidden h-full">
                      <div className="relative aspect-video bg-gradient-to-br from-brand-700 to-ink-900 overflow-hidden">
                        {v.thumbnail ? (
                          <img
                            src={v.thumbnail}
                            alt={v.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-black/30 grid place-items-center">
                          <PlayCircle
                            size={56}
                            className="text-white/80 group-hover:scale-110 transition-transform drop-shadow-lg"
                          />
                        </div>
                        {v.views > 0 && (
                          <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-medium">
                            {formatViews(v.views)} views
                          </span>
                        )}
                      </div>
                      <div className="p-5">
                        {v.topic && (
                          <p className="text-xs uppercase tracking-wider text-brand-500 mb-2">{v.topic}</p>
                        )}
                        <h3 className="font-display text-lg font-semibold text-gray-900">{v.title}</h3>
                      </div>
                    </GlassCard>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── Sección 2: Videos subidos (campaña) ── */}
          {!loadingCamp && campaignVids.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <h2 className="font-display text-2xl font-bold text-gray-900">Videos de campaña</h2>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-500">
                  {campaignVids.length} videos
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {campaignVids.map((v, i) => (
                  <motion.div
                    key={v.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                    className="group cursor-pointer"
                    onClick={() => setActiveVideo(v)}
                  >
                    <div className="bg-white border border-gray-800 rounded-2xl overflow-hidden hover:border-brand-500 transition-colors shadow-sm">
                      {/* Thumbnail */}
                      <div className="relative aspect-video bg-gradient-to-br from-brand-900/60 to-ink-900 flex items-center justify-center overflow-hidden">
                        {v.thumbnail ? (
                          <img
                            src={v.thumbnail}
                            alt={v.title ?? ""}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <div className="p-4 rounded-full bg-brand-600/80 group-hover:bg-brand-500 transition-colors">
                            <PlayCircle size={28} className="text-white" />
                          </div>
                        </div>
                        <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-black/60 text-white/70 text-[10px] capitalize">
                          {v.category}
                        </span>
                      </div>
                      {/* Info */}
                      <div className="p-4">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {v.title ?? "Sin título"}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(v.created_at).toLocaleDateString("es-PE", {
                            day: "numeric", month: "long", year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ── Video player modal ── */}
      <AnimatePresence>
        {activeVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setActiveVideo(null)}
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              className="relative w-full max-w-4xl"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                src={activeVideo.url}
                controls
                autoPlay
                className="w-full rounded-2xl max-h-[75vh] bg-black"
              />
              {(activeVideo.title || activeVideo.category) && (
                <div className="mt-3 text-center">
                  {activeVideo.title && (
                    <p className="text-white font-medium">{activeVideo.title}</p>
                  )}
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{activeVideo.category}</p>
                </div>
              )}
            </motion.div>

            <button
              onClick={() => setActiveVideo(null)}
              className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </main>
  );
}
