"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, LayoutDashboard, CheckCircle, AlertCircle, CalendarDays } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FormField } from "@/components/admin/FormField";

const SECTIONS = [
  { key: "show_hero",       label: "Hero principal",    desc: "Sección de portada con video y CTAs" },
  { key: "show_assistant",  label: "Asistente IA",      desc: "Vista previa del chat inteligente" },
  { key: "show_proposals",  label: "Propuestas",        desc: "Las 8 categorías de propuestas" },
  { key: "show_multimedia", label: "Multimedia",        desc: "Galería de fotos y videos recientes" },
  { key: "show_events",     label: "Eventos",           desc: "Próximos eventos y cuenta regresiva" },
  { key: "show_districts",  label: "Distritos",         desc: "Distritos de la provincia" },
  { key: "show_team",       label: "Equipo político",   desc: "Candidato y miembros del equipo" },
  { key: "show_opinion",    label: "Opiniones",         desc: "Formulario de opinión ciudadana (WhatsApp)" },
  { key: "show_connection", label: "Sección de cita",   desc: "Estadísticas y cita del candidato" },
];

const DEFAULTS: Record<string, string> = {
  events_title:      "Próximos encuentros con el pueblo.",
  events_badge:      "Agenda",
  election_date_iso: "2026-10-04",
  stats_districts_label: "Caseríos visitados",
  stats_plan_label:      "Plan de primeros 100 días",
  stats_proposals_label: "Propuestas concretas",
  stats_ai_label:        "Asistente IA disponible",
};

// Etiquetas de la barra de estadísticas bajo el hero. Las cifras de caseríos
// y propuestas salen de los datos reales del tenant y se ocultan si no hay.
const STAT_LABELS = [
  { key: "stats_districts_label", label: "Etiqueta: caseríos/distritos (cifra = distritos activos)" },
  { key: "stats_plan_label",      label: "Etiqueta: plan de gobierno (cifra fija “100d”)" },
  { key: "stats_proposals_label", label: "Etiqueta: propuestas (cifra = propuestas publicadas)" },
  { key: "stats_ai_label",        label: "Etiqueta: asistente (cifra fija “24/7”)" },
];

export default function HomeSettingsPage() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await adminApi.settings.get(token);
      setSettings({ ...DEFAULTS, ...data });
    } catch {}
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function toggle(key: string) {
    setSettings((prev) => ({ ...prev, [key]: prev[key] !== "0" ? "0" : "1" }));
  }

  function isOn(key: string): boolean {
    return settings[key] !== "0";
  }

  function set(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      await adminApi.settings.update(token, settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando configuración.");
    } finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <LayoutDashboard size={20} className="text-brand-400" />
          <h1 className="font-serif text-xl font-bold text-gray-900">Configuración de Home</h1>
        </div>
        <p className="text-sm text-gray-400">
          Activa/desactiva secciones y personaliza textos de la página principal.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">

        {/* ── Secciones visibles ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Secciones visibles</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {SECTIONS.map(({ key, label, desc }) => (
              <div
                key={key}
                className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-brand-200 transition-colors"
              >
                <div className="min-w-0 mr-4">
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className={`relative shrink-0 h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none ${
                    isOn(key) ? "bg-brand-500" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      isOn(key) ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Barra de estadísticas ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
            Barra de estadísticas (bajo el hero)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {STAT_LABELS.map(({ key, label }) => (
              <FormField
                key={key}
                label={label}
                value={settings[key] ?? DEFAULTS[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={DEFAULTS[key]}
              />
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Las cifras de caseríos y propuestas se calculan con los datos reales del
            tenant; si no hay datos, esa estadística no se muestra en la home.
          </p>
        </div>

        {/* ── Sección Eventos ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <CalendarDays size={16} className="text-brand-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Sección Eventos</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Título de la sección"
              value={settings.events_title ?? DEFAULTS.events_title}
              onChange={(e) => set("events_title", e.target.value)}
              placeholder="Próximos encuentros con el pueblo."
            />
            <FormField
              label="Texto del badge"
              value={settings.events_badge ?? DEFAULTS.events_badge}
              onChange={(e) => set("events_badge", e.target.value)}
              placeholder="Agenda"
            />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Fecha de las elecciones (cronómetro de respaldo)
            </label>
            <input
              type="date"
              value={settings.election_date_iso ?? DEFAULTS.election_date_iso}
              onChange={(e) => set("election_date_iso", e.target.value)}
              className="w-full max-w-xs bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/10"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Se usa como meta del cronómetro cuando no hay ningún evento destacado programado.
            </p>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            <span className="font-bold">Tip:</span> Puedes usar <code className="bg-amber-100 px-1 rounded">*texto*</code> en el título para resaltar palabras en rojo.
            Ej: <em>Próximos encuentros <code>*con el pueblo.*</code></em>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle size={14} /> Configuración guardada.
            </p>
          )}
          <div>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
