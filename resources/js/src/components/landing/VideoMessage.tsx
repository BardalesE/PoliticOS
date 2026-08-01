"use client";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX, Play, Pause } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

/**
 * "Video del candidato" — mensaje corto a cámara, vertical (formato historia),
 * distinto del video ambiental de fondo del Hero (`hero_video_url`). Autoplay
 * en mute (requisito de los navegadores) con control para activar sonido.
 */
export function VideoMessage() {
  const { profile } = useCandidate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const shortName = profile.name.split(" ")[0];

  if (!profile.testimonial_video_url) return null;

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  return (
    <section id="video-mensaje" className="py-20 md:py-28 px-5" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <span
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
            style={{ color: "rgb(var(--brand-primary-rgb))" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
            Un mensaje directo
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            {shortName} te habla,{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
              con sus propias palabras.
            </em>
          </h2>
          <p className="mt-3 text-base" style={{ color: "var(--page-ink-soft)" }}>
            Sin guion de asesores, sin filtro. Actívale el sonido y escucha.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto w-full max-w-[300px] aspect-[9/16] rounded-[24px] overflow-hidden bg-black"
        >
          <video
            ref={videoRef}
            src={profile.testimonial_video_url}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            onClick={togglePlay}
          />

          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between pointer-events-none">
            <p className="text-white text-sm font-semibold pointer-events-none">{profile.name}</p>
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={togglePlay}
                aria-label={playing ? "Pausar video" : "Reproducir video"}
                className="w-9 h-9 rounded-full bg-white/20 backdrop-blur grid place-items-center text-white"
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                onClick={toggleMute}
                aria-label={muted ? "Activar sonido" : "Silenciar"}
                className="w-9 h-9 rounded-full bg-white/20 backdrop-blur grid place-items-center text-white"
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
