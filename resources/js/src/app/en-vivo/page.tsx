"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Clock, Users, Video, Wifi } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Candidate {
  name: string;
  title?: string;
  photo_url?: string;
}

interface LiveStream {
  id: number;
  title: string;
  description?: string;
  status: "idle" | "live" | "ended";
  stream_key: string;
  thumbnail?: string;
  started_at?: string;
  ended_at?: string;
  peak_viewers: number;
  current_viewers: number;
  chunk_count: number;
}

const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "";

const formatDuration = (start?: string | null, end?: string | null) => {
  if (!start) return "";
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function EnVivoPage() {
  const [streams, setStreams]     = useState<LiveStream[]>([]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading]     = useState(true);
  // (light mode — bg-gray-50)

  useEffect(() => {
    fetch(`${API}/candidate`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCandidate(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/livestreams`);
        const data = await res.json();
        setStreams(Array.isArray(data) ? data : []);
      } catch {}
      finally { setLoading(false); }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const live  = streams.filter(s => s.status === "live");
  const ended = streams.filter(s => s.status === "ended");

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Radio size={22} className="text-red-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">En vivo</h1>
            <p className="text-gray-500 text-xs">Transmisiones de la campaña de James Cueva</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
          </div>
        )}

        {/* Live now */}
        {live.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <h2 className="font-bold text-red-600 uppercase text-xs tracking-widest">Ahora en vivo</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {live.map(s => <StreamCard key={s.id} stream={s} candidate={candidate} />)}
            </div>
          </section>
        )}

        {/* Past streams */}
        {ended.length > 0 && (
          <section>
            <h2 className="font-semibold text-gray-500 text-sm mb-5">Transmisiones anteriores</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {ended.map(s => <StreamCard key={s.id} stream={s} candidate={candidate} />)}
            </div>
          </section>
        )}

        {!loading && streams.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Wifi size={44} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">No hay transmisiones disponibles aún.</p>
            <p className="text-xs mt-1">Vuelve pronto para ver los eventos en vivo.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamCard({ stream: s, candidate }: { stream: LiveStream; candidate: Candidate | null }) {
  const isLive = s.status === "live";

  return (
    <Link
      href={`/en-vivo/${s.stream_key}`}
      className="group block bg-white rounded-2xl overflow-hidden border border-gray-200 hover:border-red-300 hover:shadow-md transition-all duration-200"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
        {s.thumbnail
          ? <img src={s.thumbnail} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <Video size={32} className="text-gray-300" />
        }

        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

        {isLive ? (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            EN VIVO
          </span>
        ) : (
          <span className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
            Grabación
          </span>
        )}

        {isLive && s.current_viewers > 0 && (
          <span className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
            <Users size={10} />
            {s.current_viewers.toLocaleString()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        {/* Broadcaster row */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-100 shrink-0 ring-1 ring-red-500/30">
            {candidate?.photo_url
              ? <img src={candidate.photo_url} alt={candidate.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Radio size={12} className="text-red-500" /></div>
            }
          </div>
          <span className="text-gray-500 text-xs truncate">
            {candidate?.name ?? "Campaña James Cueva"}
          </span>
        </div>

        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 group-hover:text-red-600 transition-colors leading-snug">
          {s.title}
        </h3>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          {s.started_at && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {formatDate(s.started_at)}
            </span>
          )}
          {!isLive && s.peak_viewers > 0 && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              {s.peak_viewers.toLocaleString()} espectadores
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
