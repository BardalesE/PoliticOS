"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Users, Radio, Send, User, Pencil } from "lucide-react";
import { LivePlayer } from "@/components/live/LivePlayer";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// ── Avatar color based on name ────────────────────────────────────────────
const COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500",
  "bg-teal-500", "bg-blue-500", "bg-violet-500", "bg-pink-500",
  "bg-cyan-500", "bg-indigo-500",
];
function avatarColor(name: string) {
  const n = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return COLORS[n % COLORS.length];
}
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ── Types ─────────────────────────────────────────────────────────────────
interface Comment {
  id: number;
  viewer_name: string;
  message: string;
  created_at: string;
}
interface StreamInfo {
  id: number;
  title: string;
  description?: string;
  status: "idle" | "live" | "ended";
  chunk_count: number;
  current_viewers: number;
  peak_viewers: number;
  started_at: string | null;
  ended_at: string | null;
}
interface Candidate {
  name: string;
  title?: string;
  party?: string;
  photo_url?: string;
}

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" }) : "";

const dur = (start?: string | null, end?: string | null) => {
  if (!start) return null;
  const m = Math.floor((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 60000);
  if (m < 1) return "< 1 min";
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

// ── Page ──────────────────────────────────────────────────────────────────
export default function StreamViewerPage() {
  const params = useParams<{ key: string }>();
  const key    = params?.key ?? "";

  const [info, setInfo]         = useState<StreamInfo | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ── Chat ─────────────────────────────────────────────────────────────
  const [comments, setComments]     = useState<Comment[]>([]);
  const [message, setMessage]       = useState("");
  const [sending, setSending]       = useState(false);
  const [viewerName, setViewerName] = useState("");
  const [nameInput, setNameInput]   = useState("");
  const [editingName, setEditingName] = useState(false);
  const lastIdRef  = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Load saved name
  useEffect(() => {
    const saved = localStorage.getItem("live_viewer_name");
    if (saved) setViewerName(saved);
  }, []);

  // Auto-scroll on new comments
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // Candidate profile
  useEffect(() => {
    fetch(`${API}/candidate`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCandidate(d))
      .catch(() => {});
  }, []);

  // Stream info polling
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/livestreams/${key}/info`);
        if (!res.ok) { setNotFound(true); return; }
        setInfo(await res.json());
      } catch { setNotFound(true); }
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [key]);

  // Comments polling
  useEffect(() => {
    if (!key) return;
    const poll = async () => {
      try {
        const since = lastIdRef.current;
        const res   = await fetch(`${API}/livestreams/${key}/comments${since ? `?since=${since}` : ""}`);
        if (!res.ok) return;
        const data: Comment[] = await res.json();
        if (!data.length) return;
        if (since === 0) {
          setComments(data);
        } else {
          setComments(prev => [...prev, ...data]);
        }
        lastIdRef.current = data[data.length - 1].id;
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [key]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const saveName = () => {
    const n = nameInput.trim();
    if (!n) return;
    setViewerName(n);
    localStorage.setItem("live_viewer_name", n);
    setEditingName(false);
    setNameInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const sendComment = async () => {
    if (!message.trim() || !viewerName || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/livestreams/${key}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewer_name: viewerName, message: message.trim() }),
      });
      if (res.ok) setMessage("");
    } catch {} finally { setSending(false); }
  };

  // ── Not found ─────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-center px-6">
        <div>
          <Radio size={44} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-700 font-semibold">Transmisión no encontrada</p>
          <Link href="/en-vivo" className="text-red-600 hover:text-red-700 text-sm mt-3 inline-block">
            ← Volver a En Vivo
          </Link>
        </div>
      </div>
    );
  }

  const isLive  = info?.status === "live";
  const isEnded = info?.status === "ended";

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">

      {/* Top nav */}
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/en-vivo" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm transition-colors">
            <ArrowLeft size={15} />
            En vivo
          </Link>
          {isLive && (
            <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              EN VIVO
            </span>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="max-w-6xl mx-auto px-4 py-5 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">

        {/* ── Player + info ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4 mb-5 lg:mb-0">
          <LivePlayer streamKey={key} apiUrl={API} />

          {info && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              {/* Title */}
              <div>
                <h1 className="text-xl font-bold text-gray-900 leading-snug">{info.title}</h1>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500">
                  {info.started_at && (
                    <span className="flex items-center gap-1.5">
                      <Clock size={11} />
                      {fmt(info.started_at)}
                      {dur(info.started_at, info.ended_at) && <span>· {dur(info.started_at, info.ended_at)}</span>}
                    </span>
                  )}
                  {isLive && (
                    <span className="flex items-center gap-1.5 text-red-600 font-semibold">
                      <Users size={11} />
                      {info.current_viewers.toLocaleString()} viendo ahora
                    </span>
                  )}
                  {isEnded && info.peak_viewers > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Users size={11} />
                      {info.peak_viewers.toLocaleString()} espectadores máx.
                    </span>
                  )}
                </div>
              </div>

              {/* Broadcaster */}
              <div className="flex items-center gap-3 py-3 border-t border-b border-gray-100">
                <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center ring-2 ring-red-500/20">
                  {candidate?.photo_url
                    ? <img src={candidate.photo_url} alt={candidate.name} className="w-full h-full object-cover" />
                    : <Radio size={16} className="text-red-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{candidate?.name ?? "Candidato"}</p>
                  <p className="text-gray-500 text-xs truncate">{candidate?.title ?? candidate?.party ?? "Transmisión"}</p>
                </div>
                {isLive && (
                  <span className="shrink-0 flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-bold px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    EN VIVO
                  </span>
                )}
                {isEnded && (
                  <span className="shrink-0 text-gray-400 text-xs bg-gray-100 px-3 py-1.5 rounded-full">Grabación</span>
                )}
              </div>

              {info.description && (
                <p className="text-gray-600 text-sm leading-relaxed">{info.description}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Chat panel ────────────────────────────────────────── */}
        <div
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col lg:sticky lg:top-5"
          style={{ height: "clamp(480px, calc(100vh - 90px), 800px)" }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-sm text-gray-900">Chat en vivo</h3>
            {isLive && info && info.current_viewers > 0 && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Users size={11} />
                {info.current_viewers}
              </span>
            )}
          </div>

          {/* ── Name join form ── */}
          {(!viewerName || editingName) && (
            <div className="px-4 py-4 bg-red-50 border-b border-red-100 shrink-0">
              <p className="text-xs font-semibold text-red-700 mb-0.5 flex items-center gap-1.5">
                <User size={12} />
                {editingName ? "Cambiar nombre" : "¿Cómo te llamas?"}
              </p>
              <p className="text-[11px] text-red-500/80 mb-3">
                {editingName ? "Tu nuevo nombre aparecerá en los próximos comentarios." : "Ingresa tu nombre para participar en el chat."}
              </p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveName()}
                  placeholder="Tu nombre..."
                  maxLength={50}
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-red-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <button
                  onClick={saveName}
                  disabled={!nameInput.trim()}
                  className="px-3 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {editingName ? "Guardar" : "Unirse"}
                </button>
                {editingName && (
                  <button
                    onClick={() => { setEditingName(false); setNameInput(""); }}
                    className="px-3 py-2 text-gray-400 hover:text-gray-700 text-xs rounded-lg border border-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">
            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <Radio size={28} className="text-gray-200" />
                <p className="text-gray-400 text-xs">Sé el primero en comentar</p>
              </div>
            ) : (
              comments.map(c => (
                <div key={c.id} className="flex gap-2.5">
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(c.viewer_name)}`}>
                    {c.viewer_name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-gray-800">{c.viewer_name}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 break-words leading-snug mt-0.5">{c.message}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="px-4 py-3 border-t border-gray-100 shrink-0">
            {viewerName && !editingName ? (
              <div className="space-y-2">
                {/* Who am I */}
                <div className="flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${avatarColor(viewerName)}`}>
                    {viewerName[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-gray-600 truncate">{viewerName}</span>
                  <button
                    onClick={() => { setEditingName(true); setNameInput(viewerName); }}
                    className="ml-auto text-gray-300 hover:text-gray-600 transition-colors"
                    title="Cambiar nombre"
                  >
                    <Pencil size={11} />
                  </button>
                </div>
                {/* Input */}
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                    placeholder="Escribe un comentario..."
                    maxLength={300}
                    className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white transition-colors"
                  />
                  <button
                    onClick={sendComment}
                    disabled={!message.trim() || sending}
                    className="p-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            ) : !editingName ? (
              /* No name yet — prompt */
              <button
                onClick={() => { setEditingName(false); /* force show form */ setViewerName(""); }}
                className="w-full text-sm py-2.5 border border-gray-200 rounded-xl text-gray-500 hover:border-red-300 hover:text-red-600 transition-colors"
              >
                Únete para comentar →
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
