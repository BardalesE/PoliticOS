"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Play, Link as LinkIcon, X, ImageIcon, ShieldAlert, AlertTriangle } from "lucide-react";
import ConsentModal from "@/components/chat/ConsentModal";
import AIBadge from "@/components/chat/AIBadge";
import { LiveAlert } from "@/components/live/LiveAlert";
import { useCandidate } from "@/context/CandidateContext";
import { resolveTenantSlug } from "@/lib/api";

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
  role: "user" | "james";
  content: string;
  timestamp?: number;
  pending?: boolean;
  media?: MediaItem[];
  quickReplies?: QuickReply[];
}

interface OnboardingData {
  nombre: string;
  region: string;
  distrito: string;
  ocupacion: string;
  preocupacion: string;
  intencion_voto: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const REGIONES = [
  "Amazonas", "Áncash", "Apurímac", "Arequipa", "Ayacucho",
  "Cajamarca", "Callao", "Cusco", "Huancavelica", "Huánuco",
  "Ica", "Junín", "La Libertad", "Lambayeque", "Lima",
  "Loreto", "Madre de Dios", "Moquegua", "Pasco", "Piura",
  "Puno", "San Martín", "Tacna", "Tumbes", "Ucayali", "Extranjero",
];

const OCUPACIONES = [
  "Agricultor/a", "Comerciante", "Docente / Profesor/a",
  "Profesional independiente", "Empleado/a público/a",
  "Estudiante", "Ama/o de casa", "Emprendedor/a", "Otro",
];

const PREOCUPACIONES = [
  "Agua y saneamiento", "Vías y carreteras", "Salud pública",
  "Educación", "Empleo y economía", "Seguridad ciudadana", "Agricultura",
];

function buildIntenciones(candidateName: string) {
  return [
    `Voto seguro por ${candidateName}`,
    "Aún evaluando opciones",
    "Tengo dudas sobre mi voto",
    "Prefiero no decir",
  ];
}

const THINKING_STEPS = [
  "Analizando tu pregunta",
  "Extrayendo datos relevantes",
  "Consultando propuestas",
  "Procesando información",
  "Preparando respuesta",
];

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
          {/* Barra roja superior pulsante */}
          <div className="h-1 bg-red-600 animate-pulse" />

          <div className="px-6 py-6 flex flex-col items-center text-center gap-4">
            {/* Icono animado */}
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
              <h2 className="text-white text-lg font-bold mb-2">
                Mensaje inusual detectado
              </h2>
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

            <p className="text-zinc-600 text-[10px]">
              Este modal se cerrará automáticamente en unos segundos.
            </p>
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative flex flex-col items-center max-w-3xl w-full"
              >
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 text-white hover:bg-white/30"
                >
                  <X size={16} />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.title}
                  className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
                />
                {item.title && (
                  <p className="text-white/80 text-sm mt-3 text-center">{item.title}</p>
                )}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate max-w-[75%]">{item.title}</p>
                  <button onClick={() => setPreviewOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                    <X size={16} />
                  </button>
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-3xl"
              >
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 text-white hover:bg-white/30"
                >
                  <X size={16} />
                </button>
                <div className="bg-black rounded-2xl overflow-hidden shadow-2xl">
                  <p className="text-white text-sm font-medium px-4 py-3 border-b border-white/10 truncate">{item.title}</p>
                  {embedUrl ? (
                    <div className="relative" style={{ paddingTop: "56.25%" }}>
                      <iframe
                        src={embedUrl}
                        title={item.title}
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-white/60 text-sm mb-4">No se puede reproducir aquí directamente.</p>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-500 transition-colors"
                      >
                        <Play size={14} className="fill-white" />
                        Ver video
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
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl hover:bg-zinc-200 transition-colors"
    >
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

// ─── Helper: leer cookie ────────────────────────────────────────────────

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function mapVotingIntention(label: string): string {
  if (/seguro/i.test(label)) return "alta";
  if (/evaluando|opciones/i.test(label)) return "indeciso";
  if (/dud/i.test(label)) return "media";
  return "indeciso";
}

// ─── Tarjeta de registro ciudadano (aparece tras el onboarding) ──────────

type RegistrationResult = { points: number; referral_code: string; share_url: string; status: string };

function RegistrationCard({
  prefillName,
  prefillDistrict,
  occupation,
  votingIntention,
  visitorUuid,
  onDone,
}: {
  prefillName: string;
  prefillDistrict: string;
  occupation: string;
  votingIntention: string;
  visitorUuid: string | null;
  onDone: (result: RegistrationResult | null) => void;
}) {
  const [name, setName]     = useState(prefillName);
  const [phone, setPhone]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [error, setError]   = useState("");
  const [copied, setCopied] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

  async function submit() {
    if (!phone.trim() || !name.trim()) { setError("Ingresa tu nombre y WhatsApp."); return; }
    setLoading(true);
    setError("");
    try {
      const tenant = resolveTenantSlug();
      const r = await fetch(`${API}/citizen/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tenant ? { "X-Tenant": tenant } : {}),
        },
        body: JSON.stringify({
          name,
          phone_whatsapp: phone.trim(),
          district:          prefillDistrict || null,
          occupation:        occupation || null,
          voting_intention:  mapVotingIntention(votingIntention),
          visitor_uuid:      visitorUuid,
          source:            "chat",
          consent:           true,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.message ?? "Error al registrar. Intenta de nuevo.");
        return;
      }
      setResult({ points: data.points, referral_code: data.referral_code, share_url: data.share_url, status: data.status });
    } catch {
      setError("No se pudo conectar. Intenta más tarde.");
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    if (!result?.referral_code) return;
    navigator.clipboard.writeText(result.referral_code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (result) {
    const isNew = result.status === "registered";
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-emerald-200 rounded-2xl shadow-sm p-5 my-3"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <span className="text-emerald-600 text-lg">✓</span>
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900">
              {isNew ? "¡Registro exitoso!" : "¡Bienvenido de nuevo!"}
            </p>
            <p className="text-xs text-zinc-500">
              {isNew ? `Ganaste ${result.points} puntos de participación` : "Tu perfil fue actualizado."}
            </p>
          </div>
        </div>
        {result.referral_code && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 mb-3">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
              Tu código de referido
            </p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-mono font-bold text-zinc-900 tracking-widest">{result.referral_code}</span>
              <button
                onClick={copyCode}
                className="ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 transition-colors px-2 py-1 rounded-lg border border-zinc-200 hover:border-zinc-400"
              >
                {copied ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Comparte este código y gana <strong>100 puntos</strong> por cada persona que se registre.
            </p>
          </div>
        )}
        <button
          onClick={() => onDone(result)}
          className="w-full bg-zinc-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-zinc-800 transition-colors"
        >
          Continuar al chat →
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 my-3"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-zinc-900">Regístrate y gana puntos</p>
          <p className="text-xs text-zinc-500">Únete como ciudadano activo de la campaña.</p>
        </div>
        <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <span className="text-amber-600 font-bold text-sm">50</span>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre completo"
          className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder-zinc-400"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="WhatsApp (Ej: 51987654321)"
          className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder-zinc-400"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={loading || !phone.trim() || !name.trim()}
          className="flex-1 bg-zinc-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          {loading ? "Registrando..." : "Registrarme →"}
        </button>
        <button
          onClick={() => onDone(null)}
          className="px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          Omitir
        </button>
      </div>

      <p className="text-[10px] text-zinc-400 mt-2 text-center">
        Tu WhatsApp solo se usa para comunicaciones de campaña. Ley 29733 aplicable.
      </p>
    </motion.div>
  );
}

// ─── Formulario de onboarding inicial ────────────────────────────────────────

function OnboardingCard({ onSubmit, candidateName }: { onSubmit: (data: OnboardingData) => void; candidateName: string }) {
  const [form, setForm] = useState<OnboardingData>({
    nombre: "", region: "", distrito: "", ocupacion: "", preocupacion: "", intencion_voto: "",
  });
  const [step, setStep] = useState(0); // 0=nombre, 1=resto, 2=done

  const FIELDS: Array<{ key: keyof OnboardingData; label: string; placeholder?: string; options?: string[] }> = [
    { key: "nombre",        label: "¿Cuál es tu nombre?",                  placeholder: "Tu nombre completo" },
    { key: "region",        label: "¿De qué región del Perú eres?",        options: REGIONES      },
    { key: "distrito",      label: "¿En qué ciudad o distrito vives?",     placeholder: "Ej: Lima, Cajamarca, Niepos…" },
    { key: "ocupacion",     label: "¿A qué te dedicas?",                   options: OCUPACIONES   },
    { key: "preocupacion",  label: "¿Qué tema te preocupa más?",           options: PREOCUPACIONES },
    { key: "intencion_voto",label: "¿Cómo está tu intención de voto?",     options: buildIntenciones(candidateName) },
  ];

  const current = FIELDS[step];
  const isLast  = step === FIELDS.length - 1;

  function next() {
    if (!form[current.key]) return;
    if (isLast) { onSubmit(form); return; }
    setStep((s) => s + 1);
  }

  function selectOption(val: string) {
    setForm((f) => ({ ...f, [current.key]: val }));
    // auto-advance on click for option lists
    setTimeout(() => {
      if (isLast) { onSubmit({ ...form, [current.key]: val }); }
      else setStep((s) => s + 1);
    }, 180);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 my-3"
    >
      {/* Progreso */}
      <div className="flex gap-1 mb-4">
        {FIELDS.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-zinc-900" : "bg-zinc-100"}`} />
        ))}
      </div>

      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
        Pregunta {step + 1} de {FIELDS.length}
      </p>
      <p className="text-sm font-semibold text-zinc-900 mb-3">{current.label}</p>

      {current.options ? (
        <div className="flex flex-wrap gap-2">
          {current.options.map((opt) => (
            <button
              key={opt}
              onClick={() => selectOption(opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                form[current.key] === opt
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={form[current.key]}
            onChange={(e) => setForm((f) => ({ ...f, [current.key]: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && next()}
            placeholder={current.placeholder}
            autoFocus
            className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder-zinc-400"
          />
          <button
            onClick={next}
            disabled={!form[current.key].trim()}
            className="px-4 py-2.5 bg-zinc-900 text-white text-sm rounded-xl disabled:opacity-40 hover:bg-zinc-800 transition-colors font-medium"
          >
            {isLast ? "Comenzar" : "Siguiente"}
          </button>
        </div>
      )}

      <button
        onClick={() => {
          if (isLast) onSubmit(form);
          else setStep((s) => s + 1);
        }}
        className="mt-3 text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
      >
        Omitir esta pregunta →
      </button>
    </motion.div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ChatPage() {
  const { profile }                   = useCandidate();
  const shortName                     = profile.name.split(" ")[0];
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [sessionId, setSessionId]     = useState<string | null>(null);
  const [consent, setConsent]         = useState<boolean | null>(null);
  const [declared, setDeclared]       = useState<Record<string, string>>({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showNonsense, setShowNonsense] = useState(false);
  const [blocked, setBlocked]         = useState(false);
  const [showRegister, setShowRegister]   = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasConsent = ConsentModal.hasConsent();
    setConsent(hasConsent);
    const stored = localStorage.getItem("politicos_session_id");
    if (stored) setSessionId(stored);

    // Mostrar onboarding si: aceptó consentimiento Y no lo completó antes
    const doneOnboarding = localStorage.getItem("politicos_onboarding_v1") === "done";
    if (hasConsent && !doneOnboarding) setShowOnboarding(true);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showOnboarding]);

  const onConsentResult = (accepted: boolean) => {
    setConsent(accepted);
    if (accepted) {
      const doneOnboarding = localStorage.getItem("politicos_onboarding_v1") === "done";
      if (!doneOnboarding) setShowOnboarding(true);
    }
  };

  const handleOnboardingSubmit = (data: OnboardingData) => {
    const filled: Record<string, string> = {};
    Object.entries(data).forEach(([k, v]) => { if (v) filled[k] = v; });
    setDeclared(filled);
    localStorage.setItem("politicos_onboarding_v1", "done");
    setShowOnboarding(false);
    setOnboardingData(data);

    const name = data.nombre ? data.nombre.split(" ")[0] : "ciudadano/a";
    const lugar = data.distrito || data.region || null;
    const greet: ChatMessage = {
      id: `greet-${Date.now()}`,
      role: "james",
      content: `¡Mucho gusto, ${name}${lugar ? ` desde ${lugar}` : ""}! Para personalizarte mejor la experiencia, puedes registrarte con tu WhatsApp y ganar puntos de participación. O si prefieres, omite este paso y empieza a chatear directamente.`,
    };
    setMessages([greet]);
    setShowRegister(true);
  };

  const buildPayload = (text: string) => ({
    message: text,
    session_id: sessionId,
    consent: consent ?? false,
    declared,
  });

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
                localStorage.setItem("politicos_session_id", payload.sessionId);
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
              setBlocked(payload.blocked ?? false);
              if (payload.nonsense || payload.attackDetected) {
                setShowNonsense(true);
              }
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
        localStorage.setItem("politicos_session_id", data.sessionId);
      }
      setMessages((m) =>
        m.map((x) =>
          x.id === aiId
            ? {
                ...x,
                content: data.reply ?? "Sin respuesta.",
                media: data.media ?? [],
                quickReplies: data.quickReplies ?? [],
                pending: false,
              }
            : x
        )
      );
      setBlocked(data.blocked ?? false);
      if (data.nonsense || data.attackDetected) setShowNonsense(true);
      return true;
    } catch {
      return false;
    }
  };

  const sendQuickReply = (value: string) => {
    setInput(value);
    // pequeño delay para que el input se actualice visualmente antes de enviar
    setTimeout(() => {
      setInput("");
      if (streaming) return;
      setStreaming(true);
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: value, timestamp: Date.now() };
      setMessages((m) => [...m, userMsg]);
      const aiId = `a-${Date.now()}`;
      setMessages((m) => [...m, { id: aiId, role: "james", content: "", pending: true }]);
      (async () => {
        try {
          const streamed = await sendStreaming(value, aiId);
          if (!streamed) await sendFallback(value, aiId);
        } finally {
          setStreaming(false);
        }
      })();
    }, 80);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setStreaming(true);

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, timestamp: Date.now() };
    setMessages((m) => [...m, userMsg]);

    const aiId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: aiId, role: "james", content: "", pending: true }]);

    try {
      const streamed = await sendStreaming(text, aiId);
      if (!streamed) {
        const fallback = await sendFallback(text, aiId);
        if (!fallback) {
          setMessages((m) =>
            m.map((x) =>
              x.id === aiId
                ? { ...x, content: "En este momento no puedo responder. El servicio estará disponible pronto.", pending: false }
                : x
            )
          );
        }
      }
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white flex flex-col">
      <LiveAlert />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-zinc-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-zinc-900">Asistente PoliticOS</h1>
            <AIBadge />
          </div>
          <a href="/" className="text-sm text-zinc-600 hover:underline">Inicio</a>
        </div>
      </header>

      {/* Chat */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5">
        {/* Estado vacío antes del onboarding */}
        {messages.length === 0 && !showOnboarding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-10 text-zinc-500"
          >
            <p className="text-base font-medium">Hazme una pregunta sobre el plan de gobierno.</p>
            <p className="text-xs mt-2 text-zinc-400">Soy un asistente entrenado con propuestas oficiales públicas.</p>
          </motion.div>
        )}

        {/* Mensaje de bienvenida con onboarding */}
        {showOnboarding && (
          <div className="mb-3">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start mb-2"
            >
              <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-white border border-zinc-200 text-zinc-800 shadow-sm">
                Hola, soy el asistente virtual oficial de <strong>{profile.name}</strong>, {profile.title ? `${profile.title} · ` : ""}{profile.location}. Antes de comenzar, me gustaría conocerte un poco para personalizar mejor mis respuestas.
              </div>
            </motion.div>
            <OnboardingCard onSubmit={handleOnboardingSubmit} candidateName={shortName} />
          </div>
        )}

        {/* Registro ciudadano (tras onboarding) */}
        {showRegister && onboardingData && (
          <RegistrationCard
            prefillName={onboardingData.nombre}
            prefillDistrict={onboardingData.distrito || onboardingData.region}
            occupation={onboardingData.ocupacion}
            votingIntention={onboardingData.intencion_voto}
            visitorUuid={getCookieValue("politicos_visitor_id")}
            onDone={(result) => {
              setShowRegister(false);
              if (result) {
                const pts = result.points;
                const successMsg: ChatMessage = {
                  id: `reg-ok-${Date.now()}`,
                  role: "james",
                  content: `🎉 ¡Registro confirmado! Tienes ${pts} puntos de participación. Tu código de referido es **${result.referral_code}** — compártelo y gana 100 puntos extra por cada persona que se registre. ¿Qué te gustaría saber sobre las propuestas?`,
                  quickReplies: [
                    { label: "📋 Ver propuestas", value: "Muéstrame las propuestas de gobierno" },
                    { label: "🗺️ Por distrito",   value: "¿Qué propuestas hay para mi distrito?" },
                  ],
                };
                setMessages((m) => [...m, successMsg]);
              }
            }}
          />
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
                  </>
                )}
              </div>
              {!msg.pending && msg.role === "james" && msg.quickReplies && msg.quickReplies.length > 0 && (
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
            placeholder={
              showOnboarding
                ? "Completa el formulario para comenzar..."
                : showRegister
                ? "Completa o salta el registro para chatear..."
                : blocked
                ? "Escribe 'hola', 'menú' o 'inicio' para continuar..."
                : "Escribe tu pregunta..."
            }
            disabled={streaming || showOnboarding || showRegister}
            className="flex-1 px-4 py-3 border border-zinc-300 rounded-full focus:outline-none focus:ring-2 focus:ring-zinc-900 text-sm disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim() || showOnboarding || showRegister}
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
