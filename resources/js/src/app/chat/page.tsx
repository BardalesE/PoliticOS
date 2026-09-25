"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Play, Link as LinkIcon, X, ImageIcon, ShieldAlert, AlertTriangle, Mic, Square, Send, MapPin, Lock, Clock, MessagesSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ConsentModal from "@/components/chat/ConsentModal";
import AIBadge from "@/components/chat/AIBadge";
import { LiveAlert } from "@/components/live/LiveAlert";
import { useCandidate } from "@/context/CandidateContext";
import { resolveTenantSlug, normalizeApiBase, tenantHeaders } from "@/lib/api";
import { tenantStorageKey } from "@/lib/utils";
import { getVisitorId, getZona, setZona as saveZona, votarApoyo, type SegmentacionEstado, type ZonaInfo, type ZonaSeleccion } from "@/lib/segmentacion";
import { DIRECTORY_TENANT, prettyPlace, type Ubicaciones } from "@/lib/directorio";
import { SupportPoll, ZoneBadge, ZonePicker } from "@/components/chat/ZonaYApoyo";
import { TenantLink } from "@/components/ui/TenantLink";
import ContactVerifyField from "@/components/ContactVerifyField";
import { getVerificationConfig, type VerificationConfig } from "@/lib/verification";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MediaItem {
  type: string;
  url: string;
  title: string;
  thumbnail?: string;
}

/** Candidato del directorio que el ciudadano puede elegir para acotar el chat. */
interface ChatCandidate {
  slug: string;
  name: string;
  party?: string | null;
  distrito?: { id: number } | null;
}

interface QuickReply {
  label: string;
  value: string;
}

/**
 * Cita verificable de una respuesta: el fragmento EXACTO (y la página) del
 * documento que el servidor le dio a la IA. El texto viene del PDF, no de la IA.
 */
interface Citation {
  id: string;            // "S1"
  title: string;
  page: number | null;   // página del visor de PDF (1 = primera hoja)
  excerpt: string;
  url: string | null;
}

/** Tope de mensajes de la conversación (lo calcula y aplica el servidor). */
interface Quota {
  base: number;                 // mensajes por conversación (10–50, lo fija la plataforma)
  bonus: number;                // mensajes extra que gana al dejar sus datos (10–100)
  max: number;                  // tope de esta conversación (base, o base+bonus si ya dejó sus datos)
  used: number;
  remaining: number;
  registered: boolean;
  blocked: "session" | "daily" | "network" | null;
  can_unlock: boolean;          // puede dejar sus datos para ganar `bonus` mensajes más
  can_new_session: boolean;     // aún le queda margen diario para otra conversación
  resets_at: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  pending?: boolean;
  media?: MediaItem[];
  quickReplies?: QuickReply[];
  sources?: string[]; // fuentes citadas (modo PEPA)
  citations?: Citation[]; // fragmentos verificables [S1]… con su página
}

interface WelcomeBack {
  name: string;
  points: number | null;
  savedAt: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

const LS_HISTORY        = "politicos_chat_history";   // legado (antes de hilos por candidato): se borra al entrar
const LS_SAVED_AT       = "politicos_chat_saved_at";  // legado
const LS_SESSION        = "politicos_session_id";     // legado
const LS_THREADS        = "politicos_chat_threads_v1";
const LS_REG_DONE       = "politicos_reg_done";
const LS_CANDIDATE      = "politicos_chat_candidate";
const LS_CITIZEN_NAME   = "politicos_citizen_name";
const LS_CITIZEN_POINTS = "politicos_citizen_points";

// La invitación a la rifa (registro conversacional al abrir el chat) está apagada:
// se reactivará más adelante con otro nombre. Mientras, el chat abre con la
// presentación del asistente y el registro solo aparece al agotar los mensajes.
const RAFFLE_ENABLED = false;

// ── Hilos por candidato (decisión 2026-09-24) ──────────────────────────────────
// Cada candidato tiene su propia conversación (y su propia sesión en el servidor).
// El historial vive SOLO en este navegador y se cierra 1 hora después de la
// primera pregunta: pasado ese tiempo se borra y no se puede recuperar.
const THREAD_TTL_MS   = 60 * 60 * 1000;
const GENERAL_THREAD  = "__general";

interface Thread {
  key: string;               // slug del candidato o GENERAL_THREAD
  name: string;
  sessionId: string | null;
  messages: ChatMessage[];
  startedAt: number;         // primera pregunta: desde aquí corre la hora
}

const isAlive = (t: Thread, now = Date.now()) => now - t.startedAt < THREAD_TTL_MS;

function loadThreads(): Record<string, Thread> {
  try {
    const raw = localStorage.getItem(tenantStorageKey(LS_THREADS));
    const all = raw ? (JSON.parse(raw) as Record<string, Thread>) : {};
    return Object.fromEntries(Object.entries(all).filter(([, t]) => t && isAlive(t)));
  } catch {
    return {};
  }
}

function minutesLeft(t: Thread, now: number): number {
  return Math.max(1, Math.ceil((t.startedAt + THREAD_TTL_MS - now) / 60_000));
}

// Primer mensaje al entrar al bot de la plataforma.
const MANIFESTO =
  "🌱 **El ser humano es la obra más importante, y el medio ambiente es el lugar donde vivimos.** Es nuestro deber cuidarlo.";

// Fases del flujo de registro conversacional
type RegPhase =
  | "offered"     // esperando que el usuario acepte/decline la rifa
  | "name"        // esperando nombre
  | "dni"         // esperando DNI
  | "phone"       // esperando WhatsApp
  | "email"       // esperando correo
  | "registering" // POST /api/citizen/register en progreso
  | "done";       // chat desbloqueado

interface RegData { name: string; dni: string; phone: string; email: string; }

// Detecta si el usuario acepta la rifa
function acceptedRaffle(text: string): boolean {
  const t = text.toLowerCase().trim();
  return ["sí","si","s","yes","claro","dale","ok","quiero","acepto","de una","ya","seguro","obvio","participar","cuenta conmigo"].some(w => t.includes(w));
}

// Validaciones
const isDniValid   = (v: string) => /^\d{8}$/.test(v.trim());
const isSkipWord   = (v: string) => ["omitir","omit","skip","no","no tengo","paso"].includes(v.toLowerCase().trim());

const THINKING_STEPS = [
  "Analizando tu pregunta",
  "Extrayendo datos relevantes",
  "Consultando propuestas",
  "Procesando información",
  "Preparando respuesta",
];

function formatSavedDate(ts: number): string {
  if (!ts) return "fecha desconocida";
  return new Date(ts).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Micrófono (Web Speech API) ────────────────────────────────────────────────
// Sin tipos oficiales en el lib de TS del proyecto — se define el mínimo acá en
// vez de instalar una dependencia solo para esto. Soporte real: Chrome/Edge/
// Safari (prefijo webkit). Firefox no la implementa — feature detection oculta
// el botón ahí en vez de mostrar uno roto.
interface MinimalSpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface MinimalSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: MinimalSpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => MinimalSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// ─── Modal de alerta por mensaje ininteligible ────────────────────────────────

function NonsenseAlert({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm bg-zinc-950 border border-red-500/60 rounded-2xl shadow-2xl shadow-red-900/40 overflow-hidden"
        >
          <div className="h-1 bg-red-600 animate-pulse" />
          <div className="px-6 py-6 flex flex-col items-center text-center gap-4">
            <motion.div
              animate={{ rotate: [0, -8, 8, -8, 8, 0] }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="h-16 w-16 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center"
            >
              <ShieldAlert size={32} className="text-red-500" />
            </motion.div>
            <div>
              <p className="text-red-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">
                Sistema de monitoreo activo
              </p>
              <h2 className="text-white text-lg font-bold mb-2">Mensaje inusual detectado</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Se registró un mensaje con caracteres ininteligibles. Esta actividad queda registrada junto a tu dirección IP para revisión.
              </p>
            </div>
            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
              <p className="text-zinc-400 text-xs text-left">
                Los mensajes spam o maliciosos pueden resultar en bloqueo permanente.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold text-sm py-3 rounded-xl transition-colors"
            >
              Entendido, continuaré correctamente
            </button>
            <p className="text-zinc-600 text-[10px]">Este modal se cerrará automáticamente en unos segundos.</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Animación de carga ───────────────────────────────────────────────────────

function ThinkingAnimation() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % THINKING_STEPS.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <span className="text-xs text-gray-400 italic">{THINKING_STEPS[step]}...</span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
  return m ? m[1] : null;
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

// ─── Badge / preview de media ─────────────────────────────────────────────────

function MediaBadge({ item }: { item: MediaItem }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  if (item.type === "image") {
    return (
      <>
        <button
          onClick={() => setPreviewOpen(true)}
          className="w-full text-left rounded-xl overflow-hidden border border-gray-200 hover:border-gray-300 transition-colors group"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.title}
            className="w-full max-h-52 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
          />
          <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
            <ImageIcon size={12} className="text-gray-400 shrink-0" />
            <p className="text-xs text-gray-400 truncate flex-1">{item.title}</p>
            <span className="text-[10px] text-gray-400 shrink-0">Ver imagen</span>
          </div>
        </button>
        <AnimatePresence>
          {previewOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="relative flex flex-col items-center max-w-3xl w-full"
              >
                <button onClick={() => setPreviewOpen(false)} className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 text-white hover:bg-white/30">
                  <X size={16} />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.title} className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
                {item.title && <p className="text-white/80 text-sm mt-3 text-center">{item.title}</p>}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  if (item.type === "pdf") {
    return (
      <>
        <button
          onClick={() => setPreviewOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors text-left group"
        >
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <FileText size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-900 truncate max-w-[180px]">{item.title}</p>
            <p className="text-[10px] text-blue-500 font-medium">Documento PDF · Toca para ver</p>
          </div>
        </button>
        <AnimatePresence>
          {previewOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate max-w-[75%]">{item.title}</p>
                  <button onClick={() => setPreviewOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X size={16} /></button>
                </div>
                <iframe src={item.url} title={item.title} className="flex-1 w-full" style={{ minHeight: "70vh" }} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  if (item.type === "video") {
    const youtubeId = getYoutubeId(item.url);
    const embedUrl  = youtubeId ? `https://www.youtube.com/embed/${youtubeId}?autoplay=1` : null;
    const thumbUrl  = item.thumbnail || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null);

    return (
      <>
        <button
          onClick={() => setPreviewOpen(true)}
          className="w-full text-left rounded-xl overflow-hidden border border-gray-200 hover:border-red-300 transition-colors group"
        >
          <div className="relative">
            {thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbUrl} alt={item.title} className="w-full h-36 object-cover" />
            ) : (
              <div className="w-full h-36 bg-gradient-to-br from-red-900 to-red-700 flex items-center justify-center">
                <Play size={32} className="text-white/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play size={18} className="text-red-600 fill-red-600 ml-0.5" />
              </div>
            </div>
          </div>
          <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-red-600 flex items-center justify-center shrink-0">
              <Play size={8} className="text-white fill-white ml-px" />
            </div>
            <p className="text-xs font-medium text-gray-800 truncate flex-1">{item.title}</p>
            <span className="text-[10px] text-gray-400 shrink-0">Reproducir</span>
          </div>
        </button>
        <AnimatePresence>
          {previewOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-3xl"
              >
                <button onClick={() => setPreviewOpen(false)} className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 text-white hover:bg-white/30">
                  <X size={16} />
                </button>
                <div className="bg-black rounded-2xl overflow-hidden shadow-2xl">
                  <p className="text-white text-sm font-medium px-4 py-3 border-b border-white/10 truncate">{item.title}</p>
                  {embedUrl ? (
                    <div className="relative" style={{ paddingTop: "56.25%" }}>
                      <iframe
                        src={embedUrl} title={item.title}
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-white/60 text-sm mb-4">No se puede reproducir aquí directamente.</p>
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-500 transition-colors">
                        <Play size={14} className="fill-white" /> Ver video
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl hover:bg-gray-200 transition-colors">
      <LinkIcon size={14} className="text-gray-500 shrink-0" />
      <p className="text-xs text-gray-600 truncate max-w-[200px]">{item.title}</p>
    </a>
  );
}

// ─── Botones de respuesta rápida ──────────────────────────────────────────────

function QuickReplyButtons({ replies, onSelect }: { replies: QuickReply[]; onSelect: (val: string) => void }) {
  const filtered = replies.filter((r) => r.value);
  if (!filtered.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {filtered.map((r, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          onClick={() => onSelect(r.value)}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-full text-xs font-medium text-gray-600 transition-colors shadow-sm"
        >
          {r.label}
        </motion.button>
      ))}
    </div>
  );
}

// ─── Chip de fuente citada (modo PEPA) ────────────────────────────────────────

// ─── Citas verificables [S1] → chips con página ───────────────────────────────

/** [S1] o [S1, S2] — el mismo formato que valida el backend. */
const CITATION_GROUP_RE = /\[\s*(S\d+(?:\s*[,;]\s*S\d+)*)\s*\]/g;

/**
 * Convierte las etiquetas [S1] del texto en enlaces internos `#cite-S1` que
 * ReactMarkdown pinta como chips. Las etiquetas sin cita real (inventadas por el
 * modelo) se quitan, y también una etiqueta a medio escribir al final del stream.
 */
function linkifyCitations(text: string, citations: Citation[] | undefined): string {
  const known = new Set((citations ?? []).map((c) => c.id));
  return text
    .replace(CITATION_GROUP_RE, (_m, group: string) =>
      (group.match(/S\d+/g) ?? [])
        .filter((id) => known.has(id))
        .map((id) => `[${id}](#cite-${id})`)
        .join(" ")
    )
    .replace(/\[\s*S?[\d,;\sS]*$/, "");
}

/** Enlace al PDF abierto en la página citada (el visor del navegador entiende #page=N). */
function citationHref(c: Citation): string | null {
  if (!c.url) return null;
  return c.page ? `${c.url.split("#")[0]}#page=${c.page}` : c.url;
}

function citationLabel(c: Citation): string {
  return c.page ? `${c.id} · pág. ${c.page}` : c.id;
}

function CitationChip({ c, active, onClick }: { c: Citation; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      title={`${c.title}${c.page ? ` — pág. ${c.page}` : ""}`}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
        active
          ? "border-chat-600 bg-chat-600 text-white"
          : "border-chat-400 bg-chat-50 text-chat-700 hover:bg-chat-400/25"
      }`}
    >
      {citationLabel(c)}
    </button>
  );
}

/** Panel con el texto tal como aparece en el documento, para compararlo con el PDF. */
function CitationPanel({ c, onClose }: { c: Citation; onClose: () => void }) {
  const href = citationHref(c);
  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3" role="region" aria-label={`Fuente ${c.id}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold text-gray-700">
          {c.title}
          {c.page ? <span className="text-gray-500"> · página {c.page}</span> : null}
        </p>
        <button type="button" onClick={onClose} aria-label="Cerrar fuente" className="shrink-0 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
        Texto del documento
      </p>
      <blockquote className="mt-1 border-l-2 border-chat-400 pl-3 text-[13px] leading-relaxed text-gray-700">
        …{c.excerpt}…
      </blockquote>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-chat-700 hover:underline"
        >
          <FileText size={13} />
          {c.page ? `Abrir el PDF en la página ${c.page}` : "Abrir el documento"}
        </a>
      )}
      <p className="mt-2 text-[10px] text-gray-400">
        Este es el fragmento que recibió la IA. Compáralo con el PDF para comprobarlo.
      </p>
    </div>
  );
}

function SourceChip({ url }: { url: string }) {
  let label = url;
  try {
    label = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-700 font-medium hover:bg-indigo-100 transition-colors max-w-[200px]"
    >
      <span className="w-1 h-1 bg-indigo-400 rounded-full shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  );
}

// ─── Banner de sesión bloqueada ───────────────────────────────────────────────

function BlockedBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium"
    >
      <Lock size={13} className="shrink-0" />
      <span>Sesión bloqueada — escribe <strong>hola</strong>, <strong>menú</strong> o <strong>inicio</strong> para continuar</span>
    </motion.div>
  );
}

// ─── Mensajes agotados ────────────────────────────────────────────────────────

/**
 * Reemplaza al cuadro de texto cuando el servidor cortó la conversación. Ofrece
 * (1) dejar los datos para ganar otro bloque de mensajes y (2) empezar una
 * conversación nueva; la nueva cuenta contra el tope diario, no reinicia nada.
 */
function QuotaWall({
  quota, busy, error, onUnlock, onNewChat,
}: {
  quota: Quota;
  busy: boolean;
  error: string | null;
  onUnlock: (f: { name: string; phone: string; email: string }) => void;
  onNewChat: () => void;
}) {
  const [name, setName]       = useState("");
  const [phone, setPhone]     = useState("");
  const [email, setEmail]     = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [vcfg, setVcfg]       = useState<VerificationConfig | null>(null);
  const [agree, setAgree]     = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Qué canales se verifican hoy (correo siempre que haya mail; WhatsApp cuando Meta esté listo).
  useEffect(() => {
    if (showForm && !vcfg) getVerificationConfig().then(setVcfg);
  }, [showForm, vcfg]);

  const resets = quota.resets_at
    ? new Date(quota.resets_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
    : null;
  const needEmail = !!vcfg?.channels.email;
  const needPhone = !!vcfg?.channels.whatsapp;
  const contactOk = (needEmail || needPhone)
    ? (!needEmail || verifiedEmail === email.trim()) && (!needPhone || verifiedPhone === phone.trim())
    : (phone.trim().length >= 6 || email.includes("@"));
  const canSubmit = name.trim().length > 1 && !!vcfg && contactOk && agree && !busy;

  return (
    <div className="max-w-3xl mx-auto rounded-2xl border border-chat-400 bg-chat-50 p-4">
      <p className="text-sm font-bold text-gray-800">⏳ Mensajes agotados</p>

      {quota.blocked === "session" && (
        <p className="text-xs text-gray-600 mt-1">
          Usaste los {quota.max} mensajes de esta conversación.
          {quota.can_unlock ? ` Regístrate y te damos ${quota.bonus} mensajes más.` : ""}
        </p>
      )}
      {quota.blocked === "daily" && (
        <p className="text-xs text-gray-600 mt-1">
          Alcanzaste el límite diario de mensajes.{resets ? ` Podrás seguir hoy a las ${resets}.` : " Vuelve mañana."}
        </p>
      )}
      {quota.blocked === "network" && (
        <p className="text-xs text-gray-600 mt-1">
          Se alcanzó el límite de mensajes desde tu red por hoy.{resets ? ` Se libera a las ${resets}.` : " Intenta más tarde."}
        </p>
      )}

      {quota.can_unlock && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mt-3 w-full bg-chat-500 text-white text-sm font-medium py-2.5 rounded-full hover:bg-chat-600 transition"
        >
          Registrarme y conseguir {quota.bonus} mensajes más
        </button>
      )}

      {quota.can_unlock && showForm && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) onUnlock({ name: name.trim(), phone: phone.trim(), email: email.trim() }); }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre"
            autoComplete="name" required
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-chat-500" />
          <ContactVerifyField
            channel="whatsapp" value={phone} onChange={setPhone}
            verifiedValue={verifiedPhone} onVerified={setVerifiedPhone}
            placeholder="Tu WhatsApp (ej. 987654321)" verificationEnabled={needPhone}
          />
          <ContactVerifyField
            channel="email" value={email} onChange={setEmail}
            verifiedValue={verifiedEmail} onVerified={setVerifiedEmail}
            placeholder={needEmail ? "Tu correo" : "Tu correo (opcional si diste WhatsApp)"} verificationEnabled={needEmail}
          />
          <label className="flex items-start gap-2 text-[11px] text-gray-500">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            Acepto que usen mis datos para contactarme y mejorar las propuestas para mi zona.
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={!canSubmit}
            className="w-full bg-chat-500 text-white text-sm font-medium py-2.5 rounded-full hover:bg-chat-600 disabled:opacity-40 transition">
            {busy ? "Guardando…" : !vcfg ? "Cargando…" : `Desbloquear ${quota.bonus} mensajes`}
          </button>
        </form>
      )}

      {quota.can_new_session && (
        <button
          onClick={onNewChat}
          className="mt-2 w-full border border-gray-300 text-gray-600 text-sm font-medium py-2.5 rounded-full hover:bg-white transition"
        >
          Iniciar nueva conversación
        </button>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

// ─── Preguntas sugeridas (tipo Voto Informado) ────────────────────────────────
// Las mismas para TODOS los candidatos: neutralidad. Rotan cada 4 s en grupos de 3
// y se pausan mientras el ciudadano pasa el mouse o toca el bloque.

const SUGERENCIAS: QuickReply[] = [
  { label: "📋 Hoja de vida",          value: "Muéstrame su hoja de vida: estudios, experiencia y trayectoria política" },
  { label: "🌾 Agricultura",           value: "¿Qué propone para la agricultura y los productores?" },
  { label: "🏥 Salud",                 value: "¿Cómo trabajará en salud?" },
  { label: "📚 Educación",             value: "¿Qué propone para la educación?" },
  { label: "💧 Agua y desagüe",        value: "¿Qué hará con el agua potable y el desagüe?" },
  { label: "🛡️ Seguridad",             value: "¿Qué propone en seguridad ciudadana?" },
  { label: "🛣️ Vías y transporte",     value: "¿Qué propone para carreteras, trochas y transporte?" },
  { label: "♻️ Medio ambiente",        value: "¿Qué propone para el medio ambiente y la basura?" },
  { label: "💼 Empleo",                value: "¿Qué propone para generar empleo?" },
  { label: "🎓 Estudios",              value: "¿Qué estudios tiene?" },
  { label: "⚖️ Sentencias declaradas", value: "¿Declaró alguna sentencia en su hoja de vida?" },
  { label: "🏛️ Trayectoria política",  value: "¿Qué cargos políticos o partidarios ha tenido?" },
];
const SUG_POR_VEZ = 3;
const SUG_MS      = 4000;

function SuggestionCarousel({ name, disabled, onPick }: { name: string; disabled: boolean; onPick: (value: string) => void }) {
  const [page, setPage]     = useState(0);
  const [paused, setPaused] = useState(false);
  const pages = Math.ceil(SUGERENCIAS.length / SUG_POR_VEZ);

  useEffect(() => {
    if (paused || disabled) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), SUG_MS);
    return () => clearInterval(id);
  }, [paused, disabled, pages]);

  const visibles = SUGERENCIAS.slice(page * SUG_POR_VEZ, page * SUG_POR_VEZ + SUG_POR_VEZ);

  return (
    <div
      className="mb-3 ml-10 max-w-[85%]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => { setPaused(true); setTimeout(() => setPaused(false), 8000); }}
    >
      <p className="mb-1.5 text-xs text-gray-500">
        ¿Qué quieres saber de <span className="font-semibold text-gray-700">{name}</span>? Toca una opción:
      </p>
      <div className="flex min-h-[36px] flex-wrap gap-1.5" aria-live="off">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="flex flex-wrap gap-1.5"
          >
            {visibles.map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={disabled}
                onClick={() => onPick(s.value)}
                className="rounded-full border border-brand-600/30 bg-white px-3 py-1.5 text-xs font-semibold text-brand-600 shadow-sm transition-colors hover:bg-brand-50 disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-1.5 flex items-center gap-1" aria-hidden>
        {Array.from({ length: pages }, (_, i) => (
          <span key={i} className={`h-1 rounded-full transition-all ${i === page ? "w-4 bg-brand-600" : "w-1.5 bg-gray-300"}`} />
        ))}
        {paused && <span className="ml-1.5 text-[10px] text-gray-400">En pausa</span>}
      </div>
    </div>
  );
}

// ─── Historial por candidato (se cierra a la hora) ─────────────────────────────

function ThreadsPanel({
  threads, activeKey, now, onOpen, compact = false,
}: {
  threads: Thread[];
  activeKey: string;
  now: number;
  onOpen: (key: string) => void;
  compact?: boolean;
}) {
  const item = (t: Thread) => {
    const preguntas = t.messages.filter((m) => m.role === "user").length;
    const active = t.key === activeKey;
    return (
      <button
        key={t.key}
        type="button"
        onClick={() => onOpen(t.key)}
        aria-current={active ? "true" : undefined}
        className={`text-left rounded-xl border px-3 py-2 transition-colors ${
          compact ? "shrink-0 max-w-[14rem]" : "w-full"
        } ${active ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
      >
        <span className="block truncate text-[13px] font-semibold text-gray-800">{t.name}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
          <span>{preguntas} {preguntas === 1 ? "pregunta" : "preguntas"}</span>
          <span className="inline-flex items-center gap-0.5"><Clock size={11} aria-hidden /> {minutesLeft(t, now)} min</span>
        </span>
      </button>
    );
  };

  if (compact) {
    return (
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Tus conversaciones · se cierran en 1 h</p>
        <div className="flex gap-2 overflow-x-auto pb-1">{threads.map(item)}</div>
      </div>
    );
  }

  return (
    <div className="sticky top-24">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
        <MessagesSquare size={13} aria-hidden /> Tus conversaciones
      </p>
      {threads.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-gray-400">
          Aquí aparecerá lo que preguntes a cada candidato. Cada conversación se guarda 1 hora en este dispositivo y luego se borra.
        </p>
      ) : (
        <>
          <div className="mt-2 space-y-2">{threads.map(item)}</div>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            Cada conversación se cierra 1 hora después de tu primera pregunta y no se puede recuperar.
          </p>
        </>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { profile }              = useCandidate();
  const shortName                = profile.name.split(" ")[0];

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages]  = useState<ChatMessage[]>([]);
  const [input, setInput]        = useState("");
  const [streaming, setStreaming]= useState(false);
  const [sessionId, setSessionId]= useState<string | null>(null);
  const [consent, setConsent]    = useState<boolean | null>(null);
  const [showNonsense, setShowNonsense] = useState(false);
  const [blocked, setBlocked]    = useState(false);
  const [assistantMode, setAssistantMode] = useState<string | null>(null);

  // Tope de mensajes: lo decide el servidor y llega en cada respuesta.
  const [quota, setQuota]           = useState<Quota | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Chips de candidatos: acotan el RAG a los documentos del candidato elegido.
  const [candidates, setCandidates] = useState<ChatCandidate[]>([]);
  const [candidateSlug, setCandidateSlug] = useState<string | null>(null);

  // Segmentador por zona: con 2+ candidatos publicados el ciudadano elige su
  // distrito y el chat le ofrece los 5 más cercanos (distrito → provincia → depto).
  const [ubicaciones, setUbicaciones] = useState<Ubicaciones | null>(null);
  const [zona, setZona]               = useState<ZonaInfo | null>(null);
  const [zoneBusy, setZoneBusy]       = useState(false);
  const [changingZone, setChangingZone] = useState(false);
  const zoneMode = !!ubicaciones;

  // Mini encuesta "¿apoyas a este candidato?" (la habilita el superadmin por tenant).
  const [pollEnabled, setPollEnabled] = useState(false);
  const [votes, setVotes]             = useState<Record<string, boolean>>({});
  const [voteBusy, setVoteBusy]       = useState(false);

  // Cita abierta (mensaje + etiqueta), para mostrar el texto del documento.
  const [openCite, setOpenCite] = useState<{ msgId: string; id: string } | null>(null);
  const toggleCite = (msgId: string, id: string) =>
    setOpenCite((cur) => (cur && cur.msgId === msgId && cur.id === id ? null : { msgId, id }));
  const endRef                   = useRef<HTMLDivElement>(null);

  // ── Geolocalización (browser GPS) ───────────────────────────────────────────
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [showGeoBanner, setShowGeoBanner] = useState(false);

  // ── Flujo de registro conversacional ────────────────────────────────────────
  const [regPhase, setRegPhase]   = useState<RegPhase | null>(null);
  const [regData, setRegData]     = useState<RegData>({ name: "", dni: "", phone: "", email: "" });
  const [chatInitialized, setChatInitialized] = useState(false);

  // ── Mejora 1: auto-start ─────────────────────────────────────────────────────
  const [autoStarting, setAutoStarting] = useState(false);

  // ── Entrada del bot + hilos por candidato ────────────────────────────────────
  // `intro`: mensajes del sistema (manifiesto, bienvenida) que NO son parte de
  // ninguna conversación; `messages` es SOLO el hilo del candidato activo.
  const [intro, setIntro]             = useState<ChatMessage[]>([]);
  const [welcomed, setWelcomed]       = useState(false);
  const [limits, setLimits]           = useState<{ base: number; bonus: number } | null>(null);
  const [platform, setPlatform]       = useState<boolean | null>(null); // null hasta montar (sin mismatch)
  const [askZoneFirst, setAskZoneFirst] = useState(false);
  const [dirLoaded, setDirLoaded]     = useState(false);
  const [threads, setThreads]         = useState<Record<string, Thread>>({});
  const threadsRef                    = useRef<Record<string, Thread>>({});
  const [now, setNow]                 = useState(() => Date.now());
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);

  // ── Micrófono (Web Speech API) ───────────────────────────────────────────────
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  useEffect(() => {
    setMicSupported(getSpeechRecognitionCtor() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleMic() {
    if (inputDisabled) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "es-PE";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        // Se agrega al texto existente, por si ya había algo escrito.
        setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  // ── Hilos: cargar al montar, guardar el activo, cerrar a la hora ─────────────
  const threadKey = candidateSlug ?? GENERAL_THREAD;
  const candidateSlugRef = useRef<string | null>(null);
  useEffect(() => { candidateSlugRef.current = candidateSlug; }, [candidateSlug]);

  useEffect(() => {
    const deep = new URLSearchParams(window.location.search).get("candidato");
    const isPlatform = !!DIRECTORY_TENANT && resolveTenantSlug() === DIRECTORY_TENANT;
    setPlatform(isPlatform);
    setAskZoneFirst(isPlatform && !deep);
    // El historial único anterior ya no se usa: se descarta para no mezclar candidatos.
    try {
      localStorage.removeItem(tenantStorageKey(LS_HISTORY));
      localStorage.removeItem(tenantStorageKey(LS_SAVED_AT));
      localStorage.removeItem(tenantStorageKey(LS_SESSION));
    } catch {}
    const t = loadThreads();
    threadsRef.current = t;
    setThreads(t);
  }, []);

  useEffect(() => {
    threadsRef.current = threads;
    try { localStorage.setItem(tenantStorageKey(LS_THREADS), JSON.stringify(threads)); } catch {}
  }, [threads]);

  // Al cambiar de candidato se abre SU hilo (si sigue vivo) con SU sesión.
  useEffect(() => {
    const t = threadsRef.current[threadKey];
    const alive = t && isAlive(t) ? t : null;
    setMessages(alive?.messages ?? []);
    setSessionId(alive?.sessionId ?? null);
    setQuota(null);
    setOpenCite(null);
    setExpiredNotice(null);
  }, [threadKey]);

  // Guardar el hilo activo cuando hay al menos una pregunta.
  useEffect(() => {
    const conv = messages.filter((m) => !m.pending && m.content.length > 0);
    if (!conv.some((m) => m.role === "user")) return;
    const name =
      candidates.find((c) => c.slug === candidateSlug)?.name
      ?? threadsRef.current[threadKey]?.name
      ?? (candidateSlug ? candidateSlug : "Consulta general");
    setThreads((all) => ({
      ...all,
      [threadKey]: {
        key: threadKey,
        name,
        sessionId,
        messages: conv,
        startedAt: all[threadKey]?.startedAt ?? Date.now(),
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sessionId]);

  // Reloj: cada 30 s cierra los hilos vencidos (y el activo, si le tocó).
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const all = threadsRef.current;
      const vencidos = Object.values(all).filter((x) => !isAlive(x, t));
      if (vencidos.length === 0) return;
      setThreads(Object.fromEntries(Object.entries(all).filter(([, x]) => isAlive(x, t))));
      const activo = vencidos.find((x) => x.key === (candidateSlugRef.current ?? GENERAL_THREAD));
      if (activo) {
        setMessages([]);
        setSessionId(null);
        setQuota(null);
        setExpiredNotice(activo.name);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);


  // ── Init ────────────────────────────────────────────────────────────────────
  // ── Candidatos disponibles para acotar el chat ───────────────────────────────
  const applyEstado = (est: SegmentacionEstado, wanted: string | null) => {
    setZona(est.zona);
    setCandidates(est.candidatos.map((c) => ({ slug: c.slug, name: c.name, party: c.party })));
    setPollEnabled(est.poll_enabled);
    setVotes(est.votos ?? {});
    // Con segmentación el chat SIEMPRE consulta sobre un candidato de la zona (no hay "Todos":
    // el RAG sin candidato mezclaría documentos de otras zonas). Si la zona tiene uno solo, se elige solo.
    if (wanted && est.candidatos.some((c) => c.slug === wanted)) setCandidateSlug(wanted);
    else if (est.candidatos.length === 1) setCandidateSlug(est.candidatos[0].slug);
    else setCandidateSlug((cur) => (cur && est.candidatos.some((c) => c.slug === cur) ? cur : null));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = { Accept: "application/json", ...tenantHeaders() };
        const r = await fetch(`${API}/directorio/candidatos`, { headers });
        if (!r.ok) return;
        const json = (await r.json()) as { data?: ChatCandidate[] };
        const list = (json.data ?? []).filter((c) => c.slug && c.name);
        if (cancelled) return;

        // ?candidato=slug (desde la ficha) manda sobre lo último que eligió el ciudadano.
        let wanted: string | null = null;
        try {
          wanted = new URLSearchParams(window.location.search).get("candidato")
            || localStorage.getItem(tenantStorageKey(LS_CANDIDATE));
        } catch {}

        // ¿Hay varios candidatos? Entonces se segmenta por zona; con uno solo, chips directos.
        let ubi: Ubicaciones | null = null;
        if (list.length >= 2) {
          const u = await fetch(`${API}/directorio/ubicaciones`, { headers }).catch(() => null);
          if (u?.ok) ubi = (await u.json()) as Ubicaciones;
        }
        let est = ubi ? await getZona() : null;

        if (ubi && est) {
          // Llegó desde la home con un candidato (?candidato=): si su zona guardada no lo
          // incluye (o no tiene zona), se pasa al distrito de ese candidato.
          const deep = wanted ? list.find((c) => c.slug === wanted) : undefined;
          const zonaLoIncluye = est.candidatos.some((c) => c.slug === wanted);
          if (deep?.distrito?.id && (!est.zona || !zonaLoIncluye)) est = (await saveZona({ distrito_id: deep.distrito.id })) ?? est;
          if (cancelled) return;
          setUbicaciones(ubi);
          applyEstado(est, wanted);
          return;
        }

        // Sin segmentación (un solo candidato o API de zona caída): comportamiento de siempre.
        setCandidates(list);
        if (wanted && list.some((c) => c.slug === wanted)) setCandidateSlug(wanted);
      } catch {
        /* sin chips: el chat sigue consultando sobre todos */
      } finally {
        if (!cancelled) setDirLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickZone = async (sel: ZonaSeleccion) => {
    setZoneBusy(true);
    const est = await saveZona(sel);
    setZoneBusy(false);
    if (!est) return;
    setChangingZone(false);
    applyEstado(est, null);
    if (!welcomed) showWelcome(limits, est);
  };

  const cancelZone = () => {
    setChangingZone(false);
    if (!welcomed) showWelcome(limits, null);
  };

  const vote = async (supports: boolean) => {
    if (!candidateSlug || voteBusy) return;
    setVoteBusy(true);
    const nuevos = await votarApoyo(candidateSlug, supports);
    setVoteBusy(false);
    if (nuevos) setVotes(nuevos);
  };

  const chooseCandidate = (slug: string | null) => {
    if (streaming) return; // la respuesta en curso pertenece al hilo actual
    setCandidateSlug(slug);
    try {
      if (slug) localStorage.setItem(tenantStorageKey(LS_CANDIDATE), slug);
      else localStorage.removeItem(tenantStorageKey(LS_CANDIDATE));
    } catch {}
  };

  useEffect(() => {
    const hasConsent = ConsentModal.hasConsent();
    setConsent(hasConsent);

    if (hasConsent) {
      initChatAfterConsent();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, intro]);

  // ── Lógica de inicialización post-consent ───────────────────────────────────

  function initChatAfterConsent() {
    requestGeoLocation(); // pedir GPS siempre que el usuario tenga consentimiento
    const regDone = localStorage.getItem(tenantStorageKey(LS_REG_DONE));
    if (RAFFLE_ENABLED && regDone) {
      setChatInitialized(true);
      setRegPhase("done");
    } else {
      autoStartRegistrationFlow();
    }
  }

  /** Plataforma (tenant del directorio) y si hay que pedir la zona antes de saludar. */
  function entryMode(): { isPlatform: boolean; askZone: boolean } {
    const isPlatform = !!DIRECTORY_TENANT && resolveTenantSlug() === DIRECTORY_TENANT;
    let deep: string | null = null;
    try { deep = new URLSearchParams(window.location.search).get("candidato"); } catch {}
    return { isPlatform, askZone: isPlatform && !deep };
  }

  // ── Solicitar GPS del navegador ─────────────────────────────────────────────
  function requestGeoLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    // Mostrar banner amigable en lugar del popup nativo (que la gente ignora)
    const dismissed = localStorage.getItem("geo_banner_dismissed");
    if (!dismissed && !geoLocation) {
      setTimeout(() => setShowGeoBanner(true), 3000); // aparece 3s después del consent
    }
  }

  function handleGeoAccept() {
    setShowGeoBanner(false);
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocation({
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {} // silencioso si deniega en el popup del browser
    );
  }

  function handleGeoDismiss() {
    setShowGeoBanner(false);
    localStorage.setItem("geo_banner_dismissed", "1");
  }

  // ── Guarda GPS al backend inmediatamente cuando se captura ──────────────────
  useEffect(() => {
    if (!geoLocation || !sessionId) return;
    const tenant = resolveTenantSlug();
    fetch(`${API}/chat/location`, {
      method:  "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(tenant ? { "X-Tenant": tenant } : {}),
      },
      body:    JSON.stringify({
        session_id: sessionId,
        lat:        geoLocation.lat,
        lng:        geoLocation.lng,
        accuracy:   geoLocation.accuracy,
      }),
    }).catch(() => {}); // silencioso si falla
  }, [geoLocation, sessionId]);

  // ── Consent result ──────────────────────────────────────────────────────────
  const onConsentResult = (accepted: boolean) => {
    setConsent(accepted);
    if (accepted) {
      initChatAfterConsent(); // ya llama requestGeoLocation internamente
    }
  };

  // ── Helpers de mensajes ─────────────────────────────────────────────────────

  function addBotMsg(content: string, quickReplies?: QuickReply[], pending = false) {
    const msg: ChatMessage = {
      id: `b-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role: "assistant",
      content,
      quickReplies,
      pending,
    };
    setMessages((m) => [...m, msg]);
    return msg.id;
  }

  function addUserMsg(content: string) {
    setMessages((m) => [...m, {
      id: `u-${Date.now()}`,
      role: "user",
      content,
      timestamp: Date.now(),
    }]);
  }

  // ── Mejora 1: arrancar el chat automáticamente con indicador de escritura ────

  function autoStartRegistrationFlow() {
    setAutoStarting(true);
    setIntro([{ id: "sys-typing", role: "assistant", content: "", pending: true }]);

    setTimeout(async () => {
      if (RAFFLE_ENABLED) {
        setAutoStarting(false);
        setIntro([]);
        // startRegistrationFlow reemplaza todos los mensajes con el mensaje de bienvenida
        startRegistrationFlow();
        setRegPhase("offered");
        return;
      }

      const l = await fetchLimits();
      const { isPlatform, askZone } = entryMode();
      setLimits(l);
      setAutoStarting(false);
      // 1) Manifiesto (solo en la plataforma) → 2) zona vacía → 3) bienvenida.
      setIntro(isPlatform ? [{ id: "sys-manifesto", role: "assistant", content: MANIFESTO }] : []);
      if (askZone) setChangingZone(true);
      else showWelcome(l, null);
      setChatInitialized(true);
      setRegPhase("done");
    }, 800);
  }

  // Topes vigentes del tenant, para decirle al ciudadano cuántos mensajes tiene.
  async function fetchLimits(): Promise<{ base: number; bonus: number } | null> {
    try {
      const r = await fetch(`${API}/chat/limits`, { headers: { ...tenantHeaders() } });
      if (!r.ok) return null;
      const j = await r.json();
      return typeof j.base === "number" && typeof j.bonus === "number" ? { base: j.base, bonus: j.bonus } : null;
    } catch {
      return null;
    }
  }

  // ── Bienvenida: quién soy, cómo usarme y cuántos mensajes tiene ───────────────

  function showWelcome(l: { base: number; bonus: number } | null, est: SegmentacionEstado | null) {
    const { isPlatform } = entryMode();
    const limitLine = l
      ? `\n\n⏳ Tienes **${l.base} mensajes** por conversación. Si quieres seguir, te registras y te damos **${l.bonus} más**.`
      : "";
    const ttlLine = "\n\n🕐 Tu conversación con cada candidato queda **1 hora** en este dispositivo y luego se borra de aquí. Cómo guardamos tus datos y cómo borrarlos: [Privacidad](/privacidad).";

    let content: string;
    if (isPlatform) {
      const lugar = est?.zona
        ? [est.zona.distrito, est.zona.provincia, est.zona.departamento].filter(Boolean).map((n) => prettyPlace(String(n))).join(", ")
        : null;
      const n = est?.candidatos.length ?? 0;
      const zonaLine = lugar
        ? n > 0
          ? `En **${lugar}** encontré **${n} ${n === 1 ? "candidato" : "candidatos"}**. `
          : `En **${lugar}** aún no hay candidatos publicados. Prueba con otra zona. `
        : "";
      content = `¡Bienvenido/a! 👋 Soy **PoliticOSIA**, un asistente neutral que escucha al pueblo.\n\n${zonaLine}**Elige un candidato** arriba y pregúntame lo que quieras: te respondo solo con sus documentos oficiales y te muestro la fuente.${ttlLine}${limitLine}`;
    } else {
      content = `¡Hola! 👋 Soy el asistente de **${profile.name || "tu candidato"}**.\n\nPregúntame lo que quieras saber: te respondo al toque, en base a los documentos oficiales que tengo de ${profile.name || "este candidato"}.${ttlLine}${limitLine}`;
    }

    setIntro((prev) => [...prev.filter((m) => m.id !== "sys-welcome" && m.id !== "sys-typing"), { id: "sys-welcome", role: "assistant", content }]);
    setWelcomed(true);
  }

  // Sin API de zonas (o falló) no hay a quién esperar: saludar igual.
  useEffect(() => {
    if (askZoneFirst && dirLoaded && !zoneMode && chatInitialized && !welcomed) showWelcome(limits, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askZoneFirst, dirLoaded, zoneMode, chatInitialized, welcomed]);

  // ── Paso 1+2: bienvenida + invitación a la rifa (apagada: RAFFLE_ENABLED) ─────

  function startRegistrationFlow() {
    const name  = profile.name || "el candidato";
    const cargo = profile.title || "la alcaldía";
    const party = profile.party || "su partido";

    setMessages([{
      id: `welcome-${Date.now()}`,
      role: "assistant",
      content: `¡Hola! 👋 Soy el asistente de ${name}, candidato a ${cargo} por ${party}.\n\nTenemos una rifa especial para los vecinos que se registren hoy. 🎁 ¿Te animas a participar? Solo necesito tu nombre, DNI, WhatsApp y correo — te lleva menos de un minuto.`,
      quickReplies: [
        { label: "✅ Sí, quiero participar", value: "Sí, quiero participar en la rifa" },
        { label: "❌ Ahora no, chatear",     value: "Ahora no, prefiero chatear" },
      ],
    }]);
  }

  // ── Conversación nueva con el MISMO candidato (tope agotado) ─────────────────

  function handleNewChat() {
    setThreads((all) => {
      const next = { ...all };
      delete next[threadKey];
      return next;
    });
    setMessages([]);
    setSessionId(null);
    setQuota(null);
    setUnlockError(null);
    setExpiredNotice(null);
  }

  // ── Tope de mensajes: consultar y desbloquear ───────────────────────────────

  async function refreshQuota(id: string | null = sessionId): Promise<Quota | null> {
    if (!id) return null;
    try {
      const r = await fetch(`${API}/chat/quota/${encodeURIComponent(id)}`, { headers: { ...tenantHeaders() } });
      if (!r.ok) return null;
      const q: Quota | null = (await r.json()).quota ?? null;
      setQuota(q);
      return q;
    } catch {
      return null;
    }
  }

  // Al volver a una conversación guardada, saber de entrada si ya está agotada.
  useEffect(() => {
    if (sessionId && !quota) refreshQuota(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function unlockWithData(f: { name: string; phone: string; email: string }) {
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const r = await fetch(`${API}/citizen/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...tenantHeaders() },
        body: JSON.stringify({
          name:           f.name,
          phone_whatsapp: f.phone || null,
          email:          f.email || null,
          visitor_uuid:   getVisitorId(),
          source:         "chat",
          consent:        true,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setUnlockError(err.message ?? "No pudimos guardar tus datos. Revisa el WhatsApp o correo e intenta de nuevo.");
        return;
      }
      // El servidor decide si el registro desbloquea (queda ligado a este navegador).
      const q = await refreshQuota();
      if (q?.blocked === "session" && q.can_unlock) {
        setUnlockError("Ese contacto ya estaba registrado desde otro dispositivo. Inicia una conversación nueva para seguir.");
      }
    } catch {
      setUnlockError("No pudimos conectar. Intenta de nuevo en un momento.");
    } finally {
      setUnlockBusy(false);
    }
  }

  // ── Paso 3-5: motor de registro conversacional ────────────────────────────────

  async function handleRegistrationInput(text: string) {
    addUserMsg(text);

    switch (regPhase) {

      case "offered": {
        if (acceptedRaffle(text)) {
          addBotMsg("¡Genial! ¿Cómo te llamas? 😊");
          setRegPhase("name");
        } else {
          finishWithoutReg();
        }
        break;
      }

      case "name": {
        const name = text.trim();
        if (name.length < 2) {
          addBotMsg("Escribe tu nombre completo, por favor. 👇");
          return;
        }
        setRegData((d) => ({ ...d, name }));
        addBotMsg(`Mucho gusto, ${name.split(" ")[0]}! Ahora escribe tu DNI (8 dígitos) 👇`);
        setRegPhase("dni");
        break;
      }

      case "dni": {
        const dni = text.trim();
        if (!isDniValid(dni)) {
          addBotMsg("El DNI debe tener exactamente 8 dígitos numéricos. ¿Puedes revisarlo? 👇");
          return;
        }
        setRegData((d) => ({ ...d, dni }));
        addBotMsg("Perfecto. Ahora tu número de WhatsApp (ej: 51987654321) 📱");
        setRegPhase("phone");
        break;
      }

      case "phone": {
        const phone = text.trim();
        setRegData((d) => ({ ...d, phone }));
        addBotMsg("¡Casi listo! ¿Tu correo electrónico? Si no quieres darlo, escribe \"omitir\". 📧");
        setRegPhase("email");
        break;
      }

      case "email": {
        const email = isSkipWord(text) ? "" : text.trim();
        setRegData((d) => ({ ...d, email }));
        setRegPhase("registering");
        const pendingId = addBotMsg("Registrando...", undefined, true);
        try {
          const tenant = resolveTenantSlug();
          const r = await fetch(`${API}/citizen/register`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(tenant ? { "X-Tenant": tenant } : {}),
            },
            body: JSON.stringify({
              name:            regData.name,
              dni:             regData.dni,
              phone_whatsapp:  regData.phone,
              email:           email || null,
              visitor_uuid:    getVisitorId(),
              source:          "chat",
              consent:         true,
              ...(geoLocation ? { lat: geoLocation.lat, lng: geoLocation.lng, accuracy: geoLocation.accuracy } : {}),
            }),
          });
          const result = await r.json();
          setMessages((m) => m.filter((x) => x.id !== pendingId));

          if (!r.ok) {
            addBotMsg(`Hubo un problema al registrarte: ${result.message ?? "error desconocido"}. Puedes intentarlo más tarde.`);
            finishWithoutReg();
          } else {
            const pts  = result.points ?? 50;
            const code = result.referral_code ?? "";
            // Guardar datos del ciudadano para la pantalla de bienvenida de regreso
            localStorage.setItem(tenantStorageKey(LS_CITIZEN_NAME),   regData.name);
            localStorage.setItem(tenantStorageKey(LS_CITIZEN_POINTS), pts.toString());
            addBotMsg(
              `🎉 ¡Listo, ${regData.name.split(" ")[0]}! Quedaste registrado/a y ganaste **${pts} puntos** de participación.\n\nTu código de referido es **${code}** — compártelo y gana 100 puntos más por cada vecino que se registre.`,
              [
                { label: "📋 Ver propuestas",  value: "Muéstrame las propuestas del candidato" },
                { label: "🗺️ Mi lugar",        value: "¿Qué propuestas hay para mi zona?" },
              ]
            );
            localStorage.setItem(tenantStorageKey(LS_REG_DONE), "done");
            setChatInitialized(true);
            setRegPhase("done");
          }
        } catch {
          setMessages((m) => m.filter((x) => x.id !== pendingId));
          addBotMsg("No pude completar el registro ahora. Continuemos con el chat.");
          finishWithoutReg();
        }
        break;
      }
    }
  }

  // ── Finalizar sin registrar ─────────────────────────────────────────────────

  function finishWithoutReg() {
    addBotMsg(
      `No hay problema. ¿De qué zona eres y qué problema ves en tu comunidad que más te preocupa? Cuéntame y te explico qué propone ${shortName} para resolverlo. 👇`
    );
    localStorage.setItem(tenantStorageKey(LS_REG_DONE), "skipped");
    setChatInitialized(true);
    setRegPhase("done");
  }

  // ── Payload para el backend ──────────────────────────────────────────────────

  const buildPayload = (text: string) => ({
    message:     text,
    session_id:  sessionId,
    consent:     consent ?? false,
    initialized: chatInitialized,
    visitor_id:  getVisitorId(),
    ...(candidateSlug ? { candidate_slug: candidateSlug } : {}),
    ...(geoLocation ? { lat: geoLocation.lat, lng: geoLocation.lng, accuracy: geoLocation.accuracy } : {}),
  });

  // ── Streaming ─────────────────────────────────────────────────────────────────

  const sendStreaming = async (text: string, aiId: string): Promise<boolean> => {
    try {
      const tenant = resolveTenantSlug();
      const r = await fetch(`${API}/chat/stream`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(tenant ? { "X-Tenant": tenant } : {}),
        },
        body: JSON.stringify(buildPayload(text)),
      });
      if (!r.ok || !r.body) return false;

      const reader  = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";
      let gotChunk  = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.chunk) {
              gotChunk = true;
              setMessages((m) =>
                m.map((x) => (x.id === aiId ? { ...x, content: x.content + payload.chunk, pending: false } : x))
              );
            }
            if (payload.done) {
              if (payload.sessionId) {
                setSessionId(payload.sessionId);
              }
              if (payload.media?.length) {
                setMessages((m) =>
                  m.map((x) => (x.id === aiId ? { ...x, media: payload.media } : x))
                );
              }
              if (payload.quickReplies?.length) {
                setMessages((m) =>
                  m.map((x) => (x.id === aiId ? { ...x, quickReplies: payload.quickReplies } : x))
                );
              }
              if (payload.citations?.length) {
                setMessages((m) =>
                  m.map((x) => (x.id === aiId ? { ...x, citations: payload.citations } : x))
                );
              }
              if (payload.mode) setAssistantMode(payload.mode);
              if (payload.quota) setQuota(payload.quota);
              if (payload.pepa?.fuentes_citadas?.length) {
                setMessages((m) =>
                  m.map((x) => (x.id === aiId ? { ...x, sources: payload.pepa.fuentes_citadas } : x))
                );
              }
              setBlocked(payload.blocked ?? false);
              if (payload.nonsense || payload.attackDetected) setShowNonsense(true);
            }
          } catch {}
        }
      }
      return gotChunk;
    } catch {
      return false;
    }
  };

  const sendFallback = async (text: string, aiId: string): Promise<boolean> => {
    try {
      const tenant = resolveTenantSlug();
      const r = await fetch(`${API}/chat`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(tenant ? { "X-Tenant": tenant } : {}),
        },
        body: JSON.stringify(buildPayload(text)),
      });
      if (!r.ok) return false;
      const data = await r.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
      setMessages((m) =>
        m.map((x) =>
          x.id === aiId
            ? { ...x, content: data.reply ?? "Sin respuesta.", media: data.media ?? [], quickReplies: data.quickReplies ?? [], sources: data.pepa?.fuentes_citadas ?? undefined, citations: data.citations?.length ? data.citations : undefined, pending: false }
            : x
        )
      );
      if (data.mode) setAssistantMode(data.mode);
      if (data.quota) setQuota(data.quota);
      setBlocked(data.blocked ?? false);
      if (data.nonsense || data.attackDetected) setShowNonsense(true);
      return true;
    } catch {
      return false;
    }
  };

  // ── Quick replies ─────────────────────────────────────────────────────────────

  const sendQuickReply = (value: string) => {
    setInput(value);
    setTimeout(() => {
      setInput("");
      if (regPhase !== "done") {
        handleRegistrationInput(value);
        return;
      }
      if (streaming) return;
      dispatchToAI(value);
    }, 80);
  };

  // ── Enviar al AI (flujo normal post-registro) ─────────────────────────────────

  function dispatchToAI(text: string) {
    setStreaming(true);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, timestamp: Date.now() };
    setMessages((m) => [...m, userMsg]);
    const aiId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: aiId, role: "assistant", content: "", pending: true }]);
    (async () => {
      try {
        const streamed = await sendStreaming(text, aiId);
        if (!streamed) {
          const ok = await sendFallback(text, aiId);
          if (!ok) {
            setMessages((m) =>
              m.map((x) =>
                x.id === aiId
                  ? { ...x, content: "En este momento no puedo responder. Por favor intenta de nuevo.", pending: false }
                  : x
              )
            );
          }
        }
      } finally {
        setStreaming(false);
      }
    })();
  }

  // ── Send (input del usuario) ──────────────────────────────────────────────────

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    if (regPhase !== null && regPhase !== "done") {
      handleRegistrationInput(text);
      return;
    }

    dispatchToAI(text);
  };

  // ── Placeholder del input según fase ─────────────────────────────────────────

  const inputPlaceholder = () => {
    if (regPhase === "offered")    return "Escribe sí o no...";
    if (regPhase === "name")       return "Tu nombre completo...";
    if (regPhase === "dni")        return "Tu DNI (8 dígitos)...";
    if (regPhase === "phone")      return "Tu WhatsApp (ej: 51987654321)...";
    if (regPhase === "email")      return "Tu correo o escribe 'omitir'...";
    if (regPhase === "registering")return "Registrando...";
    if (blocked)                   return "Escribe 'hola', 'menú' o 'inicio' para continuar...";
    if (needsCandidate)            return "Elige un candidato arriba...";
    return "Escribe tu pregunta...";
  };

  // Zona elegida con varios candidatos y ninguno seleccionado: no se consulta a ciegas (mezclaría zonas).
  const needsCandidate = zoneMode && !!zona && candidates.length > 0 && !candidateSlug && (regPhase === null || regPhase === "done");
  const inputDisabled = streaming || autoStarting || regPhase === "registering" || needsCandidate;

  // ── Hilos visibles + mensajes a mostrar ─────────────────────────────────────
  const threadList = Object.values(threads)
    .filter((t) => isAlive(t, now))
    .sort((a, b) => b.startedAt - a.startedAt);

  function openThread(key: string) {
    chooseCandidate(key === GENERAL_THREAD ? null : key);
  }

  const activeName = candidateSlug
    ? candidates.find((c) => c.slug === candidateSlug)?.name ?? threads[candidateSlug]?.name ?? null
    : null;
  const activeThread = threads[threadKey];
  const candIntro: ChatMessage[] =
    welcomed && candidateSlug && activeName
      ? [{
          id: `sys-cand-${candidateSlug}`,
          role: "assistant",
          content: activeThread && isAlive(activeThread, now) && messages.length > 0
            ? `Retomas tu conversación sobre **${activeName}**. Se cierra en ${minutesLeft(activeThread, now)} min.`
            : `Ahora consultas sobre **${activeName}**. Pregúntame por su plan de gobierno, sus propuestas o su hoja de vida.`,
        }]
      : [];
  const shown: ChatMessage[] = [...intro, ...candIntro, ...messages];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      {platform === false && <LiveAlert />}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {profile.photo_url || profile.logo_url ? (
              <img
                src={profile.photo_url ?? profile.logo_url ?? undefined}
                alt={profile.name}
                className="h-9 w-9 rounded-full object-cover shrink-0 border border-gray-200"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
                <span className="font-serif font-bold text-white text-sm leading-none">{shortName[0]}</span>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-serif font-bold text-gray-900 truncate">{shortName}</h1>
              <AIBadge mode={assistantMode} />
            </div>
          </div>
          {platform ? (
            // Plataforma: "Inicio" es SIEMPRE la home de PoliticOS (sin ?tenant=, que abriría la home de un candidato).
            <Link href="/" className="text-sm font-semibold text-gray-500 hover:text-brand-600 transition-colors shrink-0">Inicio</Link>
          ) : (
            <TenantLink href="/" className="text-sm text-gray-500 hover:text-brand-600 transition-colors shrink-0">Inicio</TenantLink>
          )}
        </div>
        {!(zoneMode && (!zona || changingZone)) && (candidates.length > 0 || (zoneMode && !!zona)) && (
          <div className="max-w-3xl mx-auto mt-2.5">
            {zoneMode && zona && <ZoneBadge zona={zona} onChange={() => setChangingZone(true)} />}
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
              Consultar sobre
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Elegir candidato">
              {!zoneMode && (
              <button
                type="button"
                onClick={() => chooseCandidate(null)}
                aria-pressed={candidateSlug === null}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  candidateSlug === null
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                Todos
              </button>
              )}
              {candidates.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => chooseCandidate(c.slug)}
                  aria-pressed={candidateSlug === c.slug}
                  title={c.party ? `${c.name} · ${c.party}` : c.name}
                  className={`shrink-0 max-w-[16rem] truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    candidateSlug === c.slug
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {zoneMode && zona && candidates.length === 0 && (
              <p className="mt-1 text-[11px] text-gray-500">
                Aún no hay candidatos publicados en esta zona. Prueba con otra o con el departamento completo.
              </p>
            )}
            {needsCandidate && (
              <p className="mt-1 text-[11px] font-medium text-amber-700">Elige un candidato para empezar a consultar.</p>
            )}
            {candidateSlug && (
              <p className="mt-1 text-[11px] text-gray-500">
                Las respuestas usan solo los documentos de{" "}
                <span className="font-semibold">{candidates.find((c) => c.slug === candidateSlug)?.name}</span>.
              </p>
            )}
            {pollEnabled && candidateSlug && (
              <SupportPoll
                name={candidates.find((c) => c.slug === candidateSlug)?.name ?? ""}
                vote={votes[candidateSlug]}
                busy={voteBusy}
                onVote={vote}
              />
            )}
          </div>
        )}
      </header>

      <div className="flex-1 w-full max-w-6xl mx-auto flex lg:gap-6 lg:px-4">
        {/* Historial por candidato (escritorio) */}
        <aside className="hidden lg:block w-64 shrink-0 pt-5">
          <ThreadsPanel threads={threadList} activeKey={threadKey} now={now} onOpen={openThread} />
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* ── Chat normal ── */}
          <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5">
            {/* Historial por candidato (móvil) */}
            {threadList.length > 0 && (
              <div className="lg:hidden mb-4">
                <ThreadsPanel threads={threadList} activeKey={threadKey} now={now} onOpen={openThread} compact />
              </div>
            )}

            {shown.length === 0 && regPhase === null && !autoStarting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-10 text-gray-500"
              >
                <p className="text-base font-medium">Acepta las condiciones para comenzar a chatear.</p>
                <p className="text-xs mt-2 text-gray-400">Soy un asistente entrenado con propuestas oficiales públicas.</p>
              </motion.div>
            )}

            {/* Mensajes */}
            <AnimatePresence initial={false}>
              {shown.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-3 flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {msg.role === "assistant" && (
                    profile.photo_url || profile.logo_url ? (
                      <img
                        src={profile.photo_url ?? profile.logo_url ?? undefined}
                        alt={profile.name}
                        className="h-8 w-8 rounded-full object-cover shrink-0 border border-gray-200"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
                        <span className="font-serif font-bold text-white text-xs leading-none">{shortName[0]}</span>
                      </div>
                    )
                  )}
                  <div className={`flex flex-col min-w-0 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-chat-500 text-white rounded-tr-md shadow-sm"
                          : "bg-white border border-gray-200 text-gray-800 rounded-tl-md shadow-sm"
                      }`}
                    >
                      {msg.pending ? (
                        <ThinkingAnimation />
                      ) : (
                        <>
                          {msg.role === "assistant" ? (
                            <div className="[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[13px] [&_code]:font-mono">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({ href, children }) => {
                                    if (href?.startsWith("#cite-")) {
                                      const cite = msg.citations?.find((c) => c.id === href.slice(6));
                                      if (!cite) return null;
                                      const active = openCite?.msgId === msg.id && openCite.id === cite.id;
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => toggleCite(msg.id, cite.id)}
                                          aria-expanded={active}
                                          title={`${cite.title}${cite.page ? ` — pág. ${cite.page}` : ""}`}
                                          className={`mx-0.5 inline-flex -translate-y-0.5 items-center rounded px-1 text-[10px] font-bold leading-4 transition-colors ${
                                            active ? "bg-chat-600 text-white" : "bg-chat-50 text-chat-700 ring-1 ring-chat-400 hover:bg-chat-400/25"
                                          }`}
                                        >
                                          {children}
                                        </button>
                                      );
                                    }
                                    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-chat-700 underline">{children}</a>;
                                  },
                                }}
                              >
                                {linkifyCitations(msg.content, msg.citations)}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <span className="whitespace-pre-wrap">{msg.content}</span>
                          )}
                          {msg.media && msg.media.length > 0 && msg.content.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-2">
                                Recursos relacionados
                              </p>
                              {msg.media.slice(0, 8).map((m, i) => (
                                <MediaBadge key={i} item={m} />
                              ))}
                            </div>
                          )}
                          {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1.5">
                                Fuentes en el documento
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.citations.map((c) => (
                                  <CitationChip
                                    key={c.id}
                                    c={c}
                                    active={openCite?.msgId === msg.id && openCite.id === c.id}
                                    onClick={() => toggleCite(msg.id, c.id)}
                                  />
                                ))}
                              </div>
                              {(() => {
                                const open = openCite?.msgId === msg.id ? msg.citations.find((c) => c.id === openCite.id) : null;
                                return open ? <CitationPanel c={open} onClose={() => setOpenCite(null)} /> : null;
                              })()}
                            </div>
                          )}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1.5">
                                Fuentes verificadas
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.sources.slice(0, 5).map((url, i) => (
                                  <SourceChip key={i} url={url} />
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {!msg.pending && msg.role === "assistant" && msg.quickReplies && msg.quickReplies.length > 0 && (
                      <div className="max-w-[85%] w-full">
                        <QuickReplyButtons replies={msg.quickReplies} onSelect={sendQuickReply} />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Preguntas sugeridas: debajo del último mensaje, siempre listas para tocar */}
            {welcomed && regPhase === "done" && !quota?.blocked && !needsCandidate
              && !(zoneMode && (!zona || changingZone)) && (activeName || !zoneMode) && (
              <SuggestionCarousel
                name={activeName ?? (profile.name || "este candidato")}
                disabled={streaming || autoStarting}
                onPick={sendQuickReply}
              />
            )}

            {/* Zona: aparece vacía al entrar (y al tocar "Cambiar"), dentro del chat */}
            {zoneMode && (!zona || changingZone) && ubicaciones && consent && (
              <div className="mb-4">
                <ZonePicker
                  ubicaciones={ubicaciones}
                  busy={zoneBusy}
                  onPick={pickZone}
                  onCancel={zona ? cancelZone : undefined}
                />
              </div>
            )}

            {expiredNotice && (
              <p className="mx-auto mb-3 flex max-w-md items-center justify-center gap-1.5 rounded-full bg-gray-100 px-4 py-2 text-center text-xs text-gray-500">
                <Clock size={13} aria-hidden />
                Tu conversación sobre {expiredNotice} cumplió 1 hora y se cerró.
              </p>
            )}

            {blocked && (
              <div className="mb-3">
                <BlockedBanner />
              </div>
            )}

            {/* Banner de ubicación GPS */}
            {showGeoBanner && !geoLocation && (
              <div className="mx-auto max-w-sm mb-3">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                      <MapPin size={16} className="text-brand-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">¿Compartir tu ubicación?</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Nos ayuda a mostrarte información relevante para tu lugar y mejorar las propuestas del candidato en tu zona.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleGeoAccept}
                          className="flex-1 bg-chat-500 text-white text-xs font-medium py-2 rounded-full hover:bg-chat-600 transition"
                        >
                          Sí, compartir
                        </button>
                        <button
                          onClick={handleGeoDismiss}
                          className="flex-1 border border-gray-200 text-gray-500 text-xs font-medium py-2 rounded-full hover:bg-gray-50 transition"
                        >
                          No, gracias
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmación cuando GPS fue aceptado */}
            {geoLocation && (
              <div className="flex justify-center mb-2">
                <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
                  <MapPin size={11} /> Ubicación compartida
                </span>
              </div>
            )}

            <div ref={endRef} />
          </main>

          {/* Composer */}
          <footer className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
            {quota?.blocked && (
              <QuotaWall
                quota={quota}
                busy={unlockBusy}
                error={unlockError}
                onUnlock={unlockWithData}
                onNewChat={handleNewChat}
              />
            )}
            {!quota?.blocked && (<>
            <div className="max-w-3xl mx-auto flex gap-2">
              <input
                type="text"
                aria-label="Escribe tu mensaje"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={inputPlaceholder()}
                disabled={inputDisabled}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-chat-500 text-sm disabled:opacity-50"
              />
              {micSupported && (
                <button
                  type="button"
                  onClick={toggleMic}
                  disabled={inputDisabled}
                  aria-label={listening ? "Detener grabación" : "Hablar en vez de escribir"}
                  aria-pressed={listening}
                  className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    listening
                      ? "bg-red-500 text-white shadow-sm"
                      : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                  }`}
                >
                  {listening ? <Square size={16} fill="currentColor" /> : <Mic size={17} />}
                </button>
              )}
              <button
                onClick={send}
                disabled={inputDisabled || !input.trim()}
                aria-label="Enviar mensaje"
                className="shrink-0 w-11 h-11 rounded-full bg-chat-500 text-white flex items-center justify-center hover:bg-chat-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {streaming ? (
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
            {quota && quota.remaining <= 5 && (
              <p className="text-[11px] text-gray-400 text-right max-w-3xl mx-auto mt-1">
                Te quedan {quota.remaining} {quota.remaining === 1 ? "mensaje" : "mensajes"}
              </p>
            )}
            {listening && (
              <p className="text-[11px] text-red-500 text-center mt-1.5 flex items-center justify-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Escuchando... toca el cuadrado para detener
              </p>
            )}
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              IA basada en información pública. Verifica decisiones electorales en{" "}
              <a className="underline" href="https://infogob.jne.gob.pe" target="_blank" rel="noopener noreferrer">infogob.jne.gob.pe</a>
              {" · "}
              <Link className="underline" href="/privacidad">Privacidad y tus datos</Link>
            </p>
            </>)}
          </footer>
        </div>
      </div>

      {consent === null && (
        <ConsentModal
          onAccept={() => onConsentResult(true)}
          onDecline={() => onConsentResult(false)}
        />
      )}

      {showNonsense && (
        <NonsenseAlert onClose={() => setShowNonsense(false)} />
      )}
    </div>
  );
}
