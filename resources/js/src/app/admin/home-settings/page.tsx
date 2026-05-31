"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, LayoutDashboard, CheckCircle, AlertCircle } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const SECTIONS = [
  { key: "show_hero",       label: "Hero principal",    desc: "Sección de portada con video y CTAs" },
  { key: "show_assistant",  label: "Asistente IA",      desc: "Vista previa del chat inteligente" },
  { key: "show_proposals",  label: "Propuestas",        desc: "Las 8 categorías de propuestas" },
  { key: "show_multimedia", label: "Multimedia",        desc: "Galería de fotos y videos recientes" },
  { key: "show_events",     label: "Eventos",           desc: "Próximos eventos y cuenta regresiva" },
  { key: "show_districts",  label: "Distritos",         desc: "Los 13 distritos de la provincia" },
  { key: "show_team",       label: "Equipo político",   desc: "Candidato y miembros del equipo" },
  { key: "show_connection", label: "Sección de cita",   desc: "Estadísticas y cita del candidato" },
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
      setSettings(data);
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
          Activa o desactiva secciones de la página principal.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {SECTIONS.map(({ key, label, desc }) => (
            <div
              key={key}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
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
