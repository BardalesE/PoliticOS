"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { TenantLink } from "@/components/ui/TenantLink";
import { ArrowLeft, Clock, Users, Radio, Send, User, Pencil } from "lucide-react";
import { LivePlayer } from "@/components/live/LivePlayer";
import { LiveBadge } from "@/components/live/LiveBadge";
import { tenantHeaders } from "@/lib/api";

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
    fetch(`${API}/candidate`, { headers: tenantHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCandidate(d))
      .catch(() => {});
  }, []);

  // Stream info polling
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/livestreams/${key}/info`, { headers: tenantHeaders() });
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
        const res   = await fetch(`${API}/livestreams/${key}/comments${since ? `?since=${since}` : ""}`, { headers: tenantHeaders() });
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
        headers: { "Content-Type": "application/json", ...tenantHeaders() },
        body: JSON.stringify({ viewer_name: viewerName, message: message.trim() }),
      });
      if (res.ok) setMessage("");
    } catch {} finally { setSending(false); }
  };

  // ── Not found ─────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6" style={{ background: "var(--page-bg)" }}>
        <div>
          <Radio size={44} className="mx-auto mb-4 text-ink-300" />
          <p className="text-ink-700 font-semibold">Transmisión no encontrada</p>
          <TenantLink href="/en-vivo" className="text-brand-600 hover:text-brand-700 text-sm mt-3 inline-block">
            ← Volver a En Vivo
          </TenantLink>
        </div>
      </div>
    );
  }

  const isLive  = info?.status === "live";
  const isEnded = info?.status === "ended";

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-ink-900" style={{ background: "var(--page-bg)" }}>

      {/* Top nav */}
      <div className="bg-white px-6 py-3" style={{ borderBottom: "1px solid var(--page-line)" }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <TenantLink href="/en-vivo" className="flex items-center gap-1.5 text-ink-500 hover:text-ink-900 text-sm transition-colors">
            <ArrowLeft size={15} />
            En vivo
          </TenantLink>
          {isLive && <LiveBadge className="ml-2" />}
        </div>
      </div>

      {/* Main grid */}
      <div className="max-w-6xl mx-auto px-4 py-5 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">

        {/* ── Player + info ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4 mb-5 lg:mb-0">
          <LivePlayer streamKey={key} apiUrl={API} />

          {info && (
            <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--page-line)" }}>
              {/* Title */}
              <div>
                <h1 className="font-serif text-xl font-bold text-ink-900 leading-snug">{info.title}</h1>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-ink-500">
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
              <div className="flex items-center gap-3 py-3 border-t border-b border-ink-100">
                <div className="relative shrink-0 w-10 h-10 rounded-full overflow-hidden bg-ink-100 flex items-center justify-center ring-2 ring-brand-500/20">
                  {candidate?.photo_url
                    ? <Image src={candidate.photo_url} alt={candidate.name} fill sizes="40px" className="object-cover" />
                    : <Radio size={16} className="text-brand-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-ink-900 truncate">{candidate?.name ?? "Candidato"}</p>
                  <p className="text-ink-500 text-xs truncate">{candidate?.title ?? candidate?.party ?? "Transmisión"}</p>
                </div>
                {isLive && <LiveBadge variant="soft" className="shrink-0 px-3 py-1.5" />}
                {isEnded && (
                  <span className="shrink-0 text-ink-400 text-xs bg-ink-100 px-3 py-1.5 rounded-full">Grabación</span>
                )}
              </div>

              {info.description && (
                <p className="text-ink-600 text-sm leading-relaxed">{info.description}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Chat panel ────────────────────────────────────────── */}
        <div
          className="bg-white rounded-2xl overflow-hidden flex flex-col lg:sticky lg:top-5"
          style={{ height: "clamp(480px, calc(100vh - 90px), 800px)", border: "1px solid var(--page-line)" }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-sm text-ink-900">Chat en vivo</h3>
            {isLive && info && info.current_viewers > 0 && (
              <span className="flex items-center gap-1 text-xs text-ink-400">
                <Users size={11} />
                {info.current_viewers}
              </span>
            )}
          </div>

          {/* ── Name join form ── */}
          {(!viewerName || editingName) && (
            <div className="px-4 py-4 bg-brand-50 border-b border-brand-100 shrink-0">
              <p className="text-xs font-semibold text-brand-700 mb-0.5 flex items-center gap-1.5">
                <User size={12} />
                {editingName ? "Cambiar nombre" : "¿Cómo te llamas?"}
              </p>
              <p className="text-[11px] text-brand-600/80 mb-3">
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
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-brand-200 bg-white text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <button
                  onClick={saveName}
                  disabled={!nameInput.trim()}
                  className="px-3 py-2 bg-brand-500 text-white text-xs font-bold rounded-lg hover:bg-brand-600 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {editingName ? "Guardar" : "Unirse"}
                </button>
                {editingName && (
                  <button
                    onClick={() => { setEditingName(false); setNameInput(""); }}
                    className="px-3 py-2 text-ink-400 hover:text-ink-700 text-xs rounded-lg border border-ink-200 transition-colors"
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
                <Radio size={28} className="text-ink-200" />
                <p className="text-ink-400 text-xs">Sé el primero en comentar</p>
              </div>
            ) : (
              comments.map(c => (
                <div key={c.id} className="flex gap-2.5">
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(c.viewer_name)}`}>
                    {c.viewer_name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-ink-800">{c.viewer_name}</span>
                      <span className="text-[10px] text-ink-400 shrink-0">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-ink-700 break-words leading-snug mt-0.5">{c.message}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="px-4 py-3 border-t border-ink-100 shrink-0">
            {viewerName && !editingName ? (
              <div className="space-y-2">
                {/* Who am I */}
                <div className="flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${avatarColor(viewerName)}`}>
                    {viewerName[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-ink-600 truncate">{viewerName}</span>
                  <button
                    onClick={() => { setEditingName(true); setNameInput(viewerName); }}
                    className="ml-auto text-ink-300 hover:text-ink-600 transition-colors"
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
                    className="flex-1 text-sm px-3 py-2 rounded-xl border border-ink-200 bg-ink-100/50 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:bg-white transition-colors"
                  />
                  <button
                    onClick={sendComment}
                    disabled={!message.trim() || sending}
                    className="p-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            ) : !editingName ? (
              /* No name yet — prompt */
              <button
                onClick={() => { setEditingName(false); /* force show form */ setViewerName(""); }}
                className="w-full text-sm py-2.5 border border-ink-200 rounded-xl text-ink-500 hover:border-brand-300 hover:text-brand-600 transition-colors"
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
