"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Play, Link as LinkIcon, X, ImageIcon, ShieldAlert, AlertTriangle, ArrowRight, RotateCcw, Mic, Square, Send, MapPin, Star, Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ConsentModal from "@/components/chat/ConsentModal";
import AIBadge from "@/components/chat/AIBadge";
import { LiveAlert } from "@/components/live/LiveAlert";
import { useCandidate } from "@/context/CandidateContext";
import { resolveTenantSlug, normalizeApiBase, tenantHeaders } from "@/lib/api";
import { tenantStorageKey } from "@/lib/utils";
import { TenantLink } from "@/components/ui/TenantLink";

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
  base: number;                 // mensajes por bloque (10–50, lo fija la plataforma)
  max: number;                  // tope de esta conversación (base, o 2×base si ya dejó sus datos)
  used: number;
  remaining: number;
  registered: boolean;
  blocked: "session" | "daily" | "network" | null;
  can_unlock: boolean;          // puede dejar sus datos para ganar `base` mensajes más
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

const LS_HISTORY        = "politicos_chat_history";
const LS_SAVED_AT       = "politicos_chat_saved_at";
const LS_SESSION        = "politicos_session_id";
const LS_REG_DONE       = "politicos_reg_done";
const LS_CANDIDATE      = "politicos_chat_candidate";
const LS_CITIZEN_NAME   = "politicos_citizen_name";
const LS_CITIZEN_POINTS = "politicos_citizen_points";

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

/** UUID estable del navegador: identifica al visitante para el tope diario y para ligar su registro. */
function getVisitorId(): string {
  const KEY = "politicos_visitor_uuid";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "";
  }
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
  const [agree, setAgree]     = useState(false);
  const [showForm, setShowForm] = useState(false);

  const resets = quota.resets_at
    ? new Date(quota.resets_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
    : null;
  const canSubmit = name.trim().length > 1 && (phone.trim().length >= 6 || email.includes("@")) && agree && !busy;

  return (
    <div className="max-w-3xl mx-auto rounded-2xl border border-chat-400 bg-chat-50 p-4">
      <p className="text-sm font-bold text-gray-800">⏳ Mensajes agotados</p>

      {quota.blocked === "session" && (
        <p className="text-xs text-gray-600 mt-1">
          Usaste los {quota.max} mensajes de esta conversación.
          {quota.can_unlock ? ` Deja tus datos y te damos ${quota.base} mensajes más.` : ""}
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
          Dejar mis datos y conseguir {quota.base} mensajes más
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
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu WhatsApp"
            inputMode="tel" autoComplete="tel"
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-chat-500" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Tu correo (opcional si diste WhatsApp)"
            type="email" autoComplete="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-chat-500" />
          <label className="flex items-start gap-2 text-[11px] text-gray-500">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            Acepto que usen mis datos para contactarme y mejorar las propuestas para mi zona.
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={!canSubmit}
            className="w-full bg-chat-500 text-white text-sm font-medium py-2.5 rounded-full hover:bg-chat-600 disabled:opacity-40 transition">
            {busy ? "Guardando…" : `Desbloquear ${quota.base} mensajes`}
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

  // ── Mejora 2: welcome back ───────────────────────────────────────────────────
  const [welcomeBack, setWelcomeBack] = useState<WelcomeBack | null>(null);

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

  // ── Guardar historial en localStorage al cambiar los mensajes ────────────────
  useEffect(() => {
    if (welcomeBack !== null) return; // no sobreescribir mientras se muestra la pantalla de bienvenida
    const saveable = messages.filter((m) => !m.pending && m.content.length > 0);
    if (saveable.length === 0) return;
    localStorage.setItem(tenantStorageKey(LS_HISTORY), JSON.stringify(saveable));
    localStorage.setItem(tenantStorageKey(LS_SAVED_AT), Date.now().toString());
  }, [messages, welcomeBack]);

  // ── Init ────────────────────────────────────────────────────────────────────
  // ── Candidatos disponibles para acotar el chat ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/directorio/candidatos`, {
          headers: { Accept: "application/json", ...tenantHeaders() },
        });
        if (!r.ok) return;
        const json = (await r.json()) as { data?: ChatCandidate[] };
        const list = (json.data ?? []).filter((c) => c.slug && c.name);
        if (cancelled) return;
        setCandidates(list);

        // ?candidato=slug (desde la ficha) manda sobre lo último que eligió el ciudadano.
        let wanted: string | null = null;
        try {
          wanted = new URLSearchParams(window.location.search).get("candidato")
            || localStorage.getItem(tenantStorageKey(LS_CANDIDATE));
        } catch {}
        if (wanted && list.some((c) => c.slug === wanted)) setCandidateSlug(wanted);
      } catch {
        /* sin chips: el chat sigue consultando sobre todos */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const chooseCandidate = (slug: string | null) => {
    setCandidateSlug(slug);
    try {
      if (slug) localStorage.setItem(tenantStorageKey(LS_CANDIDATE), slug);
      else localStorage.removeItem(tenantStorageKey(LS_CANDIDATE));
    } catch {}
  };

  useEffect(() => {
    const hasConsent = ConsentModal.hasConsent();
    setConsent(hasConsent);
    const stored = localStorage.getItem(tenantStorageKey(LS_SESSION));
    if (stored) setSessionId(stored);

    if (hasConsent) {
      initChatAfterConsent();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Lógica de inicialización post-consent ───────────────────────────────────

  function initChatAfterConsent() {
    requestGeoLocation(); // pedir GPS siempre que el usuario tenga consentimiento
    let savedMessages: ChatMessage[] = [];
    try {
      const raw = localStorage.getItem(tenantStorageKey(LS_HISTORY));
      if (raw) savedMessages = JSON.parse(raw);
    } catch {}

    if (savedMessages.length > 0) {
      // Hay historial → mostrar pantalla de bienvenida de regreso
      const savedName   = localStorage.getItem(tenantStorageKey(LS_CITIZEN_NAME)) || "";
      const savedPoints = localStorage.getItem(tenantStorageKey(LS_CITIZEN_POINTS));
      const savedAt     = parseInt(localStorage.getItem(tenantStorageKey(LS_SAVED_AT)) || "0");
      setWelcomeBack({
        name:   savedName,
        points: savedPoints ? parseInt(savedPoints) : null,
        savedAt,
      });
    } else {
      const regDone = localStorage.getItem(tenantStorageKey(LS_REG_DONE));
      if (regDone) {
        setChatInitialized(true);
        setRegPhase("done");
      } else {
        autoStartRegistrationFlow();
      }
    }
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
    const typingId = `auto-typing-${Date.now()}`;
    setMessages([{ id: typingId, role: "assistant", content: "", pending: true }]);

    setTimeout(() => {
      setAutoStarting(false);
      // startRegistrationFlow reemplaza todos los mensajes con el mensaje de bienvenida
      startRegistrationFlow();
      setRegPhase("offered");
    }, 800);
  }

  // ── Paso 1+2: bienvenida + invitación a la rifa ──────────────────────────────

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

  // ── Mejora 2: continuar conversación anterior ────────────────────────────────

  function handleContinue() {
    let saved: ChatMessage[] = [];
    try {
      const raw = localStorage.getItem(tenantStorageKey(LS_HISTORY));
      if (raw) saved = JSON.parse(raw);
    } catch {}

    const firstName = welcomeBack?.name?.split(" ")[0] || "vecino/a";
    const typingId  = `greeting-${Date.now()}`;

    setWelcomeBack(null);
    setRegPhase("done");
    setChatInitialized(true);
    setAutoStarting(true);

    setMessages([
      ...saved,
      { id: typingId, role: "assistant", content: "", pending: true },
    ]);

    setTimeout(() => {
      setAutoStarting(false);
      setMessages((m) =>
        m.map((x) =>
          x.id === typingId
            ? { ...x, content: `¡Hola de nuevo, ${firstName}! 👋 ¿En qué te puedo ayudar hoy?`, pending: false }
            : x
        )
      );
    }, 900);
  }

  // ── Mejora 2: nuevo chat desde cero ──────────────────────────────────────────

  function handleNewChat() {
    localStorage.removeItem(tenantStorageKey(LS_HISTORY));
    localStorage.removeItem(tenantStorageKey(LS_SAVED_AT));
    localStorage.removeItem(tenantStorageKey(LS_SESSION));
    localStorage.removeItem(tenantStorageKey(LS_REG_DONE));
    setSessionId(null);
    setQuota(null);
    setUnlockError(null);
    setWelcomeBack(null);
    setRegPhase(null);
    setChatInitialized(false);
    setMessages([]);
    autoStartRegistrationFlow();
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
                localStorage.setItem(tenantStorageKey(LS_SESSION), payload.sessionId);
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
        localStorage.setItem(tenantStorageKey(LS_SESSION), data.sessionId);
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
    return "Escribe tu pregunta...";
  };

  const inputDisabled = streaming || autoStarting || regPhase === "registering";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      <LiveAlert />

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
          <TenantLink href="/" className="text-sm text-gray-500 hover:text-brand-600 transition-colors shrink-0">Inicio</TenantLink>
        </div>
        {candidates.length > 0 && (
          <div className="max-w-3xl mx-auto mt-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
              Consultar sobre
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Elegir candidato">
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
            {candidateSlug && (
              <p className="mt-1 text-[11px] text-gray-500">
                Las respuestas usan solo los documentos de{" "}
                <span className="font-semibold">{candidates.find((c) => c.slug === candidateSlug)?.name}</span>.
              </p>
            )}
          </div>
        )}
      </header>

      {/* ── Pantalla de bienvenida de regreso (Mejora 2) ── */}
      {welcomeBack !== null ? (
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 flex items-center justify-center py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-sm"
          >
            <div className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
              {/* Franja superior */}
              <div className="h-1.5 bg-gradient-to-r from-brand-600 to-brand-400" />

              <div className="px-6 py-7 flex flex-col gap-5">
                {/* Avatar + saludo */}
                <div className="flex flex-col items-center text-center gap-2">
                  {profile.photo_url || profile.logo_url ? (
                    <img
                      src={profile.photo_url ?? profile.logo_url ?? undefined}
                      alt={profile.name}
                      className="w-14 h-14 rounded-full object-cover shadow-md border border-gray-200"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-brand-500 flex items-center justify-center shadow-md">
                      <span className="font-serif font-bold text-white text-xl leading-none">{shortName[0]}</span>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-0.5">
                      De vuelta
                    </p>
                    <h2 className="text-xl font-bold text-gray-900">
                      {welcomeBack.name
                        ? `Bienvenido/a de nuevo, ${welcomeBack.name.split(" ")[0]}`
                        : "Bienvenido/a de nuevo"}
                    </h2>
                  </div>
                </div>

                {/* Info de la conversación anterior */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex flex-col gap-1.5">
                  <p className="text-sm text-gray-600 font-medium">Tienes una conversación anterior</p>
                  <p className="text-xs text-gray-400">
                    {welcomeBack.savedAt
                      ? `Del ${formatSavedDate(welcomeBack.savedAt)}`
                      : "Guardada recientemente"}
                  </p>
                  {welcomeBack.points !== null && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Star size={13} className="text-amber-500 fill-amber-500" />
                      <span className="text-xs font-semibold text-amber-600">
                        {welcomeBack.points} puntos acumulados
                      </span>
                    </div>
                  )}
                </div>

                {/* Botones */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleContinue}
                    className="w-full flex items-center justify-center gap-2 bg-chat-500 hover:bg-chat-600 text-white font-semibold py-3.5 px-5 rounded-xl transition-colors text-sm shadow-sm"
                  >
                    Continuar conversación
                    <ArrowRight size={16} />
                  </button>
                  <button
                    onClick={handleNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-600 font-medium py-3 px-5 rounded-xl border border-gray-200 transition-colors text-sm"
                  >
                    <RotateCcw size={14} className="text-gray-400" />
                    Iniciar nueva conversación
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </main>
      ) : (
        <>
          {/* ── Chat normal ── */}
          <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5">
            {messages.length === 0 && regPhase === null && !autoStarting && (
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
              {messages.map((msg) => (
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
            </p>
            </>)}
          </footer>
        </>
      )}

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
