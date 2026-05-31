"use client";

import { useEffect, useState } from "react";
import {
  Save, Loader2, CheckCircle, AlertCircle, Bot, MessageCircle,
  Info, RotateCcw, Wifi, WifiOff, RefreshCw, Clock,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCandidate } from "@/context/CandidateContext";
import { adminApiExtended, type AiSetting } from "@/lib/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { FormField } from "@/components/admin/FormField";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: "groq",   label: "Groq (Llama)",      desc: "Rápido y gratuito · recomendado" },
  { value: "claude", label: "Anthropic Claude",   desc: "Alta calidad · mayor costo"      },
  { value: "openai", label: "OpenAI GPT",         desc: "Amplia compatibilidad"           },
] as const;

const MODELS: Record<string, string[]> = {
  groq:   ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
  claude: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-7"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
};

const PRESET_COLORS = [
  "#25D366", "#128C7E", "#22C55E", "#3B82F6", "#8B5CF6",
  "#EC4899", "#F59E0B", "#EF4444", "#0EA5E9", "#6B7280",
];

const EMPTY: Partial<AiSetting> = {
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  max_tokens: 600,
  temperature: 0.65,
  fallback_provider: "claude",
  system_prompt: "",
  chat_subtitle:     "IA · 24/7",
  chat_btn_text:     "",
  chat_btn_shape:    "pill",
  chat_btn_color:    "",
  chat_btn_size:     "md",
  chat_btn_position: "bottom-right",
};

// ─── WhatsApp icon (SVG inline) ───────────────────────────────────────────────

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─── Live FAB Preview ─────────────────────────────────────────────────────────

function FabPreview({ form, firstName }: { form: Partial<AiSetting>; firstName: string }) {
  const label    = form.chat_btn_text || `Conversar con ${firstName}`;
  const subtitle = form.chat_subtitle || "IA · 24/7";
  const size     = form.chat_btn_size || "md";
  const isCircle = form.chat_btn_shape === "circle";
  const color    = form.chat_btn_color || "";

  const iconSize  = size === "sm" ? "w-5 h-5" : size === "lg" ? "w-7 h-7" : "w-6 h-6";
  const circleEl  = size === "sm" ? "w-10 h-10" : size === "lg" ? "w-14 h-14" : "w-12 h-12";
  const pad       = size === "sm" ? "px-3 py-2" : size === "lg" ? "px-5 py-4" : "px-4 py-3";
  const txtSize   = size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";
  const subSize   = size === "sm" ? "text-[10px]" : "text-xs";

  const bgStyle: React.CSSProperties = color
    ? { backgroundColor: color, boxShadow: `0 0 0 4px ${color}40` }
    : {};

  const alignClass = form.chat_btn_position === "bottom-left" ? "justify-start" : "justify-end";

  if (isCircle) {
    return (
      <div className={`flex ${alignClass}`}>
        <div style={bgStyle}
          className={`${circleEl} rounded-full flex items-center justify-center text-white shadow-lg select-none cursor-default ${!color ? "bg-chat-500 ring-4 ring-chat-500/25" : ""}`}>
          <WhatsAppIcon className={iconSize} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${alignClass}`}>
      <div style={bgStyle}
        className={`flex items-center gap-3 rounded-full text-white shadow-lg select-none cursor-default ${pad} ${!color ? "bg-chat-500 ring-4 ring-chat-500/25" : ""}`}>
        <WhatsAppIcon className={`${iconSize} shrink-0`} />
        <div className="leading-tight">
          <p className={`font-extrabold ${txtSize}`}>{label}</p>
          <p className={`opacity-75 font-semibold ${subSize}`}>{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Card option selector ─────────────────────────────────────────────────────

function CardOption<T extends string>({
  value, current, label, desc, onClick,
}: { value: T; current: T | undefined; label: string; desc?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "text-left p-3 rounded-lg border-2 transition-all",
        current === value ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300 bg-white"
      )}>
      <p className="text-sm font-bold text-ink-800">{label}</p>
      {desc && <p className="text-[11px] text-ink-400 mt-0.5 font-medium">{desc}</p>}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── AI Status types ──────────────────────────────────────────────────────────

type ProviderStatus = "ok" | "rate_limited" | "unauthorized" | "no_credits" | "offline" | "error" | "testing" | "dns_error";

interface ProviderResult {
  provider: string;
  status: ProviderStatus;
  message: string;
  latency: number;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string; tip?: string }> = {
  ok:           { label: "Funcionando",             icon: <CheckCircle size={13} />, cls: "bg-green-50 border-green-200 text-green-700" },
  rate_limited: { label: "Límite agotado (429)",    icon: <Clock size={13} />,       cls: "bg-yellow-50 border-yellow-200 text-yellow-700",
                  tip: "El cupo de solicitudes se agotó. Espera unos minutos o activa un proveedor de respaldo." },
  unauthorized: { label: "API key inválida (401)",  icon: <WifiOff size={13} />,     cls: "bg-red-50 border-red-200 text-red-700",
                  tip: "Edita el archivo .env y agrega una clave válida, luego ejecuta: php artisan config:clear" },
  no_credits:   { label: "Sin créditos (402)",      icon: <AlertCircle size={13} />, cls: "bg-orange-50 border-orange-200 text-orange-700",
                  tip: "La cuenta del proveedor no tiene saldo. Recarga créditos en su panel." },
  offline:      { label: "Sin conexión",            icon: <WifiOff size={13} />,     cls: "bg-gray-50 border-gray-200 text-gray-600" },
  dns_error:    { label: "Error de red / DNS",      icon: <WifiOff size={13} />,     cls: "bg-gray-50 border-gray-200 text-gray-600",
                  tip: "El servidor no puede conectarse a la API. Verifica el acceso a internet del servidor o el firewall." },
  error:        { label: "Error",                   icon: <AlertCircle size={13} />, cls: "bg-red-50 border-red-200 text-red-700" },
  testing:      { label: "Probando…",               icon: <Loader2 size={13} className="animate-spin" />, cls: "bg-blue-50 border-blue-200 text-blue-600" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiSettingsPage() {
  const { token }   = useAuth();
  const { profile } = useCandidate();
  const firstName   = profile.name.split(" ")[0];

  const [form, setForm]       = useState<Partial<AiSetting>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [testResults, setTestResults]   = useState<ProviderResult[] | null>(null);
  const [testLoading, setTestLoading]   = useState(false);
  const [testTime, setTestTime]         = useState<string | null>(null);
  const [noInternet, setNoInternet]     = useState(false);
  const [netNote, setNetNote]           = useState<string | null>(null);

  const runTest = async () => {
    if (!token || testLoading) return;
    setTestLoading(true);
    setTestResults(null);
    setNoInternet(false);
    setNetNote(null);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
      const r = await fetch(`${API}/admin/ai-settings/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await r.json();
      if (data.internet === false) {
        setNoInternet(true);
        setNetNote(data.note ?? "El servidor no tiene acceso a internet.");
      } else {
        setTestResults(data.providers ?? []);
      }
      setTestTime(new Date().toLocaleTimeString("es-PE"));
    } catch {
      setTestResults([{ provider: "—", status: "error", message: "No se pudo conectar al servidor Laravel", latency: 0 }]);
    } finally {
      setTestLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    adminApiExtended.aiSettings
      .get(token)
      .then((s) => setForm(s))
      .catch(() => setError("No se pudo cargar la configuración."))
      .finally(() => setLoading(false));
  }, [token]);

  function set<K extends keyof AiSetting>(key: K, value: AiSetting[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const updated = await adminApiExtended.aiSettings.update(token, form);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Error al guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    );
  }

  const modelList = MODELS[form.provider ?? "groq"] ?? [];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Configuración del chatbot"
        subtitle="Modelo de IA, prompt y diseño del botón flotante."
      >
        <button form="ai-form" type="submit" disabled={saving}
          className="btn-pp-primary flex items-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Guardando…" : saved ? "¡Guardado!" : "Guardar cambios"}
        </button>
      </PageHeader>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle size={14} className="shrink-0" /> {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-xl text-green-700 text-sm">
          <CheckCircle size={14} className="shrink-0" /> Configuración guardada. Los cambios aplican de inmediato.
        </div>
      )}

      <form id="ai-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── Columna principal ── */}
          <div className="xl:col-span-2 space-y-6">

            {/* Proveedor y modelo */}
            <section className="bg-white rounded-xl border border-ink-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-ink-100 flex items-center gap-2">
                <Bot size={16} className="text-brand-500" />
                <h2 className="font-extrabold text-ink-800 text-sm uppercase tracking-wide">Modelo de IA</h2>
              </div>
              <div className="p-6 space-y-5">

                <div>
                  <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Proveedor principal</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {PROVIDERS.map((p) => (
                      <CardOption key={p.value} value={p.value} current={form.provider} label={p.label} desc={p.desc}
                        onClick={() => {
                          set("provider", p.value);
                          const list = MODELS[p.value];
                          if (list?.length) set("model", list[0]);
                        }} />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Modelo específico</label>
                  <input type="text" value={form.model ?? ""}
                    onChange={(e) => set("model", e.target.value)}
                    className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm font-mono text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    placeholder="ej. llama-3.3-70b-versatile" />
                  {modelList.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {modelList.map((m) => (
                        <button key={m} type="button" onClick={() => set("model", m)}
                          className={cn(
                            "text-[11px] font-mono px-2 py-1 rounded border transition-colors",
                            form.model === m ? "border-brand-400 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500 hover:border-ink-300"
                          )}>
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                      Tokens máximos <span className="normal-case font-medium text-ink-400">(respuesta)</span>
                    </label>
                    <input type="number" min={100} max={4096} step={50}
                      value={form.max_tokens ?? 600}
                      onChange={(e) => set("max_tokens", Number(e.target.value))}
                      className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm font-mono text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    <p className="text-[11px] text-ink-400 mt-1 font-medium">100–4096 · Recomendado: 600</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                      Temperatura <span className="normal-case font-medium text-ink-400">— creatividad</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={1} step={0.05}
                        value={form.temperature ?? 0.65}
                        onChange={(e) => set("temperature", Number(e.target.value))}
                        className="flex-1 accent-brand-500" />
                      <span className="text-sm font-bold text-ink-700 w-10 text-right tabular-nums">
                        {(form.temperature ?? 0.65).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-ink-400 font-medium mt-1">
                      <span>Preciso (0.0)</span><span>Creativo (1.0)</span>
                    </div>
                  </div>
                </div>

                <FormField as="select" label="Proveedor de respaldo (si el principal falla)"
                  value={form.fallback_provider ?? ""}
                  onChange={(e) => set("fallback_provider", (e.target.value || null) as AiSetting["fallback_provider"])}>
                  <option value="">Sin respaldo</option>
                  {PROVIDERS.filter((p) => p.value !== form.provider).map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </FormField>

              </div>
            </section>

            {/* System prompt */}
            <section className="bg-white rounded-xl border border-ink-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot size={16} className="text-brand-500" />
                  <h2 className="font-extrabold text-ink-800 text-sm uppercase tracking-wide">Prompt del sistema</h2>
                </div>
                <span className="text-[11px] text-ink-400 font-semibold">{(form.system_prompt ?? "").length} chars</span>
              </div>
              <div className="p-6">
                <div className="flex items-start gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 font-semibold leading-relaxed">
                    Define la personalidad y restricciones del asistente. Deja vacío para usar el prompt del código.
                  </p>
                </div>
                <textarea value={form.system_prompt ?? ""}
                  onChange={(e) => set("system_prompt", e.target.value)}
                  rows={14}
                  placeholder="Deja vacío para usar el prompt por defecto…"
                  className="w-full border border-ink-200 rounded-lg px-3 py-2.5 text-xs font-mono text-ink-700 resize-y focus:outline-none focus:ring-2 focus:ring-brand-400 leading-relaxed" />
                {form.system_prompt && (
                  <button type="button" onClick={() => set("system_prompt", "")}
                    className="mt-2 flex items-center gap-1.5 text-xs text-ink-400 hover:text-red-500 font-semibold transition-colors">
                    <RotateCcw size={12} /> Restaurar prompt por defecto
                  </button>
                )}
              </div>
            </section>

            {/* Botón flotante */}
            <section className="bg-white rounded-xl border border-ink-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-ink-100 flex items-center gap-2">
                <MessageCircle size={16} className="text-chat-500" />
                <h2 className="font-extrabold text-ink-800 text-sm uppercase tracking-wide">Diseño del botón flotante</h2>
              </div>
              <div className="p-6 space-y-6">

                {/* Forma */}
                <div>
                  <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Forma</label>
                  <div className="grid grid-cols-2 gap-3">
                    <CardOption value="pill"   current={form.chat_btn_shape} label="Píldora" desc="Ícono + texto + subtítulo" onClick={() => set("chat_btn_shape", "pill")} />
                    <CardOption value="circle" current={form.chat_btn_shape} label="Círculo" desc="Solo el ícono de WhatsApp"  onClick={() => set("chat_btn_shape", "circle")} />
                  </div>
                </div>

                {/* Tamaño */}
                <div>
                  <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Tamaño</label>
                  <div className="grid grid-cols-3 gap-3">
                    <CardOption value="sm" current={form.chat_btn_size} label="Pequeño" onClick={() => set("chat_btn_size", "sm")} />
                    <CardOption value="md" current={form.chat_btn_size} label="Mediano" desc="(default)" onClick={() => set("chat_btn_size", "md")} />
                    <CardOption value="lg" current={form.chat_btn_size} label="Grande"  onClick={() => set("chat_btn_size", "lg")} />
                  </div>
                </div>

                {/* Posición */}
                <div>
                  <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Posición</label>
                  <div className="grid grid-cols-2 gap-3">
                    <CardOption value="bottom-right" current={form.chat_btn_position} label="Abajo derecha" desc="(default)" onClick={() => set("chat_btn_position", "bottom-right")} />
                    <CardOption value="bottom-left"  current={form.chat_btn_position} label="Abajo izquierda" onClick={() => set("chat_btn_position", "bottom-left")} />
                  </div>
                </div>

                {/* Color */}
                <div>
                  <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                    Color de fondo <span className="normal-case font-medium text-ink-400">(vacío = verde WhatsApp)</span>
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input type="color"
                      value={form.chat_btn_color || "#25D366"}
                      onChange={(e) => set("chat_btn_color", e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-ink-200 p-0.5" />
                    <input type="text" maxLength={20}
                      value={form.chat_btn_color ?? ""}
                      onChange={(e) => set("chat_btn_color", e.target.value)}
                      placeholder="ej. #25D366  (vacío = default)"
                      className="flex-1 min-w-0 border border-ink-200 rounded-lg px-3 py-2 text-sm font-mono text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    {form.chat_btn_color && (
                      <button type="button" onClick={() => set("chat_btn_color", "")}
                        className="px-3 py-2 rounded-lg border border-ink-200 text-xs font-semibold text-ink-400 hover:text-red-500 hover:border-red-200 transition-colors">
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => set("chat_btn_color", c)} title={c}
                        style={{ backgroundColor: c }}
                        className={cn(
                          "w-7 h-7 rounded-full border-2 transition-all",
                          form.chat_btn_color === c ? "border-ink-800 scale-110" : "border-white ring-1 ring-ink-200"
                        )} />
                    ))}
                  </div>
                </div>

                {/* Texto y subtítulo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                      Texto del botón <span className="normal-case font-medium text-ink-400">(vacío = auto)</span>
                    </label>
                    <input type="text" maxLength={100}
                      value={form.chat_btn_text ?? ""}
                      onChange={(e) => set("chat_btn_text", e.target.value)}
                      placeholder={`Conversar con ${firstName}`}
                      className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Subtítulo</label>
                    <input type="text" maxLength={100}
                      value={form.chat_subtitle ?? ""}
                      onChange={(e) => set("chat_subtitle", e.target.value)}
                      placeholder="IA · 24/7"
                      className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
                </div>

              </div>
            </section>

          </div>

          {/* ── Columna lateral: preview + resumen ── */}
          <div className="space-y-6">

            {/* Live preview */}
            <section className="bg-white rounded-xl border border-ink-200 shadow-sm overflow-hidden sticky top-6">
              <div className="px-6 py-4 border-b border-ink-100">
                <h2 className="font-extrabold text-ink-800 text-sm uppercase tracking-wide">Vista previa en vivo</h2>
                <p className="text-[11px] text-ink-400 font-medium mt-0.5">Se actualiza al instante</p>
              </div>
              <div className="p-6 space-y-5">

                <div>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-3">
                    {form.chat_btn_shape === "circle" ? "Círculo" : "Escritorio (píldora)"}
                  </p>
                  <FabPreview form={form} firstName={firstName} />
                </div>

                {form.chat_btn_shape !== "circle" && (
                  <div>
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-3">Móvil (solo ícono)</p>
                    <div className={`flex ${form.chat_btn_position === "bottom-left" ? "justify-start" : "justify-end"}`}>
                      <div style={form.chat_btn_color ? { backgroundColor: form.chat_btn_color } : undefined}
                        className={cn(
                          "rounded-full flex items-center justify-center text-white shadow-lg",
                          form.chat_btn_size === "sm" ? "w-10 h-10" : form.chat_btn_size === "lg" ? "w-14 h-14" : "w-12 h-12",
                          !form.chat_btn_color && "bg-chat-500"
                        )}>
                        <WhatsAppIcon className={form.chat_btn_size === "sm" ? "w-5 h-5" : form.chat_btn_size === "lg" ? "w-7 h-7" : "w-6 h-6"} />
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </section>

            {/* Estado del proveedor */}
            <section className="bg-white rounded-xl border border-ink-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-ink-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi size={15} className="text-brand-500" />
                  <h2 className="font-extrabold text-ink-800 text-sm uppercase tracking-wide">Estado de la IA</h2>
                </div>
                <button
                  type="button"
                  onClick={runTest}
                  disabled={testLoading}
                  className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50 transition-colors"
                >
                  {testLoading
                    ? <Loader2 size={13} className="animate-spin" />
                    : <RefreshCw size={13} />}
                  {testLoading ? "Probando…" : "Probar ahora"}
                </button>
              </div>

              <div className="p-5 space-y-3">
                {!testResults && !testLoading && (
                  <p className="text-xs text-ink-400 font-medium text-center py-2">
                    Haz clic en "Probar ahora" para verificar si la IA está disponible y si los tokens no se han agotado.
                  </p>
                )}

                {testLoading && (
                  <div className="flex items-center gap-2 text-xs text-blue-600 font-medium py-2">
                    <Loader2 size={14} className="animate-spin" />
                    Probando proveedores en paralelo…
                  </div>
                )}

                {noInternet && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border bg-gray-50 border-gray-200 text-gray-700 text-xs font-semibold">
                    <WifiOff size={13} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Sin acceso a internet desde el servidor</p>
                      <p className="font-medium opacity-80 mt-0.5">{netNote}</p>
                      <p className="font-medium opacity-70 mt-1">
                        Solución: ejecuta <code className="font-mono bg-gray-100 px-1 rounded">ipconfig /flushdns</code> en cmd, reinicia Laragon, o revisa si un firewall/antivirus bloquea PHP.
                      </p>
                    </div>
                  </div>
                )}

                {testResults && testResults.map((r) => {
                  const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.error;
                  return (
                    <div key={r.provider} className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold ${cfg.cls}`}>
                      <span className="shrink-0 mt-0.5">{cfg.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold capitalize">{r.provider}</span>
                          {r.latency > 0 && r.status !== "dns_error" && (
                            <span className="text-[10px] font-mono opacity-60">{r.latency}ms</span>
                          )}
                        </div>
                        <p className="font-medium opacity-80 mt-0.5">{r.message}</p>
                        {cfg.tip && (
                          <p className="font-medium opacity-70 mt-1">{cfg.tip}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {testTime && (
                  <p className="text-[10px] text-ink-400 font-medium text-right">
                    Última prueba: {testTime}
                  </p>
                )}
              </div>
            </section>

            {/* Config summary */}
            <section className="bg-ink-50 rounded-xl border border-ink-200 p-5 space-y-3">
              <p className="text-xs font-extrabold text-ink-500 uppercase tracking-wider">Resumen IA</p>
              <dl className="space-y-2 text-sm">
                {[
                  ["Proveedor", form.provider ?? "—"],
                  ["Modelo",    form.model ?? "—"],
                  ["Tokens",    String(form.max_tokens ?? "—")],
                  ["Temp.",     (form.temperature ?? 0.65).toFixed(2)],
                  ["Respaldo",  form.fallback_provider ?? "Ninguno"],
                  ["Prompt",    form.system_prompt ? `${form.system_prompt.length} chars` : "Por defecto"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-ink-500 font-semibold shrink-0">{k}</dt>
                    <dd className="font-bold text-ink-800 truncate text-right font-mono text-xs">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

          </div>
        </div>
      </form>
    </div>
  );
}
