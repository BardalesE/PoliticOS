"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSuperAdmin } from "@/context/SuperAdminContext";
import {
  superadminApi, ApiError,
  type Tenant, type ProvisionPayload, type TenantStats, type TenantCredentials, type PlanFeatureSet,
} from "@/lib/api";
import {
  Plus, Pencil, Trash2, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Database, Users, FileText,
  MessageSquare, Zap, BarChart2, RefreshCw, Copy, Check,
  ExternalLink, AlertTriangle, KeyRound, Eye, EyeOff, Clock, ShieldAlert,
  CreditCard, Lock, Unlock, Save,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Tipos ────────────────────────────────────────────────────────────────

type Tab = "provision" | "manual";

type ProvisionForm = {
  slug: string; name: string; db_name: string;
  admin_email: string; admin_password: string;
  plan: "starter" | "pro" | "elite";
  db_host: string; db_user: string; db_password: string;
  showAdvanced: boolean;
};

type EditForm = { name: string; plan: "starter" | "pro" | "elite"; is_active: boolean };

const emptyProvision: ProvisionForm = {
  slug: "", name: "", db_name: "",
  admin_email: "", admin_password: "",
  plan: "starter",
  db_host: "127.0.0.1", db_user: "root", db_password: "",
  showAdvanced: false,
};

const PLANS = [
  { value: "starter", label: "Starter",  color: "text-zinc-400", bg: "bg-zinc-800" },
  { value: "pro",     label: "Pro",      color: "text-blue-400",  bg: "bg-blue-900/40" },
  { value: "elite",   label: "Elite",    color: "text-amber-400", bg: "bg-amber-900/30" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────

function planBadge(plan: string) {
  const p = PLANS.find((x) => x.value === plan) ?? PLANS[0];
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${p.color} ${p.bg}`}>
      {p.label.toUpperCase()}
    </span>
  );
}

function statusDot(active: boolean) {
  return active
    ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="Activo" />
    : <span className="inline-block w-2 h-2 rounded-full bg-zinc-600" title="Inactivo" />;
}

// ─── Componentes UI menores ───────────────────────────────────────────────

function Input({
  label, value, onChange, type = "text", placeholder = "", required = false,
  className = "", hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
  className?: string; hint?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100
                   placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1
                   focus:ring-emerald-500/20 transition font-mono"
      />
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100
                   focus:outline-none focus:border-emerald-500 transition cursor-pointer"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className="text-zinc-500 hover:text-zinc-300 transition ml-1">
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── Campo de credencial con reveal automático ────────────────────────────

function CredentialField({
  label, value, secret = false, badge,
}: {
  label: string; value: string | null; secret?: boolean; badge?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(!secret);
  const [copied, setCopied]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUrl = !!value && (value.startsWith("http://") || value.startsWith("https://"));

  function reveal() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 5000);
  }
  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function copy() {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        {badge}
      </div>
      <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5">
        <code className="flex-1 text-sm text-zinc-200 font-mono break-all min-w-0">
          {!value
            ? <span className="text-zinc-600 italic text-xs">Sin datos registrados</span>
            : secret && !visible ? "••••••••••••••••"
            : value}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          {isUrl && (
            <a
              href={value!}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir en nueva pestaña"
              className="text-zinc-500 hover:text-emerald-400 transition p-1 rounded"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {secret && value && (
            <button
              onClick={visible ? hide : reveal}
              title={visible ? "Ocultar" : "Revelar 5 segundos"}
              className="text-zinc-500 hover:text-zinc-300 transition p-1 rounded"
            >
              {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}
          {value && (
            <button onClick={copy} className="text-zinc-500 hover:text-zinc-300 transition p-1 rounded">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal de Credenciales ────────────────────────────────────────────────

function CredentialsModal({
  tenant, saKey, onClose,
}: {
  tenant: Tenant; saKey: string; onClose: () => void;
}) {
  const [creds, setCreds]       = useState<TenantCredentials | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetPass, setResetPass] = useState<string | null>(null);

  useEffect(() => {
    superadminApi.tenants.credentials(saKey, tenant.id)
      .then(setCreds)
      .catch((e: ApiError) => setError(e.message ?? "Error al cargar credenciales."))
      .finally(() => setLoading(false));
  }, [saKey, tenant.id]);

  async function handleReset() {
    if (!window.confirm(`¿Resetear la contraseña de "${tenant.slug}"?\nSe generará una nueva contraseña aleatoria de 16 caracteres.`)) return;
    setResetting(true);
    try {
      const result = await superadminApi.tenants.resetPassword(saKey, tenant.id);
      setResetPass(result.admin_password);
      const fresh = await superadminApi.tenants.credentials(saKey, tenant.id);
      setCreds(fresh);
    } catch (e) {
      alert((e as ApiError).message ?? "Error al resetear contraseña.");
    } finally {
      setResetting(false);
    }
  }

  function formatTs(iso: string) {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function actionLabel(action: string) {
    if (action === "viewed")         return "👁 Visto";
    if (action === "reset_password") return "🔄 Contraseña reseteada";
    return action;
  }

  const passwordBadge = creds && (
    creds.password_changed
      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400">
          CAMBIADA {creds.password_changed_at ? formatTs(creds.password_changed_at) : ""}
        </span>
      : <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">
          <ShieldAlert className="w-3 h-3" /> ORIGINAL
        </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="font-bold text-zinc-100 text-sm">Credenciales de acceso</h2>
              <p className="text-[11px] text-zinc-500 font-mono">{tenant.slug} · {tenant.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {creds && !loading && (
            <>
              {/* Banner post-reset */}
              {resetPass && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Contraseña reseteada — guárdala ahora
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-bold font-mono text-white">{resetPass}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(resetPass); }}
                      className="text-zinc-500 hover:text-emerald-400 transition p-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <CredentialField label="URL Panel Admin"     value={creds.admin_url} />
              <CredentialField label="URL Chatbot Público" value={creds.chatbot_url} />
              <CredentialField label="Email de acceso"     value={creds.admin_email} />
              <CredentialField
                label="Contraseña"
                value={resetPass ?? creds.admin_password}
                secret
                badge={passwordBadge}
              />

              {!creds.admin_email && (
                <p className="text-xs text-zinc-500 bg-zinc-800/60 rounded-lg px-3 py-2">
                  Este tenant fue provisionado antes de este módulo. No hay credenciales registradas.
                  Usa "Resetear contraseña" si conoces el email del admin.
                </p>
              )}

              {/* Reset button */}
              <button
                onClick={handleReset}
                disabled={resetting || !creds.admin_email}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-zinc-700
                           text-sm text-zinc-400 hover:text-amber-400 hover:border-amber-500/40 transition
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reseteando...</>
                  : <><RefreshCw className="w-3.5 h-3.5" /> Resetear contraseña</>}
              </button>

              {/* Audit log */}
              {creds.credential_log.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Historial de acceso
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {creds.credential_log.slice(0, 10).map((entry, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] bg-zinc-950 rounded-lg px-3 py-1.5 gap-3">
                        <span className="text-zinc-400 shrink-0">{actionLabel(entry.action)}</span>
                        <div className="flex items-center gap-3 text-zinc-600 min-w-0 overflow-hidden">
                          <span className="font-mono shrink-0">{entry.ip}</span>
                          <span className="truncate">{formatTs(entry.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Modal de Provisioning / Creación ─────────────────────────────────────

type CredsData = { email: string; password: string; slug: string; adminUrl: string; voterUrl: string };

function CredRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [visible, setVisible] = useState(!secret);
  const [copied, setCopied]   = useState(false);
  const isUrl = value.startsWith("http://") || value.startsWith("https://");
  function copy() { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  return (
    <div className="flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5">
      <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider w-20 shrink-0">{label}</span>
      <code className="flex-1 text-sm text-zinc-200 font-mono break-all">
        {secret && !visible ? "••••••••••••" : value}
      </code>
      <div className="flex items-center gap-1 shrink-0">
        {isUrl && (
          <a href={value} target="_blank" rel="noopener noreferrer"
             title="Abrir" className="text-zinc-500 hover:text-emerald-400 transition p-0.5">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {secret && (
          <button onClick={() => setVisible((v) => !v)} className="text-zinc-500 hover:text-zinc-300 transition text-xs px-1">
            {visible ? "ocultar" : "ver"}
          </button>
        )}
        <button onClick={copy} className="text-zinc-500 hover:text-zinc-300 transition">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function ProvisionModal({
  open, onClose, onSuccess, saKey,
}: {
  open: boolean; onClose: () => void;
  onSuccess: (t: Tenant) => void; saKey: string;
}) {
  const [tab, setTab]       = useState<Tab>("provision");
  const [form, setForm]     = useState<ProvisionForm>(emptyProvision);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [log, setLog]       = useState<string | null>(null);
  const [creds, setCreds]   = useState<CredsData | null>(null);
  const [doneTenant, setDoneTenant] = useState<Tenant | null>(null);

  function set<K extends keyof ProvisionForm>(k: K, v: ProvisionForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  // Auto-generar db_name desde slug
  function handleSlugChange(v: string) {
    const clean = v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    set("slug", clean);
    if (!form.db_name || form.db_name === `bdpolitic_${form.slug}`) {
      set("db_name", clean ? `bdpolitic_${clean}` : "");
    }
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setLog(null);

    const payload: ProvisionPayload = {
      slug:           form.slug,
      name:           form.name,
      db_name:        form.db_name,
      admin_email:    form.admin_email,
      admin_password: form.admin_password,
      plan:           form.plan,
      db_host:        form.db_host || undefined,
      db_user:        form.db_user || undefined,
      db_password:    form.db_password || undefined,
    };

    try {
      const res = await superadminApi.tenants.provision(saKey, payload);
      setLog(res.output);
      const adminUrl = `http://localhost:3000/admin/login?tenant=${form.slug}`;
      const voterUrl = `http://localhost:3000?tenant=${form.slug}`;
      setCreds({ email: form.admin_email, password: form.admin_password, slug: form.slug, adminUrl, voterUrl });
      setDoneTenant(res.tenant);
    } catch (err) {
      const e = err as ApiError;
      const body = e.body as any;
      setError(body?.message ?? "Error durante el provisionamiento.");
      if (body?.output) setLog(body.output);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setForm(emptyProvision);
    setError(null);
    setLog(null);
    setSaving(false);
    setCreds(null);
    setDoneTenant(null);
  }

  function handleDone() {
    if (doneTenant) onSuccess(doneTenant);
    reset();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => { if (!saving) { reset(); onClose(); } }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl
                   max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <h2 className="font-bold text-zinc-100">Nuevo Candidato</h2>
          <button
            onClick={() => { if (!saving) { reset(); onClose(); } }}
            className="text-zinc-500 hover:text-zinc-300 transition text-xl leading-none"
          >×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 px-6">
          {(["provision", "manual"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 px-1 mr-5 text-sm font-medium border-b-2 transition ${
                tab === t
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "provision" ? "⚡ Provisionar (recomendado)" : "Manual (solo registro)"}
            </button>
          ))}
        </div>

        <div className="px-6 py-5">
          {/* ── Pantalla de éxito con credenciales ── */}
          {creds ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <p className="font-semibold text-sm">Candidato provisionado correctamente</p>
              </div>
              <p className="text-xs text-zinc-500">
                Guarda estas credenciales — la contraseña no se puede recuperar después.
              </p>
              <div className="space-y-2">
                <CredRow label="Slug"     value={creds.slug} />
                <CredRow label="Email"    value={creds.email} />
                <CredRow label="Password" value={creds.password} secret />
                <CredRow label="Panel"    value={creds.adminUrl} />
                <CredRow label="Votantes" value={creds.voterUrl} />
              </div>
              {log && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <pre className="text-[11px] text-zinc-500 font-mono whitespace-pre-wrap">{log}</pre>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <a
                  href={creds.adminUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-300
                             hover:text-zinc-100 hover:border-zinc-500 transition text-center"
                >
                  Abrir panel ↗
                </a>
                <a
                  href={creds.voterUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-300
                             hover:text-zinc-100 hover:border-zinc-500 transition text-center"
                >
                  Ver sitio ↗
                </a>
                <button
                  onClick={handleDone}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400
                             text-white text-sm font-semibold transition"
                >
                  Listo
                </button>
              </div>
            </div>
          ) : tab === "provision" ? (
            <form onSubmit={handleProvision} className="space-y-4">
              <p className="text-xs text-zinc-500 bg-zinc-800/60 rounded-lg px-3 py-2">
                Crea la base de datos MySQL, ejecuta todas las migraciones, siembra datos iniciales
                y registra el tenant — todo en un solo paso.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Slug" value={form.slug} onChange={handleSlugChange}
                  placeholder="james-cueva" required
                  hint="Solo letras, números y guiones"
                />
                <Input
                  label="Nombre del tenant" value={form.name} onChange={(v) => set("name", v)}
                  placeholder="Campaña James Cueva" required
                />
              </div>

              <Input
                label="Nombre de la base de datos" value={form.db_name} onChange={(v) => set("db_name", v)}
                placeholder="bdpolitic_james" required
                hint="Se creará en MySQL si no existe"
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Email del admin" value={form.admin_email}
                  onChange={(v) => set("admin_email", v)}
                  type="email" placeholder="admin@james.pe" required
                />
                <Input
                  label="Contraseña del admin" value={form.admin_password}
                  onChange={(v) => set("admin_password", v)}
                  type="password" placeholder="Min. 8 caracteres" required
                />
              </div>

              <Select
                label="Plan"
                value={form.plan}
                onChange={(v) => set("plan", v as ProvisionForm["plan"])}
                options={PLANS.map((p) => ({ value: p.value, label: p.label }))}
              />

              {/* Configuración avanzada de DB */}
              <button
                type="button"
                onClick={() => set("showAdvanced", !form.showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition"
              >
                {form.showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Configuración avanzada de MySQL
              </button>

              {form.showAdvanced && (
                <div className="grid grid-cols-3 gap-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <Input
                    label="DB Host" value={form.db_host} onChange={(v) => set("db_host", v)}
                    placeholder="127.0.0.1"
                  />
                  <Input
                    label="DB User" value={form.db_user} onChange={(v) => set("db_user", v)}
                    placeholder="root"
                  />
                  <Input
                    label="DB Password" value={form.db_password}
                    onChange={(v) => set("db_password", v)}
                    type="password" placeholder="(vacío = sin pass)"
                  />
                  <p className="col-span-3 text-[11px] text-zinc-600">
                    Por defecto usa las credenciales del .env del servidor
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {log && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <pre className="text-[11px] text-zinc-400 font-mono whitespace-pre-wrap">{log}</pre>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed
                           text-white font-semibold text-sm py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Provisionando... (puede tomar ~15s)</>
                ) : (
                  <><Zap className="w-4 h-4" />Provisionar Candidato</>
                )}
              </button>
            </form>
          ) : (
            <ManualCreateForm saKey={saKey} onSuccess={onSuccess} />
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Formulario de creación manual (solo registro en tenants table) ───────

function ManualCreateForm({
  saKey, onSuccess,
}: { saKey: string; onSuccess: (t: Tenant) => void }) {
  const [form, setForm] = useState({
    slug: "", name: "", db_name: "", db_host: "127.0.0.1",
    db_user: "root", db_password: "", plan: "starter" as const,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const t = await superadminApi.tenants.create(saKey, form);
      onSuccess(t);
    } catch (err) {
      setError((err as ApiError).message ?? "Error al crear el tenant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-zinc-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-400">
        Solo registra el tenant. La base de datos ya debe existir y estar migrada manualmente.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Slug" value={form.slug} onChange={(v) => set("slug", v)} required />
        <Input label="Nombre" value={form.name} onChange={(v) => set("name", v)} required />
      </div>
      <Input label="DB Name" value={form.db_name} onChange={(v) => set("db_name", v)} required />
      <div className="grid grid-cols-3 gap-3">
        <Input label="DB Host" value={form.db_host} onChange={(v) => set("db_host", v)} />
        <Input label="DB User" value={form.db_user} onChange={(v) => set("db_user", v)} />
        <Input label="DB Password" value={form.db_password} onChange={(v) => set("db_password", v)} type="password" />
      </div>
      <Select
        label="Plan" value={form.plan}
        onChange={(v) => set("plan", v as "starter")}
        options={PLANS.map((p) => ({ value: p.value, label: p.label }))}
      />
      {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="submit" disabled={saving}
        className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white font-semibold
                   text-sm py-2.5 rounded-xl transition flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {saving ? "Guardando..." : "Registrar Tenant"}
      </button>
    </form>
  );
}

// ─── Modal de edición ─────────────────────────────────────────────────────

function EditModal({
  tenant, saKey, onClose, onSaved,
}: {
  tenant: Tenant; saKey: string;
  onClose: () => void; onSaved: (t: Tenant) => void;
}) {
  const [form, setForm] = useState<EditForm>({
    name: tenant.name,
    plan: tenant.plan,
    is_active: tenant.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function set<K extends keyof EditForm>(k: K, v: EditForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const updated = await superadminApi.tenants.update(saKey, tenant.id, form);
      onSaved(updated);
    } catch (err) {
      setError((err as ApiError).message ?? "Error al actualizar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="font-bold text-zinc-100 text-sm">Editar — <span className="text-zinc-400 font-mono">{tenant.slug}</span></h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100
                         focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
          <Select
            label="Plan" value={form.plan}
            onChange={(v) => set("plan", v as EditForm["plan"])}
            options={PLANS.map((p) => ({ value: p.value, label: p.label }))}
          />
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox" checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="w-4 h-4 rounded accent-emerald-500"
            />
            <span className="text-sm text-zinc-300">Tenant activo</span>
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40
                         text-white text-sm font-semibold transition flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Guardar
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Fila de tenant con stats expandibles ────────────────────────────────

function TenantRow({
  tenant, saKey,
  onEdit, onDelete, onToggle, onCredentials,
}: {
  tenant: Tenant; saKey: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onCredentials: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats]       = useState<TenantStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError]     = useState(false);

  async function loadStats() {
    if (stats || statsLoading) return;
    setStatsLoading(true); setStatsError(false);
    try {
      const res = await superadminApi.tenants.stats(saKey, tenant.id);
      const s = res.stats;
      if ("error" in s) { setStatsError(true); return; }
      setStats(s);
    } catch { setStatsError(true); }
    finally { setStatsLoading(false); }
  }

  function toggle() {
    setExpanded((v) => {
      if (!v) loadStats();
      return !v;
    });
  }

  const adminUrl = `http://localhost:3000/admin/login?tenant=${tenant.slug}`;
  const voterUrl = `http://localhost:3000?tenant=${tenant.slug}`;

  return (
    <>
      <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {statusDot(tenant.is_active)}
            <code className="text-sm font-mono text-zinc-200">{tenant.slug}</code>
            <CopyBtn text={tenant.slug} />
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-zinc-300">{tenant.name}</td>
        <td className="px-4 py-3">{planBadge(tenant.plan)}</td>
        <td className="px-4 py-3">
          <code className="text-[11px] text-zinc-500 font-mono">{tenant.db_name}</code>
        </td>
        <td className="px-4 py-3 text-xs text-zinc-500">
          {new Date(tenant.created_at).toLocaleDateString("es-PE")}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              title="Ver stats"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition"
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onCredentials}
              title="Ver credenciales"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <a
              href={adminUrl} target="_blank" rel="noopener noreferrer"
              title="Abrir panel admin"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onEdit}
              title="Editar"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onToggle}
              title={tenant.is_active ? "Desactivar" : "Activar"}
              className={`p-1.5 rounded-lg transition ${
                tenant.is_active
                  ? "text-zinc-500 hover:text-amber-400 hover:bg-zinc-800"
                  : "text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800"
              }`}
            >
              {tenant.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onDelete}
              title="Eliminar"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={6} className="px-4 pb-3 bg-zinc-900/60">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2 pb-1">
                  {statsLoading && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Conectando a la DB del tenant...
                    </div>
                  )}
                  {statsError && (
                    <p className="text-xs text-amber-400 py-2">
                      No se pudo conectar a la DB del tenant. Verifica las credenciales.
                    </p>
                  )}
                  {stats && (
                    <div className="flex gap-4">
                      <StatChip icon={MessageSquare} label="Conversaciones" value={stats.chat_sessions} />
                      <StatChip icon={MessageSquare}  label="Mensajes" value={stats.chat_messages} />
                      <StatChip icon={FileText}  label="Propuestas" value={stats.proposals} />
                    </div>
                  )}
                  <div className="mt-2 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-600 w-16 shrink-0">Admin:</span>
                      <code className="text-[11px] text-zinc-500 font-mono flex-1 truncate">{adminUrl}</code>
                      <CopyBtn text={adminUrl} />
                      <a href={adminUrl} target="_blank" rel="noopener noreferrer"
                         className="text-zinc-600 hover:text-emerald-400 transition">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-600 w-16 shrink-0">Votantes:</span>
                      <code className="text-[11px] text-zinc-500 font-mono flex-1 truncate">{voterUrl}</code>
                      <CopyBtn text={voterUrl} />
                      <a href={voterUrl} target="_blank" rel="noopener noreferrer"
                         className="text-zinc-600 hover:text-emerald-400 transition">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

function StatChip({
  icon: Icon, label, value,
}: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 bg-zinc-800 px-3 py-1.5 rounded-lg">
      <Icon className="w-3.5 h-3.5 text-zinc-500" />
      <span className="text-xs text-zinc-400">{label}:</span>
      <span className="text-xs font-bold text-zinc-200">{value.toLocaleString()}</span>
    </div>
  );
}

// ─── Modal de confirmación de borrado ─────────────────────────────────────

function DeleteConfirm({
  tenant, saKey, onClose, onDeleted,
}: {
  tenant: Tenant; saKey: string; onClose: () => void; onDeleted: (id: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState("");

  async function handleDelete() {
    setLoading(true);
    try {
      await superadminApi.tenants.delete(saKey, tenant.id);
      onDeleted(tenant.id);
    } catch (err) {
      alert((err as ApiError).message ?? "Error al eliminar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-sm bg-zinc-900 border border-red-500/30 rounded-2xl p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h3 className="font-bold text-zinc-100">Eliminar tenant</h3>
        </div>
        <p className="text-sm text-zinc-400 mb-1">
          Esto eliminará el registro del tenant <strong className="text-zinc-200">{tenant.slug}</strong> de la tabla
          principal. <strong className="text-red-400">La base de datos MySQL NO se elimina</strong> — hazlo manualmente si es necesario.
        </p>
        <p className="text-xs text-zinc-500 mb-3">
          Escribe <strong className="text-zinc-400 font-mono">{tenant.slug}</strong> para confirmar:
        </p>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={tenant.slug}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100
                     font-mono mb-4 focus:outline-none focus:border-red-500 transition"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={confirm !== tenant.slug || loading}
            className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-40
                       text-white text-sm font-semibold transition flex items-center justify-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Eliminar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────

// ─── Tab Planes ──────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  chatbot: "Chatbot", candidate_profile: "Perfil candidato", faqs: "FAQs",
  chat_sessions: "Sesiones chat", analytics: "Analytics",
  proposals: "Propuestas", media: "Videos y galería", events: "Eventos",
  team: "Equipo", attack_responses: "Respuestas a ataques",
  livestream: "Livestream",
  "knowledge.max_documents": "Docs de conocimiento",
  "external_signals.enabled": "Señales externas",
  "intelligence.enabled": "Inteligencia electoral",
  messages_per_month: "Mensajes/mes",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "text-zinc-400 bg-zinc-800",
  pro:     "text-blue-400 bg-blue-900/40",
  elite:   "text-amber-400 bg-amber-900/30",
};

function PlansTab({ saKey }: { saKey: string }) {
  const [plans, setPlans]       = useState<(PlanFeatureSet & { id: number })[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<number | null>(null);
  const [editPlan, setEditPlan] = useState<(PlanFeatureSet & { id: number }) | null>(null);
  const [editFeatures, setEditFeatures] = useState<string>("");

  useEffect(() => {
    superadminApi.plans.list(saKey)
      .then((data) => setPlans(data as (PlanFeatureSet & { id: number })[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [saKey]);

  function startEdit(plan: PlanFeatureSet & { id: number }) {
    setEditPlan(plan);
    setEditFeatures(JSON.stringify(plan.features, null, 2));
  }

  async function saveEdit() {
    if (!editPlan) return;
    try {
      JSON.parse(editFeatures); // validate JSON
    } catch {
      alert("JSON inválido. Revisa el formato.");
      return;
    }
    setSaving(editPlan.id);
    try {
      const updated = await superadminApi.plans.update(saKey, editPlan.id, {
        features: JSON.parse(editFeatures),
        price: editPlan.price,
      }) as PlanFeatureSet & { id: number };
      setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p));
      setEditPlan(null);
    } catch (e) {
      alert((e as ApiError).message ?? "Error guardando.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Edita los módulos y límites de cada plan. Los cambios se aplican a todos los tenants con ese plan en el próximo request.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const colorClass = PLAN_COLORS[plan.plan] ?? PLAN_COLORS.starter;
          const features = plan.features as Record<string, unknown>;
          return (
            <div key={plan.plan} className="bg-zinc-800/60 border border-zinc-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
                <div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${colorClass}`}>
                    {plan.label.toUpperCase()}
                  </span>
                  <p className="text-xs text-zinc-500 mt-1">${plan.price}/mes</p>
                </div>
                <button
                  onClick={() => startEdit(plan)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition"
                  title="Editar features"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const val = key.includes(".") ? key.split(".").reduce((o: unknown, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), features) : features[key];
                  const enabled = typeof val === "boolean" ? val : typeof val === "number" ? val !== 0 : val != null;
                  const display = typeof val === "number" ? (val === -1 ? "∞" : String(val)) : null;
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      {enabled
                        ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        : <XCircle className="w-3 h-3 text-zinc-600 shrink-0" />}
                      <span className={enabled ? "text-zinc-300" : "text-zinc-600"}>{label}</span>
                      {display && <span className="ml-auto text-zinc-400 font-mono text-[10px]">{display}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit modal */}
      {editPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditPlan(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h3 className="font-bold text-zinc-100">Editar features — {editPlan.label}</h3>
              <button onClick={() => setEditPlan(null)} className="text-zinc-500 hover:text-zinc-300 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Precio (USD/mes)</label>
                <input
                  type="number" min={0} step={1}
                  value={editPlan.price}
                  onChange={(e) => setEditPlan((p) => p ? { ...p, price: parseFloat(e.target.value) } : null)}
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">Features (JSON)</label>
                <textarea
                  value={editFeatures}
                  onChange={(e) => setEditFeatures(e.target.value)}
                  rows={16}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono
                             focus:outline-none focus:border-emerald-500 resize-y"
                />
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setEditPlan(null)} className="flex-1 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition">
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving === editPlan.id}
                className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition"
              >
                {saving === editPlan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const { saKey } = useSuperAdmin();

  const [activeTab, setActiveTab] = useState<"tenants" | "plans">("tenants");

  const [tenants, setTenants]       = useState<Tenant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [editTarget, setEditTarget]       = useState<Tenant | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<Tenant | null>(null);
  const [credsTarget, setCredsTarget]     = useState<Tenant | null>(null);

  const load = useCallback(async () => {
    if (!saKey) return;
    setLoading(true); setError(null);
    try {
      const res = await superadminApi.tenants.list(saKey);
      setTenants(res.data ?? []);
    } catch (err) {
      setError((err as ApiError).message ?? "Error cargando tenants.");
    } finally {
      setLoading(false);
    }
  }, [saKey]);

  useEffect(() => { load(); }, [load]);

  function handleProvisioned(t: Tenant) {
    setTenants((prev) => [t, ...prev]);
    setProvisionOpen(false);
  }

  function handleSaved(updated: Tenant) {
    setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditTarget(null);
  }

  function handleDeleted(id: number) {
    setTenants((prev) => prev.filter((t) => t.id !== id));
    setDeleteTarget(null);
  }

  async function toggleActive(tenant: Tenant) {
    try {
      const updated = await superadminApi.tenants.update(saKey!, tenant.id, {
        is_active: !tenant.is_active,
      });
      setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      alert((err as ApiError).message ?? "Error al actualizar.");
    }
  }

  const active   = tenants.filter((t) => t.is_active).length;
  const inactive = tenants.length - active;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-zinc-100">PoliticOS</h1>
        <div className="flex items-center gap-2">
          {activeTab === "tenants" && (
            <>
              <button onClick={load} className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition" title="Recargar">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => setProvisionOpen(true)}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm px-4 py-2 rounded-xl transition"
              >
                <Plus className="w-4 h-4" /> Nuevo Candidato
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 mb-6">
        {([["tenants", "Candidatos", Database], ["plans", "Planes", CreditCard]] as const).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 py-2.5 px-1 mr-6 text-sm font-medium border-b-2 transition ${
              activeTab === tab
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {tab === "tenants" && <span className="text-[11px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">{tenants.length}</span>}
          </button>
        ))}
      </div>

      {/* Sub-header de tenants */}
      {activeTab === "tenants" && (
        <p className="text-sm text-zinc-500 mb-4">
          {tenants.length} candidatos ·{" "}
          <span className="text-emerald-400">{active} activos</span>
          {inactive > 0 && <span className="text-zinc-600"> · {inactive} inactivos</span>}
        </p>
      )}

      {/* Tab de planes */}
      {activeTab === "plans" && saKey && <PlansTab saKey={saKey} />}

      {/* Tab de tenants */}
      {activeTab === "tenants" && <>

      {/* Resumen por plan */}
      {tenants.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {PLANS.map((p) => {
            const count = tenants.filter((t) => t.plan === p.value).length;
            return (
              <div key={p.value} className={`${p.bg} border border-zinc-700 rounded-xl p-3`}>
                <p className={`text-xs font-bold ${p.color} uppercase tracking-wider mb-1`}>{p.label}</p>
                <p className="text-2xl font-bold text-zinc-100">{count}</p>
                <p className="text-xs text-zinc-600">
                  {count === 1 ? "candidato" : "candidatos"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabla */}
      {error ? (
        <div className="text-center py-20 text-red-400">
          <p>{error}</p>
          <button onClick={load} className="mt-3 text-sm text-zinc-400 hover:text-zinc-200 underline">
            Reintentar
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl">
          <Database className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">Sin tenants todavía</p>
          <p className="text-sm text-zinc-600 mt-1">Crea el primer candidato con el botón de arriba</p>
          <button
            onClick={() => setProvisionOpen(true)}
            className="mt-4 text-sm text-emerald-400 hover:text-emerald-300 underline"
          >
            + Nuevo Candidato
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-zinc-800/60">
              <tr>
                {["Slug", "Nombre", "Plan", "Base de datos", "Creado", "Acciones"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <TenantRow
                  key={t.id}
                  tenant={t}
                  saKey={saKey!}
                  onEdit={() => setEditTarget(t)}
                  onDelete={() => setDeleteTarget(t)}
                  onToggle={() => toggleActive(t)}
                  onCredentials={() => setCredsTarget(t)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales */}
      <AnimatePresence>
        {provisionOpen && (
          <ProvisionModal
            open={provisionOpen}
            onClose={() => setProvisionOpen(false)}
            onSuccess={handleProvisioned}
            saKey={saKey!}
          />
        )}
      </AnimatePresence>

      {editTarget && (
        <EditModal
          tenant={editTarget}
          saKey={saKey!}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          tenant={deleteTarget}
          saKey={saKey!}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      {credsTarget && (
        <CredentialsModal
          tenant={credsTarget}
          saKey={saKey!}
          onClose={() => setCredsTarget(null)}
        />
      )}
      </> /* end tenants tab */}
    </>
  );
}
