"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Play, Link as LinkIcon, X, ImageIcon, ShieldAlert, AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";
import ConsentModal from "@/components/chat/ConsentModal";
import AIBadge from "@/components/chat/AIBadge";
import { LiveAlert } from "@/components/live/LiveAlert";
import { useCandidate } from "@/context/CandidateContext";
import { resolveTenantSlug } from "@/lib/api";
import { TenantLink } from "@/components/ui/TenantLink";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MediaItem {
  type: string;
  url: string;
  title: string;
  thumbnail?: string;
}

interface QuickReply {
  label: string;
  value: string;
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
}

interface WelcomeBack {
  name: string;
  points: number | null;
  savedAt: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const LS_HISTORY        = "politicos_chat_history";
const LS_SAVED_AT       = "politicos_chat_saved_at";
const LS_SESSION        = "politicos_session_id";
const LS_REG_DONE       = "politicos_reg_done";
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
            className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <span className="text-xs text-zinc-400 italic">{THINKING_STEPS[step]}...</span>
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
          className="w-full text-left rounded-xl overflow-hidden border border-zinc-200 hover:border-zinc-400 transition-colors group"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.title}
            className="w-full max-h-52 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
          />
          <div className="px-3 py-2 bg-zinc-50 flex items-center gap-2">
            <ImageIcon size={12} className="text-zinc-400 shrink-0" />
            <p className="text-xs text-zinc-600 truncate flex-1">{item.title}</p>
            <span className="text-[10px] text-zinc-400 shrink-0">Ver imagen</span>
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
          className="w-full text-left rounded-xl overflow-hidden border border-zinc-200 hover:border-red-300 transition-colors group"
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
          <div className="px-3 py-2 bg-zinc-50 flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-red-600 flex items-center justify-center shrink-0">
              <Play size={8} className="text-white fill-white ml-px" />
            </div>
            <p className="text-xs font-medium text-zinc-800 truncate flex-1">{item.title}</p>
            <span className="text-[10px] text-zinc-400 shrink-0">Reproducir</span>
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
      className="flex items-center gap-2 px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl hover:bg-zinc-200 transition-colors">
      <LinkIcon size={14} className="text-zinc-500 shrink-0" />
      <p className="text-xs text-zinc-700 truncate max-w-[200px]">{item.title}</p>
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
          className="px-3 py-1.5 bg-white border border-zinc-300 hover:border-zinc-500 hover:bg-zinc-50 rounded-full text-xs font-medium text-zinc-700 transition-colors shadow-sm"
        >
          {r.label}
        </motion.button>
      ))}
    </div>
  );
}

// ─── Chip de fuente citada (modo PEPA) ────────────────────────────────────────

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
      <span>🔒</span>
      <span>Sesión bloqueada — escribe <strong>hola</strong>, <strong>menú</strong> o <strong>inicio</strong> para continuar</span>
    </motion.div>
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
  const endRef                   = useRef<HTMLDivElement>(null);

  // ── Geolocalización (browser GPS) ───────────────────────────────────────────
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  // ── Flujo de registro conversacional ────────────────────────────────────────
  const [regPhase, setRegPhase]   = useState<RegPhase | null>(null);
  const [regData, setRegData]     = useState<RegData>({ name: "", dni: "", phone: "", email: "" });
  const [chatInitialized, setChatInitialized] = useState(false);

  // ── Mejora 1: auto-start ─────────────────────────────────────────────────────
  const [autoStarting, setAutoStarting] = useState(false);

  // ── Mejora 2: welcome back ───────────────────────────────────────────────────
  const [welcomeBack, setWelcomeBack] = useState<WelcomeBack | null>(null);

  // ── Guardar historial en localStorage al cambiar los mensajes ────────────────
  useEffect(() => {
    if (welcomeBack !== null) return; // no sobreescribir mientras se muestra la pantalla de bienvenida
    const saveable = messages.filter((m) => !m.pending && m.content.length > 0);
    if (saveable.length === 0) return;
    localStorage.setItem(LS_HISTORY, JSON.stringify(saveable));
    localStorage.setItem(LS_SAVED_AT, Date.now().toString());
  }, [messages, welcomeBack]);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const hasConsent = ConsentModal.hasConsent();
    setConsent(hasConsent);
    const stored = localStorage.getItem(LS_SESSION);
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
      const raw = localStorage.getItem(LS_HISTORY);
      if (raw) savedMessages = JSON.parse(raw);
    } catch {}

    if (savedMessages.length > 0) {
      // Hay historial → mostrar pantalla de bienvenida de regreso
      const savedName   = localStorage.getItem(LS_CITIZEN_NAME) || "";
      const savedPoints = localStorage.getItem(LS_CITIZEN_POINTS);
      const savedAt     = parseInt(localStorage.getItem(LS_SAVED_AT) || "0");
      setWelcomeBack({
        name:   savedName,
        points: savedPoints ? parseInt(savedPoints) : null,
        savedAt,
      });
    } else {
      const regDone = localStorage.getItem(LS_REG_DONE);
      if (regDone) {
        setChatInitialized(true);
        setRegPhase("done");
      } else {
        autoStartRegistrationFlow();
      }
    }
  }

  // ── Solicitar GPS del navegador (silencioso si se deniega) ──────────────────
  function requestGeoLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocation({
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {}
    );
  }

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
      const raw = localStorage.getItem(LS_HISTORY);
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
    localStorage.removeItem(LS_HISTORY);
    localStorage.removeItem(LS_SAVED_AT);
    localStorage.removeItem(LS_SESSION);
    localStorage.removeItem(LS_REG_DONE);
    setSessionId(null);
    setWelcomeBack(null);
    setRegPhase(null);
    setChatInitialized(false);
    setMessages([]);
    autoStartRegistrationFlow();
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
            headers: {
              "Content-Type": "application/json",
              ...(tenant ? { "X-Tenant": tenant } : {}),
            },
            body: JSON.stringify({
              name:            regData.name,
              dni:             regData.dni,
              phone_whatsapp:  regData.phone,
              email:           email || null,
              visitor_uuid:    getCookieValue("politicos_visitor_id"),
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
            localStorage.setItem(LS_CITIZEN_NAME,   regData.name);
            localStorage.setItem(LS_CITIZEN_POINTS, pts.toString());
            addBotMsg(
              `🎉 ¡Listo, ${regData.name.split(" ")[0]}! Quedaste registrado/a y ganaste **${pts} puntos** de participación.\n\nTu código de referido es **${code}** — compártelo y gana 100 puntos más por cada vecino que se registre.`,
              [
                { label: "📋 Ver propuestas",  value: "Muéstrame las propuestas del candidato" },
                { label: "🗺️ Mi distrito",     value: "¿Qué propuestas hay para mi zona?" },
              ]
            );
            localStorage.setItem(LS_REG_DONE, "done");
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
    localStorage.setItem(LS_REG_DONE, "skipped");
    setChatInitialized(true);
    setRegPhase("done");
  }

  // ── Payload para el backend ──────────────────────────────────────────────────

  const buildPayload = (text: string) => ({
    message:     text,
    session_id:  sessionId,
    consent:     consent ?? false,
    initialized: chatInitialized,
    ...(geoLocation ? { lat: geoLocation.lat, lng: geoLocation.lng, accuracy: geoLocation.accuracy } : {}),
  });

  // ── Streaming ─────────────────────────────────────────────────────────────────

  const sendStreaming = async (text: string, aiId: string): Promise<boolean> => {
    try {
      const tenant = resolveTenantSlug();
      const r = await fetch(`${API}/chat/stream`, {
        method: "POST",
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
                localStorage.setItem(LS_SESSION, payload.sessionId);
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
              if (payload.mode) setAssistantMode(payload.mode);
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
        localStorage.setItem(LS_SESSION, data.sessionId);
      }
      setMessages((m) =>
        m.map((x) =>
          x.id === aiId
            ? { ...x, content: data.reply ?? "Sin respuesta.", media: data.media ?? [], quickReplies: data.quickReplies ?? [], sources: data.pepa?.fuentes_citadas ?? undefined, pending: false }
            : x
        )
      );
      if (data.mode) setAssistantMode(data.mode);
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
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white flex flex-col">
      <LiveAlert />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-zinc-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-zinc-900">Asistente PoliticOS</h1>
            <AIBadge mode={assistantMode} />
          </div>
          <TenantLink href="/" className="text-sm text-zinc-600 hover:underline">Inicio</TenantLink>
        </div>
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
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-lg overflow-hidden">
              {/* Franja superior */}
              <div className="h-1.5 bg-gradient-to-r from-zinc-800 to-zinc-600" />

              <div className="px-6 py-7 flex flex-col gap-5">
                {/* Avatar + saludo */}
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-zinc-900 flex items-center justify-center text-2xl shadow-md">
                    🤖
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400 font-medium uppercase tracking-widest mb-0.5">
                      De vuelta
                    </p>
                    <h2 className="text-xl font-bold text-zinc-900">
                      {welcomeBack.name
                        ? `Bienvenido/a de nuevo, ${welcomeBack.name.split(" ")[0]}`
                        : "Bienvenido/a de nuevo"}
                    </h2>
                  </div>
                </div>

                {/* Info de la conversación anterior */}
                <div className="bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 flex flex-col gap-1.5">
                  <p className="text-sm text-zinc-700 font-medium">Tienes una conversación anterior</p>
                  <p className="text-xs text-zinc-400">
                    {welcomeBack.savedAt
                      ? `Del ${formatSavedDate(welcomeBack.savedAt)}`
                      : "Guardada recientemente"}
                  </p>
                  {welcomeBack.points !== null && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-amber-500 text-sm">⭐</span>
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
                    className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold py-3.5 px-5 rounded-xl transition-colors text-sm shadow-sm"
                  >
                    Continuar conversación
                    <ArrowRight size={16} />
                  </button>
                  <button
                    onClick={handleNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 text-zinc-700 font-medium py-3 px-5 rounded-xl border border-zinc-200 transition-colors text-sm"
                  >
                    <RotateCcw size={14} className="text-zinc-400" />
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
                className="text-center py-10 text-zinc-500"
              >
                <p className="text-base font-medium">Acepta las condiciones para comenzar a chatear.</p>
                <p className="text-xs mt-2 text-zinc-400">Soy un asistente entrenado con propuestas oficiales públicas.</p>
              </motion.div>
            )}

            {/* Mensajes */}
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-3 flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-zinc-900 text-white"
                        : "bg-white border border-zinc-200 text-zinc-800 shadow-sm"
                    }`}
                  >
                    {msg.pending ? (
                      <ThinkingAnimation />
                    ) : (
                      <>
                        {msg.content}
                        {msg.media && msg.media.length > 0 && msg.content.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2">
                            <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest mb-2">
                              Recursos relacionados
                            </p>
                            {msg.media.slice(0, 8).map((m, i) => (
                              <MediaBadge key={i} item={m} />
                            ))}
                          </div>
                        )}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest mb-1.5">
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
                </motion.div>
              ))}
            </AnimatePresence>

            {blocked && (
              <div className="mb-3">
                <BlockedBanner />
              </div>
            )}

            <div ref={endRef} />
          </main>

          {/* Composer */}
          <footer className="sticky bottom-0 bg-white border-t border-zinc-200 px-4 py-3">
            <div className="max-w-3xl mx-auto flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={inputPlaceholder()}
                disabled={inputDisabled}
                className="flex-1 px-4 py-3 border border-zinc-300 rounded-full focus:outline-none focus:ring-2 focus:ring-zinc-900 text-sm disabled:opacity-50"
              />
              <button
                onClick={send}
                disabled={inputDisabled || !input.trim()}
                className="bg-zinc-900 text-white font-medium px-5 rounded-full hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {streaming ? "..." : "Enviar"}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 text-center mt-1.5">
              IA basada en información pública. Verifica decisiones electorales en{" "}
              <a className="underline" href="https://infogob.jne.gob.pe" target="_blank" rel="noopener noreferrer">infogob.jne.gob.pe</a>
            </p>
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
