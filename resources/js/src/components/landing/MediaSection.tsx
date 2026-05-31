"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Film, Play, ArrowRight, ImageIcon } from "lucide-react";
import Link from "next/link";
import { mediaApi, type CampaignPhoto, type CampaignVideo } from "@/lib/api";

function getYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return m ? m[1] : null;
}

function getVideoThumb(v: CampaignVideo): string {
  if (v.thumbnail) return v.thumbnail;
  const ytId = getYoutubeId(v.url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return "";
}

// ── Fallbacks estáticos ──────────────────────────────────────────────────────
const FALLBACK_PHOTOS: CampaignPhoto[] = [
  { id: 1, url: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80", title: "Reunión con la comunidad",  category: "Campaña" },
  { id: 2, url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80", title: "Visita a los caseríos",      category: "Distritos" },
  { id: 3, url: "https://images.unsplash.com/photo-1573164713619-24a2533aafb8?w=600&q=80", title: "Propuestas de salud",      category: "Salud" },
  { id: 4, url: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&q=80", title: "Educación para todos",     category: "Educación" },
  { id: 5, url: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&q=80", title: "Agua para el campo",       category: "Agua" },
  { id: 6, url: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&q=80", title: "Infraestructura rural",   category: "Obras" },
  { id: 7, url: "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=600&q=80", title: "Seguridad ciudadana",     category: "Seguridad" },
  { id: 8, url: "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=600&q=80", title: "Mitin central",            category: "Campaña" },
] as unknown as CampaignPhoto[];

// ── Photo card ───────────────────────────────────────────────────────────────
function PhotoCard({ photo }: { photo: CampaignPhoto }) {
  return (
    <div className="relative flex-shrink-0 w-64 h-44 rounded-2xl overflow-hidden group/card cursor-pointer border border-white/20"
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
      {photo.url ? (
        <img
          src={photo.url}
          alt={photo.title || "Foto de campaña"}
          className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-brand-100 flex items-center justify-center">
          <ImageIcon size={32} className="text-brand-300" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-3">
        {photo.category && (
          <span className="inline-block bg-brand-600/80 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-1">
            {photo.category}
          </span>
        )}
        {photo.title && (
          <p className="text-white text-xs font-semibold leading-tight line-clamp-1">{photo.title}</p>
        )}
      </div>
    </div>
  );
}

// ── Video card ───────────────────────────────────────────────────────────────
function VideoCard({ video }: { video: CampaignVideo }) {
  const thumb = getVideoThumb(video);
  return (
    <div className="relative flex-shrink-0 w-72 h-44 rounded-2xl overflow-hidden group/card cursor-pointer border border-white/20"
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
      {thumb ? (
        <img
          src={thumb}
          alt={video.title || "Video de campaña"}
          className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-brand-900 flex items-center justify-center">
          <Film size={32} className="text-brand-400" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      {/* Play button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm border border-white/40 grid place-items-center
                        group-hover/card:scale-110 group-hover/card:bg-white/30 transition-all duration-300">
          <Play size={18} className="text-white translate-x-0.5" fill="white" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white text-xs font-semibold leading-tight line-clamp-1">{video.title || "Video de campaña"}</p>
      </div>
    </div>
  );
}

// ── Marquee track ─────────────────────────────────────────────────────────────
function MarqueeTrack({
  children,
  direction = "left",
  duration = "35s",
}: {
  children: React.ReactNode;
  direction?: "left" | "right";
  duration?: string;
}) {
  return (
    <div
      className="group flex overflow-hidden"
      style={{ maskImage: "linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%)" }}
    >
      <div
        className={direction === "left" ? "animate-marquee-left" : "animate-marquee-right"}
        style={{ "--marquee-dur": duration } as React.CSSProperties}
      >
        <div className="flex gap-4 pr-4">
          {children}
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function MediaSection({
  initialPhotos = [],
  initialVideos = [],
}: {
  initialPhotos?: CampaignPhoto[];
  initialVideos?: CampaignVideo[];
}) {
  const [photos, setPhotos] = useState<CampaignPhoto[]>(
    initialPhotos.length ? initialPhotos.slice(0, 12) : FALLBACK_PHOTOS
  );
  const [videos, setVideos] = useState<CampaignVideo[]>(initialVideos.slice(0, 8));

  useEffect(() => {
    if (initialPhotos.length || initialVideos.length) return;
    Promise.all([
      mediaApi.gallery.list().then((r) => r.data.slice(0, 12)).catch(() => []),
      mediaApi.campaignVideos.list().then((r) => r.data.slice(0, 8)).catch(() => []),
    ]).then(([p, v]) => {
      if ((p as CampaignPhoto[]).length) setPhotos(p as CampaignPhoto[]);
      setVideos(v as CampaignVideo[]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section id="multimedia" className="relative bg-white py-20 md:py-28 overflow-hidden">
      {/* Fondo decorativo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, #FEF2F2 0%, transparent 70%)" }}
      />

      <div className="relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="px-5 max-w-5xl mx-auto mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6"
        >
          <div>
            <span className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-extrabold uppercase tracking-[2px] px-4 py-2 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              Galería &amp; Videos
            </span>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mt-2">
              Lo que ha pasado{" "}
              <span style={{ background: "linear-gradient(135deg,#DC2626,#EF4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                en campaña.
              </span>
            </h2>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link
              href="/galeria"
              className="inline-flex items-center gap-2 border-2 border-brand-700 text-brand-700 hover:bg-brand-50 px-4 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors"
            >
              <Camera size={14} /> Galería
            </Link>
            <Link
              href="/videos"
              className="inline-flex items-center gap-2 bg-brand-700 hover:bg-brand-900 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors"
              style={{ boxShadow: "0 4px 16px rgba(220,38,38,0.28)" }}
            >
              <Film size={14} /> Videos
            </Link>
          </div>
        </motion.div>

        {/* ── Slider de FOTOS → izquierda ── */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mb-5"
        >
          <div className="flex items-center gap-2.5 px-5 max-w-5xl mx-auto mb-4">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-200 grid place-items-center">
              <Camera size={14} className="text-brand-600" />
            </div>
            <span className="text-[11px] font-extrabold uppercase tracking-[2px] text-brand-600">
              Fotos de campaña
            </span>
            <div className="flex-1 h-px bg-brand-100" />
            <span className="text-[10px] text-ink-400 font-semibold flex items-center gap-1">
              <ArrowRight size={10} className="opacity-60" /> desplazando
            </span>
          </div>
          <MarqueeTrack direction="left" duration="40s">
            {photos.map((p) => (
              <PhotoCard key={p.id} photo={p} />
            ))}
          </MarqueeTrack>
        </motion.div>

        {/* ── Slider de VIDEOS ← derecha ── */}
        {videos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: 0.12 }}
          >
            <div className="flex items-center gap-2.5 px-5 max-w-5xl mx-auto mb-4">
              <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-200 grid place-items-center">
                <Film size={14} className="text-brand-600" />
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-[2px] text-brand-600">
                Videos
              </span>
              <div className="flex-1 h-px bg-brand-100" />
              <span className="text-[10px] text-ink-400 font-semibold flex items-center gap-1">
                <ArrowRight size={10} className="opacity-60 rotate-180" /> desplazando
              </span>
            </div>
            <MarqueeTrack direction="right" duration="32s">
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </MarqueeTrack>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-10 text-center px-5"
        >
          <Link
            href="/galeria"
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-600 hover:text-brand-900 transition-colors border-b-2 border-brand-200 hover:border-brand-600 pb-0.5"
          >
            Ver galería completa <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
