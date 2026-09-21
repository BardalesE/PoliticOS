"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Save } from "lucide-react";
import { superadminApi, ApiError, type AiSetting, type Tenant } from "@/lib/api";

const PROVIDERS = ["groq", "claude", "openai"] as const;
const MODELS: Record<string, string[]> = {
  groq:   ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  claude: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-7"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
};

const field =
  "w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-trust-500";

/**
 * Prompt y modelo de IA de UN candidato. Solo el superadmin llega aquí y el
 * tenant va explícito en la URL de la API (/superadmin/tenants/{id}/ai-settings):
 * no depende del X-Tenant ni del localStorage del navegador, así que guardar
 * aquí no puede caer en otro candidato.
 */
export default function TenantAiModal({
  tenant, saKey, onClose,
}: { tenant: Tenant; saKey: string; onClose: () => void }) {
  const [form, setForm]       = useState<Partial<AiSetting>>({});
  const [info, setInfo]       = useState<AiSetting["tenant"]>();
  const [hasKey, setHasKey]   = useState(false);
  const [newKey, setNewKey]   = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [customized, setCustomized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function apply(s: AiSetting) {
    setForm(s);
    setInfo(s.tenant);
    setHasKey(!!s.has_own_api_key);
    setCustomized(!!s.system_prompt_customizado);
  }

  useEffect(() => {
    superadminApi.tenants.getAiSettings(saKey, tenant.id)
      .then(apply)
      .catch((e: ApiError) => setError(e.message ?? "No se pudo cargar la configuración de IA."))
      .finally(() => setLoading(false));
  }, [saKey, tenant.id]);

  function set<K extends keyof AiSetting>(k: K, v: AiSetting[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const payload: Partial<AiSetting> & { api_key?: string | null } = {
        provider: form.provider, model: form.model,
        fallback_provider: form.fallback_provider ?? null,
        max_tokens: Number(form.max_tokens), temperature: Number(form.temperature),
        mode: form.mode, system_prompt: form.system_prompt ?? "",
        max_messages_per_session: Math.min(50, Math.max(10, Number(form.max_messages_per_session) || 20)),
        registration_bonus_messages: Math.min(100, Math.max(10, Number(form.registration_bonus_messages) || 50)),
        support_poll_enabled: !!form.support_poll_enabled,
      };
      if (clearKey) payload.api_key = "";
      else if (newKey.trim()) payload.api_key = newKey.trim();

      apply(await superadminApi.tenants.updateAiSettings(saKey, tenant.id, payload));
      setNewKey(""); setClearKey(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  const shared = info && (info.shared_with.length > 0 || info.is_central);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-2xl bg-white border border-gray-300 rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <Bot className="w-4 h-4 text-trust-700" />
            <div>
              <h2 className="font-bold text-gray-900 text-sm">IA y prompt de {tenant.name}</h2>
              <p className="text-[11px] text-gray-500 font-mono">
                Editando: {tenant.slug} · BD {tenant.db_name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <form onSubmit={save} className="px-6 py-5 space-y-4">
          {loading && (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {shared && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <b>Base de datos compartida.</b>{" "}
                {info!.is_central
                  ? "Este tenant usa la base central de la plataforma."
                  : `Este tenant comparte su base de datos con: ${info!.shared_with.join(", ")}.`}{" "}
                Lo que guardes aquí también cambia el prompt de esos candidatos. Provisiona una base propia
                (bdpolitic_{tenant.slug}) para aislarlos.
              </span>
            </div>
          )}

          {!loading && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-gray-600">Proveedor
                  <select className={field} value={form.provider ?? "groq"}
                    onChange={(e) => { set("provider", e.target.value as AiSetting["provider"]); set("model", MODELS[e.target.value][0]); }}>
                    {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600">Modelo
                  <select className={field} value={form.model ?? ""} onChange={(e) => set("model", e.target.value)}>
                    {[...(MODELS[form.provider ?? "groq"] ?? []), ...(MODELS[form.provider ?? "groq"]?.includes(form.model ?? "") ? [] : [form.model ?? ""])]
                      .filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600">Respaldo
                  <select className={field} value={form.fallback_provider ?? ""}
                    onChange={(e) => set("fallback_provider", (e.target.value || null) as AiSetting["fallback_provider"])}>
                    <option value="">Ninguno</option>
                    {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600">Modo
                  <select className={field} value={form.mode ?? "campaign"} onChange={(e) => set("mode", e.target.value as "campaign" | "pepa")}>
                    <option value="campaign">Campaña (habla como el candidato)</option>
                    <option value="pepa">PEPA (asistente cívico neutral)</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600">Máx. tokens
                  <input type="number" min={100} max={4096} className={field} value={form.max_tokens ?? 1200}
                    onChange={(e) => set("max_tokens", Number(e.target.value))} />
                </label>
                <label className="text-xs font-semibold text-gray-600">Temperatura (0–1)
                  <input type="number" step="0.05" min={0} max={1} className={field} value={form.temperature ?? 0.4}
                    onChange={(e) => set("temperature", Number(e.target.value))} />
                </label>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="max-msgs" className="text-xs font-semibold text-gray-700">Mensajes por conversación</label>
                    <span className="text-sm font-bold text-trust-700 tabular-nums">{form.max_messages_per_session ?? 20}</span>
                  </div>
                  <input id="max-msgs" type="range" min={10} max={50} step={1}
                    className="w-full mt-2 accent-trust-700"
                    value={form.max_messages_per_session ?? 20}
                    onChange={(e) => set("max_messages_per_session", Number(e.target.value))} />
                  <div className="flex justify-between text-[10px] text-gray-400"><span>10</span><span>50</span></div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="bonus-msgs" className="text-xs font-semibold text-gray-700">Mensajes extra al registrarse</label>
                    <span className="text-sm font-bold text-trust-700 tabular-nums">+{form.registration_bonus_messages ?? 50}</span>
                  </div>
                  <input id="bonus-msgs" type="range" min={10} max={100} step={5}
                    className="w-full mt-2 accent-trust-700"
                    value={form.registration_bonus_messages ?? 50}
                    onChange={(e) => set("registration_bonus_messages", Number(e.target.value))} />
                  <div className="flex justify-between text-[10px] text-gray-400"><span>10</span><span>100</span></div>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  El visitante tiene <b>{form.max_messages_per_session ?? 20}</b> mensajes por conversación. Al agotarlos el chat
                  muestra «Mensajes agotados» y, si deja sus datos (nombre y contacto), gana <b>{form.registration_bonus_messages ?? 50} más</b>
                  ({(form.max_messages_per_session ?? 20) + (form.registration_bonus_messages ?? 50)} en total). Topes anti-abuso en 24 h:{" "}
                  <b>{(form.max_messages_per_session ?? 20) * 3}</b> por visitante sin registrar,{" "}
                  <b>{((form.max_messages_per_session ?? 20) + (form.registration_bonus_messages ?? 50)) * 2}</b> si ya se registró y{" "}
                  <b>{((form.max_messages_per_session ?? 20) + (form.registration_bonus_messages ?? 50)) * 5}</b> por red/IP, para que una
                  oficina o equipo compartiendo internet no se bloquee entre sí.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-trust-700"
                  checked={!!form.support_poll_enabled}
                  onChange={(e) => set("support_poll_enabled", e.target.checked)} />
                <span>
                  <span className="block text-xs font-semibold text-gray-700">Mini encuesta «¿Apoyas a este candidato? Sí / No»</span>
                  <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                    Aparece en el chat al elegir un candidato. Un voto anónimo por visitante. Los resultados solo se
                    ven en el panel (Segmentación), nunca públicos: no es una encuesta científica.
                  </span>
                </span>
              </label>

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">
                  API key propia de este candidato{" "}
                  <span className="font-normal text-gray-400">
                    ({hasKey && !clearKey ? "configurada — no se muestra" : "usa la key compartida de la plataforma"})
                  </span>
                </p>
                <div className="flex gap-2">
                  <input type="password" autoComplete="new-password" className={field}
                    placeholder={hasKey ? "Escribe una nueva para reemplazarla" : "Opcional"}
                    value={newKey} onChange={(e) => { setNewKey(e.target.value); setClearKey(false); }} />
                  {hasKey && (
                    <button type="button" onClick={() => { setClearKey((v) => !v); setNewKey(""); }}
                      className={`px-3 text-xs rounded-lg border whitespace-nowrap ${clearKey ? "border-red-300 bg-red-50 text-red-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                      {clearKey ? "Se quitará al guardar" : "Quitar key"}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-600">Prompt del sistema</p>
                  <span className="text-[11px] text-gray-400">
                    {(form.system_prompt ?? "").length} caracteres ·{" "}
                    {customized ? "personalizado de este candidato" : "prompt de fábrica del modo"}
                  </span>
                </div>
                <textarea rows={14} className={`${field} font-mono text-xs leading-relaxed`}
                  value={form.system_prompt ?? ""} onChange={(e) => set("system_prompt", e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">
                  Si cambias el modo sin haber personalizado el prompt, se reemplaza por el de fábrica del modo nuevo.
                  Guardar un texto distinto lo marca como personalizado y ya no se pisa.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                {saved && <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Guardado en {tenant.slug}</span>}
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-trust-700 text-white text-sm font-semibold disabled:opacity-60">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Guardar en {tenant.slug}
                </button>
              </div>
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
}
