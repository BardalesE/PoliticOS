"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  segmentacionApi,
  type SegmentacionNivel,
  type SegmentacionResumen,
} from "@/lib/api";
import { prettyPlace } from "@/lib/directorio";
import { SurveySupportByPlaceChart } from "@/components/admin/charts/SurveySupportByPlaceChart";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, MessageSquare, ThumbsUp, ThumbsDown, RefreshCw, Loader2, MapPin, ChevronRight, Info,
} from "lucide-react";

type Crumb = { nivel: SegmentacionNivel; parent_id?: number; label: string };

const NEXT: Record<SegmentacionNivel, SegmentacionNivel | null> = {
  departamento: "provincia",
  provincia: "distrito",
  distrito: null,
};

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export default function SegmentacionPage() {
  const { token } = useAuth();
  const [data, setData] = useState<SegmentacionResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trail, setTrail] = useState<Crumb[]>([{ nivel: "departamento", label: "Todo el país" }]);
  const [candidateId, setCandidateId] = useState<number | "">("");

  const current = trail[trail.length - 1];

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await segmentacionApi.resumen(token, {
        nivel: current.nivel,
        parent_id: current.parent_id,
        candidate_id: candidateId || undefined,
      }));
    } catch {
      setError("No se pudo cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token, current.nivel, current.parent_id, candidateId]);

  useEffect(() => { load(); }, [load]);

  const drill = (id: number, place: string) => {
    const next = NEXT[current.nivel];
    if (next) setTrail((t) => [...t, { nivel: next, parent_id: id, label: prettyPlace(place) }]);
  };

  const k = data?.kpis;
  const votos = k ? k.apoyo_si + k.apoyo_no : 0;
  const pctSi = votos ? Math.round((k!.apoyo_si * 100) / votos) : 0;
  const empty = !!data && data.kpis.visitantes_con_zona === 0 && data.kpis.votos === 0 && data.kpis.consultas === 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-1">Inteligencia ciudadana</p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Zonas y apoyo del chat</h1>
          <p className="text-xs text-gray-400 mt-1">De dónde son quienes consultan, sobre quién y cuánto apoyo declaran.</p>
        </div>
        <button onClick={load} className="self-start p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition" aria-label="Actualizar">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          {data?.aviso ?? "Datos autoseleccionados de quienes usan el chat. No son representativos ni una encuesta científica."}{" "}
          Son privados: no los publiques como resultados de encuesta.
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : empty ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
          <MapPin size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aún no hay visitantes con zona</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Aparecerán cuando los visitantes elijan su distrito en el chat.
            {data && !data.poll_enabled && " La mini encuesta sí/no está desactivada: pídele al superadmin que la active para este candidato."}
          </p>
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: Users,         label: "Visitantes con zona", value: data.kpis.visitantes_con_zona.toLocaleString(), color: "#2563EB", bg: "#EFF6FF" },
              { icon: MessageSquare, label: "Consultas por candidato", value: data.kpis.consultas.toLocaleString(), color: "#7C3AED", bg: "#F5F3FF" },
              { icon: ThumbsUp,      label: "Dicen Sí", value: `${data.kpis.apoyo_si.toLocaleString()}${votos ? ` · ${pctSi}%` : ""}`, color: "#16A34A", bg: "#F0FDF4" },
              { icon: ThumbsDown,    label: "Dicen No", value: `${data.kpis.apoyo_no.toLocaleString()}${votos ? ` · ${100 - pctSi}%` : ""}`, color: "#DC2626", bg: "#FEF2F2" },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: bg }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <p className="font-serif text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-serif text-sm font-bold text-gray-900 mb-1">Visitantes nuevos con zona</h3>
            <p className="text-xs text-gray-400 mb-3">Últimos 14 días</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={data.serie.map((s) => ({ ...s, label: dayLabel(s.dia) }))} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [String(v), "Visitantes"]} labelStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="visitantes" stroke="#2563EB" fill="#2563EB" fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Zonas con drill-down */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <nav aria-label="Zona" className="flex flex-wrap items-center gap-1 text-xs text-gray-500 mb-3">
                {trail.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    {i > 0 && <ChevronRight size={12} aria-hidden />}
                    <button
                      type="button"
                      disabled={i === trail.length - 1}
                      onClick={() => setTrail((t) => t.slice(0, i + 1))}
                      className={i === trail.length - 1 ? "font-semibold text-gray-800" : "underline hover:text-gray-800"}
                    >
                      {c.label}
                    </button>
                  </span>
                ))}
              </nav>
              <h3 className="font-serif text-sm font-bold text-gray-900 mb-2">
                Por {current.nivel === "departamento" ? "departamento" : current.nivel === "provincia" ? "provincia" : "distrito"}
              </h3>
              {data.zonas.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Sin datos en esta zona.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                        <th className="pb-2 font-semibold">Zona</th>
                        <th className="pb-2 font-semibold text-right">Visitantes</th>
                        <th className="pb-2 font-semibold text-right">Sí</th>
                        <th className="pb-2 font-semibold text-right">No</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.zonas.map((z) => (
                        <tr key={z.id} className="border-t border-gray-100">
                          <td className="py-2">
                            {NEXT[current.nivel] ? (
                              <button type="button" onClick={() => drill(z.id, z.place)} className="text-left font-medium text-brand-600 hover:underline">
                                {prettyPlace(z.place)}
                              </button>
                            ) : prettyPlace(z.place)}
                          </td>
                          <td className="py-2 text-right tabular-nums">{z.visitantes}</td>
                          <td className="py-2 text-right tabular-nums text-green-700">{z.si}</td>
                          <td className="py-2 text-right tabular-nums text-red-700">{z.no}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Apoyo por zona */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-serif text-sm font-bold text-gray-900 mb-1">Apoyo por zona</h3>
              <p className="text-xs text-gray-400 mb-3">Votos sí / no {candidateId ? "del candidato elegido" : "a todos los candidatos"}</p>
              {data.zonas.some((z) => z.total > 0) ? (
                <SurveySupportByPlaceChart data={data.zonas.filter((z) => z.total > 0).map((z) => ({ ...z, place: prettyPlace(z.place) }))} />
              ) : (
                <p className="text-sm text-gray-400 py-10 text-center">
                  {data.poll_enabled ? "Todavía no hay votos en esta zona." : "La mini encuesta está desactivada para este candidato."}
                </p>
              )}
            </div>
          </div>

          {/* Candidatos */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="font-serif text-sm font-bold text-gray-900">Candidatos</h3>
              <select
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value ? Number(e.target.value) : "")}
                aria-label="Filtrar zonas por candidato"
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-brand-500"
              >
                <option value="">Apoyo por zona: todos</option>
                {data.candidatos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {data.candidatos.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aún nadie consultó ni votó por un candidato.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                      <th className="pb-2 font-semibold">Candidato</th>
                      <th className="pb-2 font-semibold text-right">Consultas</th>
                      <th className="pb-2 font-semibold text-right">Sí</th>
                      <th className="pb-2 font-semibold text-right">No</th>
                      <th className="pb-2 font-semibold text-right">% Sí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.candidatos.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100">
                        <td className="py-2">
                          <span className="font-medium text-gray-900">{c.name}</span>
                          {c.party && <span className="ml-2 text-xs text-gray-400">{c.party}</span>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{c.consultas}</td>
                        <td className="py-2 text-right tabular-nums text-green-700">{c.si}</td>
                        <td className="py-2 text-right tabular-nums text-red-700">{c.no}</td>
                        <td className="py-2 text-right tabular-nums">{c.pct_si === null ? "—" : `${c.pct_si}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
