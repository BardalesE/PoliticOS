"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { surveysApi, resolveTenantSlug, type SurveyDashboard, type SurveyJourney } from "@/lib/api";
import { TopicsChart } from "@/components/admin/charts/TopicsChart";
import { SurveySupportByPlaceChart } from "@/components/admin/charts/SurveySupportByPlaceChart";
import {
  Users, ThumbsUp, ThumbsDown, HelpCircle, Download, RefreshCw,
  ClipboardList, Loader2, Smartphone, BookOpen,
} from "lucide-react";

export default function SurveysDashboardPage() {
  const { token } = useAuth();

  const [data, setData]         = useState<SurveyDashboard | null>(null);
  const [journeys, setJourneys] = useState<SurveyJourney[]>([]);
  const [journeyId, setJourneyId] = useState<number | "">("");
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [dash, js] = await Promise.all([
        surveysApi.dashboard(token, journeyId || undefined),
        surveysApi.journeys(token),
      ]);
      setData(dash);
      setJourneys(js.journeys);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, [token, journeyId]);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    if (!token) return;
    setExporting(true);
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    const slug    = resolveTenantSlug();
    const params  = new URLSearchParams();
    if (journeyId) params.set("journey_id", String(journeyId));
    try {
      const res = await fetch(`${API_URL}/admin/surveys/export?${params}`, {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant": slug || "" },
      });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `encuestas_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const total = data?.total ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const supportPie = data ? [
    { topic: "Sí", count: data.support.si },
    { topic: "No", count: data.support.no },
    { topic: "Indeciso", count: data.support.indeciso },
  ].filter((d) => d.count > 0) : [];

  const knewTotal = data ? data.knew_proposal.knew + data.knew_proposal.not_knew : 0;
  const knewPie = data ? [
    { topic: "Conocía", count: data.knew_proposal.knew },
    { topic: "No conocía", count: data.knew_proposal.not_knew },
  ].filter((d) => d.count > 0) : [];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-1">Encuestas de campaña</p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Dashboard de encuestas</h1>
          <p className="text-xs text-gray-400 mt-1">
            {data ? `${total.toLocaleString()} respuestas · ${data.journeys_count} jornadas` : "Cargando..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/encuestar"
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl transition">
            <Smartphone size={15} /> Encuestar en campo
          </Link>
          <button onClick={load} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={handleExport} disabled={exporting || !total}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar
          </button>
        </div>
      </div>

      {/* Filtro por jornada */}
      {journeys.length > 0 && (
        <select value={journeyId} onChange={(e) => setJourneyId(e.target.value ? Number(e.target.value) : "")}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-500">
          <option value="">Todas las jornadas</option>
          {journeys.map((j) => (
            <option key={j.id} value={j.id}>{j.label} ({j.responses_count})</option>
          ))}
        </select>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : total === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
          <ClipboardList size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aún no hay respuestas</p>
          <p className="text-sm text-gray-400 mt-1">Sal a campo y captura encuestas desde el celular.</p>
          <Link href="/encuestar" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl">
            <Smartphone size={15} /> Empezar a encuestar
          </Link>
        </div>
      ) : data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Users,      label: "Total respuestas", value: total,               sub: "",                  color: "#2563EB", bg: "#EFF6FF" },
              { icon: ThumbsUp,   label: "Apoyan (Sí)",      value: data.support.si,      sub: `${pct(data.support.si)}%`,       color: "#16A34A", bg: "#F0FDF4" },
              { icon: ThumbsDown, label: "No apoyan",        value: data.support.no,      sub: `${pct(data.support.no)}%`,       color: "#DC2626", bg: "#FEF2F2" },
              { icon: HelpCircle, label: "Indecisos",        value: data.support.indeciso, sub: `${pct(data.support.indeciso)}%`, color: "#64748B", bg: "#F8FAFC" },
            ].map(({ icon: Icon, label, value, sub, color, bg }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: bg }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <p className="font-serif text-2xl font-bold text-gray-900">
                  {value.toLocaleString()} {sub && <span className="text-sm font-semibold" style={{ color }}>{sub}</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Apoyo global */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-serif text-sm font-bold text-gray-900 mb-1">Apoyo global</h3>
              <p className="text-xs text-gray-400 mb-3">Distribución sí / no / indeciso</p>
              <TopicsChart data={supportPie} />
            </div>

            {/* Conocía la propuesta */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-serif text-sm font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                <BookOpen size={14} className="text-brand-500" /> Conocimiento de la propuesta
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                {knewTotal ? `${pct(data.knew_proposal.knew)}% conocía la propuesta` : "Sin datos registrados"}
              </p>
              {knewPie.length ? <TopicsChart data={knewPie} /> : (
                <p className="text-sm text-gray-400 py-10 text-center">No se registró este dato en las respuestas.</p>
              )}
            </div>
          </div>

          {/* Apoyo por lugar/distrito (reemplaza el mapa) */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-serif text-sm font-bold text-gray-900 mb-1">Apoyo por lugar / distrito</h3>
            <p className="text-xs text-gray-400 mb-3">Distribución de apoyo por zona (sin GPS)</p>
            <SurveySupportByPlaceChart data={data.by_place} />
          </div>
        </>
      )}
    </div>
  );
}
