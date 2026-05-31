"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, Radio, Square, AlertCircle, Loader2, Users, Monitor, Smartphone, Tablet } from "lucide-react";

interface BroadcastStudioProps {
  streamKey: string;
  streamId: number;
  token: string;
  apiUrl?: string;
  onStatusChange?: (status: "live" | "ended") => void;
}

const CHUNK_TIMESLICE = 4000;

interface ViewerRecord {
  id: number;
  ip_address: string;
  device_type: string;
  watch_start: string;
  last_ping: string;
  total_seconds: number;
  is_online: boolean;
}

export function BroadcastStudio({ streamKey, streamId, token, apiUrl, onStatusChange }: BroadcastStudioProps) {
  const base = apiUrl ?? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

  const videoRef    = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const seqRef      = useRef(0);
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());

  const [status, setStatus]         = useState<"idle" | "live" | "ending">("idle");
  const [camOn, setCamOn]           = useState(true);
  const [micOn, setMicOn]           = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [viewers, setViewers]         = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);
  const [chunkCount, setChunkCount]   = useState(0);
  const [elapsed, setElapsed]         = useState(0);
  const [viewerHistory, setViewerHistory] = useState<{ time: string; count: number }[]>([]);
  const [viewerList, setViewerList]   = useState<ViewerRecord[]>([]);

  // ── Format elapsed time ───────────────────────────────────────────────
  useEffect(() => {
    if (status !== "live") { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  // ── Poll viewer count + list ──────────────────────────────────────────
  useEffect(() => {
    if (status !== "live") return;
    const poll = async () => {
      try {
        // Info (viewer count)
        const r1 = await fetch(`${base}/livestreams/${streamKey}/info`);
        if (r1.ok) {
          const d = await r1.json();
          const v = d.current_viewers ?? 0;
          setViewers(v);
          setPeakViewers(d.peak_viewers ?? 0);
          const now = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
          setViewerHistory(h => [...h.slice(-19), { time: now, count: v }]);
        }
        // Viewer list (admin only)
        const r2 = await fetch(`${base}/admin/livestreams/${streamId}/viewers`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (r2.ok) {
          const d2 = await r2.json();
          setViewerList(d2.viewers ?? []);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [status, base, streamKey, streamId, token]);

  // ── Upload a chunk ────────────────────────────────────────────────────
  const uploadChunk = useCallback((blob: Blob, seq: number) => {
    uploadQueue.current = uploadQueue.current.then(async () => {
      try {
        const fd = new FormData();
        fd.append("chunk", blob, `chunk_${seq}.webm`);
        fd.append("seq", String(seq));
        await fetch(`${base}/admin/livestreams/${streamKey}/chunk`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          body: fd,
        });
        setChunkCount(seq + 1);
      } catch {
        // Non-fatal: chunk may be lost but stream continues
      }
    });
  }, [base, streamKey, token]);

  // ── Start broadcasting ────────────────────────────────────────────────
  const startBroadcast = async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true,
      });
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.muted = true; // prevent echo
      }

      // Notify backend
      const res = await fetch(`${base}/admin/livestreams/${streamId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Error al iniciar en el servidor.");

      seqRef.current = 0;
      setChunkCount(0);

      // Pick best supported mime
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      const recorder = new MediaRecorder(mediaStream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          uploadChunk(e.data, seqRef.current++);
        }
      };

      recorder.start(CHUNK_TIMESLICE);
      setStatus("live");
      onStatusChange?.("live");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setError("Necesitas permitir acceso a cámara y micrófono.");
      } else {
        setError(msg);
      }
    }
  };

  // ── Stop broadcasting ─────────────────────────────────────────────────
  const stopBroadcast = async () => {
    setStatus("ending");
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());

    // Wait for upload queue to drain
    await uploadQueue.current;

    try {
      await fetch(`${base}/admin/livestreams/${streamId}/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    } catch {}

    setStatus("idle");
    onStatusChange?.("ended");
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // ── Toggle camera ─────────────────────────────────────────────────────
  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !camOn; });
    setCamOn(!camOn);
  };

  // ── Toggle mic ────────────────────────────────────────────────────────
  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(!micOn);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* ── Left: camera preview + controls ─────────────────────────── */}
      <div className="lg:col-span-2 bg-zinc-900 rounded-2xl overflow-hidden">
        {/* Preview */}
        <div className="relative aspect-video bg-zinc-950">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

          {status === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <CameraOff size={40} className="text-zinc-600 mb-2" />
              <p className="text-zinc-500 text-sm">Vista previa de cámara</p>
            </div>
          )}

          {status === "live" && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              EN VIVO · {formatTime(elapsed)}
            </div>
          )}

          {status === "live" && (
            <div className="absolute bottom-3 right-3 text-zinc-500 text-xs">
              {chunkCount} seg.
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={toggleCam}
            disabled={status === "idle"}
            className={`p-2.5 rounded-xl transition-colors ${camOn ? "bg-zinc-700 text-white hover:bg-zinc-600" : "bg-red-900/60 text-red-400"} disabled:opacity-40`}
            title={camOn ? "Apagar cámara" : "Encender cámara"}
          >
            {camOn ? <Camera size={18} /> : <CameraOff size={18} />}
          </button>
          <button
            onClick={toggleMic}
            disabled={status === "idle"}
            className={`p-2.5 rounded-xl transition-colors ${micOn ? "bg-zinc-700 text-white hover:bg-zinc-600" : "bg-red-900/60 text-red-400"} disabled:opacity-40`}
            title={micOn ? "Silenciar micrófono" : "Activar micrófono"}
          >
            {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>

          <div className="flex-1" />

          {status === "idle" && (
            <button onClick={startBroadcast} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
              <Radio size={16} />
              Iniciar transmisión
            </button>
          )}
          {status === "live" && (
            <button onClick={stopBroadcast} className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
              <Square size={16} className="fill-current" />
              Detener
            </button>
          )}
          {status === "ending" && (
            <button disabled className="flex items-center gap-2 bg-zinc-800 text-zinc-400 font-semibold px-5 py-2.5 rounded-xl cursor-not-allowed">
              <Loader2 size={16} className="animate-spin" />
              Finalizando...
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-950/60 text-red-300 text-sm border-t border-red-900/40">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* ── Right: viewers panel (solo visible al broadcaster) ──────── */}
      <div className="bg-zinc-900 rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-zinc-800">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Users size={15} className="text-zinc-400" />
            Espectadores
          </h3>
        </div>

        {status === "idle" ? (
          <p className="text-zinc-600 text-xs p-5">Inicia la transmisión para ver quién está viendo.</p>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800">
              <div className="px-4 py-3 text-center">
                <p className="text-2xl font-bold text-white tabular-nums">{viewers}</p>
                <p className="text-zinc-500 text-[10px] mt-0.5">ahora</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-2xl font-bold text-white tabular-nums">{peakViewers}</p>
                <p className="text-zinc-500 text-[10px] mt-0.5">pico</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-2xl font-bold text-white font-mono">{formatTime(elapsed)}</p>
                <p className="text-zinc-500 text-[10px] mt-0.5">duración</p>
              </div>
            </div>

            {/* Mini chart */}
            {viewerHistory.length > 1 && (
              <div className="px-5 py-3 border-b border-zinc-800">
                <div className="flex items-end gap-0.5 h-10">
                  {(() => {
                    const max = Math.max(...viewerHistory.map(h => h.count), 1);
                    return viewerHistory.map((h, i) => (
                      <div key={i} className="flex-1 bg-red-600/60 rounded-sm"
                        style={{ height: `${Math.max(8, (h.count / max) * 100)}%` }}
                        title={`${h.time}: ${h.count}`} />
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Viewer list */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
              {viewerList.length === 0 ? (
                <p className="text-zinc-600 text-xs p-4 text-center">Esperando espectadores...</p>
              ) : (
                viewerList.map(v => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                    {/* Device icon */}
                    <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                      v.is_online ? "bg-red-600/20" : "bg-zinc-800"
                    }`}>
                      {v.device_type === "mobile"
                        ? <Smartphone size={13} className={v.is_online ? "text-red-400" : "text-zinc-500"} />
                        : v.device_type === "tablet"
                        ? <Tablet size={13} className={v.is_online ? "text-red-400" : "text-zinc-500"} />
                        : <Monitor size={13} className={v.is_online ? "text-red-400" : "text-zinc-500"} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 font-mono truncate">
                        {v.ip_address ?? "—"}
                        {v.is_online && (
                          <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </p>
                      <p className="text-[10px] text-zinc-600 capitalize">{v.device_type}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-zinc-400 font-mono">
                        {Math.floor(v.total_seconds / 60)}m {v.total_seconds % 60}s
                      </p>
                      <p className="text-[10px] text-zinc-700">
                        {new Date(v.watch_start).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
