"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, ImageOff } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { mediaApi, type CampaignPhoto, type CampaignVideo } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";
import InteractiveBentoGallery, { type MediaItemType } from "@/components/ui/interactive-bento-gallery";

const ALL = "todos";

// Spans asignados según posición para crear variedad visual bento
const PHOTO_SPANS = [
  "md:col-span-1 md:row-span-3 sm:col-span-1 sm:row-span-2",
  "md:col-span-2 md:row-span-2 sm:col-span-2 sm:row-span-2",
  "md:col-span-1 md:row-span-2 sm:col-span-2 sm:row-span-1",
];
const VIDEO_SPAN = "md:col-span-2 md:row-span-2 sm:col-span-2 sm:row-span-2";

function getYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return m ? m[1] : null;
}

function toMediaItem(
  item: CampaignPhoto | CampaignVideo,
  index: number
): MediaItemType {
  const isVideo = "thumbnail" in item;

  if (isVideo) {
    const v = item as CampaignVideo;
    const ytId = getYoutubeId(v.url);
    // YouTube no soporta <video src> — mostrar como imagen con thumbnail
    if (ytId || v.url.includes("youtube") || v.url.includes("youtu.be")) {
      const thumb =
        v.thumbnail ||
        (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : "");
      return {
        id: v.id + 10000, // evitar colisión de ids con fotos
        type: "image",
        title: v.title || "Video de campaña",
        desc: v.category || "",
        url: thumb,
        span: VIDEO_SPAN,
      };
    }
    return {
      id: v.id + 10000,
      type: "video",
      title: v.title || "Video de campaña",
      desc: v.category || "",
      url: v.url,
      span: VIDEO_SPAN,
    };
  }

  const p = item as CampaignPhoto;
  return {
    id: p.id,
    type: "image",
    title: p.title || "Foto de campaña",
    desc: p.category || "",
    url: p.url,
    span: PHOTO_SPANS[index % PHOTO_SPANS.length],
  };
}

export default function GaleriaPage() {
  const { profile } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  const [photos, setPhotos]         = useState<CampaignPhoto[]>([]);
  const [videos, setVideos]         = useState<CampaignVideo[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [active, setActive]         = useState(ALL);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async (cat: string) => {
    setLoading(true);
    try {
      const [photoRes, videoRes, cats] = await Promise.all([
        mediaApi.gallery.list(cat),
        mediaApi.campaignVideos.list(cat === ALL ? undefined : cat),
        categories.length === 0 ? mediaApi.gallery.categories() : Promise.resolve(categories),
      ]);
      setPhotos(photoRes.data);
      setVideos(videoRes.data);
      if (categories.length === 0) setCategories(cats as string[]);
    } catch {}
    finally { setLoading(false); }
  }, [categories]);

  useEffect(() => { load(ALL); }, []);

  function changeFilter(cat: string) {
    setActive(cat);
    load(cat);
  }

  // Intercalar videos entre fotos para mejor distribución visual
  const mediaItems: MediaItemType[] = (() => {
    const result: MediaItemType[] = [];
    let photoIdx = 0;
    let videoIdx = 0;
    // Patrón: 2 fotos → 1 video → 2 fotos → 1 video…
    while (photoIdx < photos.length || videoIdx < videos.length) {
      for (let i = 0; i < 2 && photoIdx < photos.length; i++) {
        result.push(toMediaItem(photos[photoIdx], photoIdx));
        photoIdx++;
      }
      if (videoIdx < videos.length) {
        result.push(toMediaItem(videos[videoIdx], result.length));
        videoIdx++;
      }
    }
    return result;
  })();

  const allCats = [ALL, ...categories];
  const isEmpty = !loading && mediaItems.length === 0;

  return (
    <main className="relative">
      <Navbar />

      <section className="pt-8 md:pt-12 pb-24 px-6 bg-white">
        <div className="mx-auto max-w-7xl">

          {/* Hero header */}
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="eyebrow-red">Galería de Campaña</span>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mt-3 mb-4">
              Recorriendo <span className="text-brand-500">{profile.location}</span>
            </h1>
            <p className="text-gray-500">
              Cada imagen cuenta una historia. Acompáñanos en el recorrido de{" "}
              {shortName} por cada rincón.
            </p>
          </div>

          {/* Filtros por categoría */}
          {categories.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {allCats.map((cat) => (
                <button
                  key={cat}
                  onClick={() => changeFilter(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                    active === cat
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                  }`}
                >
                  {cat === ALL ? "Todas" : cat}
                </button>
              ))}
            </div>
          )}

          {/* Contenido */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 size={28} className="animate-spin text-brand-500" />
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <ImageOff size={40} className="mb-3 opacity-30" />
              <p className="text-sm">No hay contenido en esta categoría aún.</p>
            </div>
          ) : (
            // key fuerza remount al cambiar categoría (el componente maneja su propio state interno)
            <InteractiveBentoGallery
              key={`${active}-${mediaItems.length}`}
              mediaItems={mediaItems}
            />
          )}

        </div>
      </section>

      <Footer />
    </main>
  );
}
