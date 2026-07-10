"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Wifi, WifiOff, Maximize2, Volume2, VolumeX, Loader2, PlayCircle } from "lucide-react";
import { resolveTenantSlug, tenantHeaders } from "@/lib/api";
import { LiveBadge } from "@/components/live/LiveBadge";

interface StreamInfo {
  title: string;
  status: "idle" | "live" | "ended";
  chunk_count: number;
  current_viewers: number;
  started_at: string | null;
  ended_at: string | null;
  chunks_base_url: string;  // http://host/api/livestreams/{key}/chunk
}

interface LivePlayerProps {
  streamKey: string;
  apiUrl?: string;
}

// ── Recording player — plain <video> with the /recording endpoint ──────────
// Supports full seek, hours of content, via HTTP range requests served by Laravel.
function RecordingPlayer({ src }: { src: string }) {
  const [state, setState] = useState<"loading" | "ready" | "processing" | "error">("loading");
  const [retries, setRetries] = useState(0);

  // Probe the endpoint before setting src so we catch 404/500 cleanly
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        // HEAD request — checks if recording.webm is ready without downloading it
        const res = await fetch(src, { method: "HEAD" });
        if (cancelled) return;
        if (res.ok) {
          setState("ready");
        } else if (res.status === 202) {
          // Still merging — retry in 4s
          setState("processing");
          setTimeout(() => { if (!cancelled) setRetries(r => r + 1); }, 4000);
        } else {
          setState("error");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    };
    probe();
    return () => { cancelled = true; };
  }, [src, retries]);

  return (
    <div className="relative w-full aspect-video bg-zinc-950 rounded-2xl overflow-hidden">

      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Loader2 size={32} className="animate-spin text-zinc-500 mb-2" />
          <p className="text-zinc-400 text-sm">Cargando grabación...</p>
        </div>
      )}

      {state === "processing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="animate-spin text-zinc-500" />
          <p className="text-zinc-300 text-sm font-medium">Procesando grabación...</p>
          <p className="text-zinc-500 text-xs">Esto tarda unos segundos, recargando pronto</p>
        </div>
      )}

      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <WifiOff size={32} className="text-red-400" />
          <p className="text-red-300 text-sm">No se pudo cargar la grabación.</p>
          <button
            onClick={() => { setState("loading"); setRetries(r => r + 1); }}
            className="text-xs text-zinc-400 underline mt-1"
          >
            Reintentar
          </button>
        </div>
      )}

      {state === "ready" && (
        <>
          <video
            src={src}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          />
          <div className="absolute top-3 left-3 pointer-events-none">
            <span className="bg-zinc-800/90 text-zinc-300 text-xs font-semibold px-2.5 py-1 rounded-full">
              GRABACIÓN
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Live player — MSE-based streaming ─────────────────────────────────────
function LiveStreamPlayer({ streamKey, base, info }: {
  streamKey: string;
  base: string;
  info: StreamInfo;
}) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const msRef         = useRef<MediaSource | null>(null);
  const sbRef         = useRef<SourceBuffer | null>(null);
  const queueRef      = useRef<ArrayBuffer[]>([]);
  const appendingRef  = useRef(false);
  const nextChunkRef  = useRef(0);
  const fetchingRef   = useRef(false);
  const viewerToken   = useRef("");

  const [connected, setConnected] = useState(false);
  const [muted, setMuted]         = useState(false);

  // Resolve viewer token
  useEffect(() => {
    let t = localStorage.getItem("live_viewer_token");
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("live_viewer_token", t); }
    viewerToken.current = t;
  }, []);

  const flushQueue = useCallback(() => {
    if (appendingRef.current || !sbRef.current?.updating === false) return;
    if (!sbRef.current || sbRef.current.updating || queueRef.current.length === 0) return;
    const chunk = queueRef.current.shift()!;
    appendingRef.current = true;
    try { sbRef.current.appendBuffer(chunk); } catch { appendingRef.current = false; }
    const v = videoRef.current;
    if (v && v.paused && v.readyState >= 2) v.play().catch(() => {});
  }, []);

  const initMSE = useCallback(() => {
    if (msRef.current || !videoRef.current || !("MediaSource" in window)) return;
    const ms = new MediaSource();
    msRef.current = ms;
    videoRef.current.src = URL.createObjectURL(ms);
    ms.addEventListener("sourceopen", () => {
      const mime = 'video/webm;codecs="vp8,opus"';
      if (!MediaSource.isTypeSupported(mime)) return;
      const sb = ms.addSourceBuffer(mime);
      sbRef.current = sb;
      sb.addEventListener("updateend", () => { appendingRef.current = false; flushQueue(); });
    });
  }, [flushQueue]);

  const fetchChunk = useCallback(async (seq: number): Promise<boolean> => {
    if (fetchingRef.current) return false;
    fetchingRef.current = true;
    try {
      const res = await fetch(`${info.chunks_base_url}/${seq}`, { headers: tenantHeaders() });
      if (!res.ok) return false;
      queueRef.current.push(await res.arrayBuffer());
      nextChunkRef.current = seq + 1;
      flushQueue();
      setConnected(true);
      return true;
    } catch { return false; }
    finally { fetchingRef.current = false; }
  }, [info.chunks_base_url, flushQueue]);

  useEffect(() => {
    let destroyed = false;
    let timerId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (destroyed) return;
      initMSE();
      // Fetch next pending chunk if available
      if (nextChunkRef.current < info.chunk_count) {
        await fetchChunk(nextChunkRef.current);
      }
      // Ping backend with our token
      fetch(`${base}/livestreams/${streamKey}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...tenantHeaders() },
        body: JSON.stringify({ viewer_token: viewerToken.current }),
      }).catch(() => {});

      if (!destroyed) timerId = setTimeout(poll, 3000);
    };

    poll();
    return () => {
      destroyed = true;
      clearTimeout(timerId);
      if (msRef.current?.readyState === "open") try { msRef.current.endOfStream(); } catch {}
      if (videoRef.current?.src) URL.revokeObjectURL(videoRef.current.src);
    };
  }, [streamKey, info.chunk_count]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative bg-zinc-950 rounded-2xl overflow-hidden group">
      <video ref={videoRef} className="w-full aspect-video object-cover" autoPlay playsInline muted={muted} />

      {/* Connecting overlay */}
      {!connected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
          <div className="w-12 h-12 rounded-full border-2 border-red-500 border-t-transparent animate-spin mb-3" />
          <p className="text-zinc-300 text-sm">Conectando al stream en vivo...</p>
        </div>
      )}

      {/* EN VIVO badge */}
      {connected && (
        <LiveBadge className="absolute top-3 left-3 pointer-events-none" />
      )}

      {/* Controls on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => { if (videoRef.current) videoRef.current.muted = !muted; setMuted(m => !m); }} className="text-white p-1">
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button onClick={() => document.fullscreenElement ? document.exitFullscreen() : videoRef.current?.requestFullscreen()} className="text-white p-1">
            <Maximize2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────
export function LivePlayer({ streamKey, apiUrl }: LivePlayerProps) {
  const base = apiUrl ?? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

  const [info, setInfo]   = useState<StreamInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let destroyed = false;
    let timerId: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        const res = await fetch(`${base}/livestreams/${streamKey}/info`, { headers: tenantHeaders() });
        if (!res.ok) { setError("Transmisión no encontrada."); return; }
        const data: StreamInfo = await res.json();
        if (!destroyed) setInfo(data);
        // Keep polling while live so we get updated chunk counts
        if (!destroyed && data.status === "live") {
          timerId = setTimeout(load, 3000);
        }
      } catch {
        if (!destroyed) setError("Error al cargar la transmisión.");
      }
    };

    load();
    return () => { destroyed = true; clearTimeout(timerId); };
  }, [streamKey, base]);

  if (error) {
    return (
      <div className="flex items-center justify-center aspect-video bg-zinc-900 rounded-2xl text-white text-center p-8">
        <div>
          <WifiOff size={40} className="mx-auto mb-3 text-red-400" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex items-center justify-center aspect-video bg-zinc-900 rounded-2xl">
        <Loader2 size={28} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  // ── RECORDED: simple <video> with the /recording streaming endpoint ──
  if (info.status === "ended") {
    // El <video src> no puede llevar headers: el tenant viaja como query
    // param (?tenant=), que ResolveTenant también acepta.
    const slug = resolveTenantSlug();
    const src = `${base}/livestreams/${streamKey}/recording${slug ? `?tenant=${encodeURIComponent(slug)}` : ""}`;
    return <RecordingPlayer src={src} />;
  }

  // ── LIVE: MSE-based player ───────────────────────────────────────────
  if (info.status === "live") {
    return <LiveStreamPlayer streamKey={streamKey} base={base} info={info} />;
  }

  // ── IDLE ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center aspect-video bg-zinc-900 rounded-2xl">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
        <Wifi size={28} className="text-zinc-600" />
      </div>
      <p className="text-zinc-500 text-sm">Transmisión no iniciada</p>
    </div>
  );
}
