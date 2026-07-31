"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCandidate } from "@/context/CandidateContext";
import { request } from "@/lib/api";
import type { Map as LeafletMap } from "leaflet";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import {
  Activity, Zap, AlertCircle, AlertTriangle, MapPin, Map as MapIcon,
  Heart, Users2, Shield, Building2,
} from "lucide-react";
import { Card } from "@/components/admin/Card";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";

const adminGet = (token: string, path: string) =>
  request<any>(`/admin${path}`, {}, token);

// Paleta categórica unificada del panel (ver charts/TopicsChart.tsx) — el
// primer color lo pone el tenant, orden fijo validado, no rotar.
const STATIC_COLORS = ["#2563EB", "#16A34A", "#F59E0B", "#7C3AED", "#0891B2", "#DB2777", "#E85D04"];

interface Pulse {
  sentiment: { today: number; week: number; delta: number };
  emotions: { emotion: string; count: number }[];
  intents: { intent: string; count: number }[];
  by_region: { geo_region: string; sessions: number; avg_sentiment: number }[];
  segments: { inferred_segment: string; count: number }[];
  voter_intentions: { field_value: string; count: number }[];
}

interface AttackFeed {
  feed: Array<{ source: string; content: string; category?: string; sentiment?: number; url?: string; date: string; target?: string }>;
  top_categories: { attack_category: string; count: number }[];
  velocity_24h: { hour: string; count: number }[];
  total_week: number;
}

interface Segments {
  concerns_by_segment: Record<string, Record<string, number>>;
  funnel: { visitors: number; engaged: number; consented: number; declared_intent: number };
  topics_by_segment: Record<string, Array<{ topic: string; count: number }>>;
}

interface Realtime {
  active_sessions: number;
  messages_per_min: number;
  unacknowledged_alerts: number;
  critical_alerts: number;
}

interface Districts {
  by_district: { district: string; mentions: number; avg_sentiment: number }[];
  problems_by_district: Record<string, string[]>;
  citizen_proposals: { district: string; text: string; date: string }[];
}

interface MapPoint {
  id: string | number;
  name: string | null;
  district: string | null;
  voting_intention: string | null;
  points: number;
  lat: number;
  lng: number;
  location_department?: string;
  created_at: string;
}
interface MapData { citizens: MapPoint[]; sessions: MapPoint[]; total: number; }

interface GeoBreakdownRow {
  geo_region:    string | null;
  geo_province:  string | null;
  geo_city:      string | null;
  geo_district:  string | null;
  sessions:      number;
  messages:      number;
  avg_sentiment: number | null;
}
interface GeoBreakdown { level: string; rows: GeoBreakdownRow[]; }

type Tab = "pulse" | "attacks" | "segments" | "districts" | "geo" | "map";

const TAB_LABELS: Record<Tab, string> = {
  pulse: "Pulso Ciudadano",
  attacks: "Ataques",
  segments: "Segmentación",
  districts: "Por Distrito",
  geo: "Geografía",
  map: "Mapa",
};

const TAB_ICONS: Record<Tab, React.ElementType> = {
  pulse: Heart,
  attacks: Shield,
  segments: Users2,
  districts: Building2,
  geo: MapPin,
  map: MapIcon,
};

export default function IntelligencePage() {
  const { token } = useAuth();
  const { profile } = useCandidate();
  const brandColor = profile.color_primary || "#DC2626";
  const COLORS = [brandColor, ...STATIC_COLORS];
  const [tab, setTab] = useState<Tab>("pulse");
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [attacks, setAttacks] = useState<AttackFeed | null>(null);
  const [segments, setSegments] = useState<Segments | null>(null);
  const [realtime, setRealtime] = useState<Realtime | null>(null);
  const [districts, setDistricts]   = useState<Districts | null>(null);
  const [mapData, setMapData]       = useState<MapData | null>(null);
  const [geoBreakdown, setGeoBreakdown] = useState<GeoBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    loadAll();
    const realtimeInterval = setInterval(loadRealtime, 5_000);
    const dataInterval     = setInterval(loadAll,      30_000);
    return () => { clearInterval(realtimeInterval); clearInterval(dataInterval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadAll = async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    const [p, a, s, r, d, m, g] = await Promise.allSettled([
      adminGet(token, "/intelligence/pulse"),
      adminGet(token, "/intelligence/attacks?limit=30"),
      adminGet(token, "/intelligence/segments"),
      adminGet(token, "/intelligence/realtime"),
      adminGet(token, "/intelligence/districts"),
      adminGet(token, "/intelligence/map"),
      adminGet(token, "/intelligence/geo-breakdown?days=30&level=district"),
    ]);
    if (p.status === "fulfilled") setPulse(p.value);
    if (a.status === "fulfilled") setAttacks(a.value);
    if (s.status === "fulfilled") setSegments(s.value);
    if (r.status === "fulfilled") setRealtime(r.value);
    if (d.status === "fulfilled") setDistricts(d.value);
    if (m.status === "fulfilled") setMapData(m.value);
    if (g.status === "fulfilled") setGeoBreakdown(g.value);
    setLoading(false);
  };

  const loadRealtime = async () => {
    if (!token) return;
    try {
      const r = await adminGet(token, "/intelligence/realtime");
      setRealtime(r);
    } catch {}
  };

  if (loading) return <div className="p-6 text-gray-500">Cargando inteligencia...</div>;

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-1">Plataforma de inteligencia</p>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-gray-900">Inteligencia Electoral</h1>
        <p className="text-xs text-gray-400 mt-1">Pulso ciudadano · ataques · segmentación · alertas</p>
      </header>

      {/* Banda de métricas en vivo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Activity} label="Conversaciones activas" value={realtime?.active_sessions ?? 0}
          accent={brandColor} bg={`${brandColor}12`} pulse
        />
        <StatCard icon={Zap} label="Mensajes/min" value={realtime?.messages_per_min ?? 0} accent="#2563EB" bg="#EFF6FF" />
        <StatCard
          icon={AlertCircle} label="Alertas pendientes" value={realtime?.unacknowledged_alerts ?? 0}
          accent={(realtime?.unacknowledged_alerts ?? 0) > 0 ? "#D97706" : "#94A3B8"}
          bg={(realtime?.unacknowledged_alerts ?? 0) > 0 ? "#FFFBEB" : "#F8FAFC"}
        />
        <StatCard
          icon={AlertTriangle} label="Críticas" value={realtime?.critical_alerts ?? 0}
          accent={(realtime?.critical_alerts ?? 0) > 0 ? "#DC2626" : "#94A3B8"}
          bg={(realtime?.critical_alerts ?? 0) > 0 ? "#FEF2F2" : "#F8FAFC"}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {(["pulse","attacks","segments","districts","geo","map"] as Tab[]).map((t) => {
          const Icon = TAB_ICONS[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                tab === t ? "text-brand-600 border-brand-500" : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              <Icon size={14} />
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      {tab === "pulse"     && (pulse     ? <PulseTab     data={pulse} colors={COLORS} /> : <EmptyTab label="Pulso ciudadano" />)}
      {tab === "attacks"   && (attacks   ? <AttacksTab   data={attacks}   /> : <EmptyTab label="Ataques"         />)}
      {tab === "segments"  && (segments  ? <SegmentsTab  data={segments}  /> : <EmptyTab label="Segmentación"    />)}
      {tab === "districts" && (districts ? <DistrictsTab data={districts} /> : <EmptyTab label="Análisis por distrito" />)}
      {tab === "geo"       && <GeoTab data={geoBreakdown} token={token!} />}
      {tab === "map"       && <MapTab data={mapData} />}
    </div>
  );
}

function PulseTab({ data, colors }: { data: Pulse; colors: string[] }) {
  const sentClass = data.sentiment.delta > 0 ? "text-emerald-600" : data.sentiment.delta < 0 ? "text-red-600" : "text-gray-500";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Sentimiento Ciudadano">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-gray-500">Hoy</p>
            <p className="text-3xl font-bold text-gray-900">{data.sentiment.today.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Semana</p>
            <p className="text-2xl font-bold text-gray-700">{data.sentiment.week.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Δ vs ayer</p>
            <p className={`text-2xl font-bold ${sentClass}`}>
              {data.sentiment.delta > 0 ? "+" : ""}
              {data.sentiment.delta.toFixed(2)}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Escala: -1 (muy negativo) → +1 (muy positivo)</p>
      </Card>

      <Card title="Emociones detectadas">
        {data.emotions.length === 0 ? (
          <EmptyState title="Sin emociones detectadas" message="Se acumulan a medida que los ciudadanos conversan con el asistente." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.emotions} dataKey="count" nameKey="emotion" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                {data.emotions.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip suffix=" menciones" />} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Top regiones (conversaciones)">
        {data.by_region.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Aún no hay suficientes datos"
            message="Se acumulan con el uso — aparecen cuando ciudadanos conversan desde IPs geolocalizables."
          />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.by_region.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="geo_region" width={100} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip suffix=" sesiones" />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="sessions" fill={colors[0]} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Intención de voto declarada">
        {data.voter_intentions.length === 0 ? (
          <EmptyState title="Sin datos declarados" message="Aparece cuando el asistente infiere una intención de voto durante la conversación." />
        ) : (
          <div className="space-y-2">
            {data.voter_intentions.map((v) => (
              <div key={v.field_value} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 capitalize">{v.field_value}</span>
                <span className="text-sm font-bold text-gray-900">{v.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Segmentos detectados" className="lg:col-span-2">
        {data.segments.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="Aún no hay suficientes datos"
            message="Los segmentos se detectan cuando los ciudadanos mencionan su ocupación o rol en la conversación — se acumulan con el uso."
          />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.segments} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="inferred_segment" tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} tickFormatter={(v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip suffix=" ciudadanos" />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.segments.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function ChartTooltip({ active, payload, label, suffix = "" }: { active?: boolean; payload?: any[]; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const name = row.geo_region ?? row.inferred_segment ?? row.district ?? payload[0]?.name ?? label;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-xl">
      {name && <p className="text-xs text-gray-400 capitalize mb-0.5">{name}</p>}
      <p className="text-sm font-bold text-gray-900">{payload[0].value}{suffix}</p>
    </div>
  );
}

function AttacksTab({ data }: { data: AttackFeed }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Velocidad de ataques (24h)" className="lg:col-span-2">
        {data.velocity_24h.length === 0 ? (
          <EmptyState icon={Shield} title="Sin actividad hostil detectada" message="Se acumula cuando el pipeline de señales externas detecta menciones negativas." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.velocity_24h} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip suffix=" ataques" />} cursor={{ stroke: "rgba(220,38,38,0.2)" }} />
              <Line type="monotone" dataKey="count" stroke="#DC2626" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: "#DC2626", stroke: "#fff", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="text-xs text-gray-500 mt-2">Total semana: {data.total_week} ataques</p>
      </Card>

      <Card title="Categorías más atacadas">
        <div className="space-y-2">
          {data.top_categories.map((c) => (
            <div key={c.attack_category} className="flex items-center justify-between">
              <span className="text-sm text-gray-700 capitalize">{c.attack_category}</span>
              <span className="text-sm font-bold text-red-600">{c.count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Feed de ataques recientes" className="lg:col-span-3">
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {data.feed.map((a, i) => (
            <div key={i} className="py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 rounded-full">
                  {a.source}
                </span>
                {a.category && (
                  <span className="text-xs font-medium px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                    {a.category}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(a.date).toLocaleString("es-PE")}
                </span>
              </div>
              <p className="text-sm text-gray-700">{a.content}</p>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Ver fuente
                </a>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SegmentsTab({ data }: { data: Segments }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Funnel de conversión" className="lg:col-span-2">
        <div className="grid grid-cols-4 gap-3">
          <FunnelStep label="Visitas" value={data.funnel.visitors} pct={1} />
          <FunnelStep label="Engaged (2+ mensajes)" value={data.funnel.engaged} pct={data.funnel.engaged / Math.max(data.funnel.visitors, 1)} />
          <FunnelStep label="Consintieron datos" value={data.funnel.consented} pct={data.funnel.consented / Math.max(data.funnel.visitors, 1)} />
          <FunnelStep label="Declararon intención" value={data.funnel.declared_intent} pct={data.funnel.declared_intent / Math.max(data.funnel.visitors, 1)} />
        </div>
      </Card>

      <Card title="Preocupaciones por segmento" className="lg:col-span-2">
        {Object.keys(data.concerns_by_segment).length === 0 ? (
          <EmptyState icon={Users2} title="Sin datos suficientes aún" message="Necesitas más conversaciones con segmentos detectados." />
        ) : (
          <div className="space-y-4">
            {Object.entries(data.concerns_by_segment).map(([seg, concerns]) => (
              <div key={seg}>
                <p className="text-sm font-bold text-gray-700 mb-1 capitalize">{seg}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(concerns).map(([c, count]) => (
                    <span key={c} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {c} <strong>({count})</strong>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DistrictsTab({ data }: { data: Districts }) {
  const sentColor = (s: number) =>
    s > 0.2 ? "text-emerald-600" : s < -0.2 ? "text-red-600" : "text-gray-500";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Menciones por distrito */}
      <Card title="Menciones por distrito (7 días)" className="lg:col-span-2">
        {data.by_district.length === 0 ? (
          <EmptyState icon={Building2} title="Sin datos aún" message="Los distritos aparecen cuando los ciudadanos los mencionan en el chat." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_district.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="district" width={120} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip suffix=" menciones" />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="mentions" fill="#2563EB" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Sentimiento por distrito */}
      {data.by_district.length > 0 && (
        <Card title="Sentimiento promedio por distrito">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.by_district.map((d) => (
              <div key={d.district} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-700">{d.district}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${d.avg_sentiment > 0 ? "bg-emerald-400" : "bg-red-400"}`}
                      style={{ width: `${Math.min(100, Math.abs(d.avg_sentiment) * 100)}%`, marginLeft: d.avg_sentiment < 0 ? "auto" : undefined }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-12 text-right ${sentColor(d.avg_sentiment)}`}>
                    {d.avg_sentiment > 0 ? "+" : ""}{d.avg_sentiment.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Problemas por distrito */}
      <Card title="Problemas reportados por distrito">
        {Object.keys(data.problems_by_district).length === 0 ? (
          <p className="text-sm text-gray-500">Sin problemas detectados aún.</p>
        ) : (
          <div className="space-y-4 max-h-72 overflow-y-auto">
            {Object.entries(data.problems_by_district).map(([district, problems]) => (
              <div key={district}>
                <p className="text-xs font-bold text-gray-600 mb-1">{district}</p>
                <div className="space-y-1">
                  {(problems as string[]).slice(0, 3).map((p, i) => (
                    <p key={i} className="text-xs text-gray-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Propuestas ciudadanas */}
      <Card title="Propuestas de los ciudadanos" className="lg:col-span-2">
        {data.citizen_proposals.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay propuestas ciudadanas detectadas. Aparecen cuando los ciudadanos sugieren ideas en el chat.</p>
        ) : (
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {data.citizen_proposals.slice(0, 20).map((p, i) => (
              <div key={i} className="py-2.5 flex items-start gap-3">
                <span className="text-xs font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full shrink-0 mt-0.5">
                  {p.district ?? "General"}
                </span>
                <p className="text-sm text-gray-700 flex-1">{p.text}</p>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(p.date).toLocaleDateString("es-PE")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ━━━ Tab de Geografía (Departamento → Provincia → Distrito) ━━━━━━━━━━━━━━

function GeoTab({ data, token }: { data: GeoBreakdown | null; token: string }) {
  const [level, setLevel] = useState<"province" | "district">("province");
  const [rows, setRows]   = useState<GeoBreakdownRow[]>(data?.rows ?? []);
  const [loading, setLoading] = useState(false);

  const load = async (lv: "province" | "district") => {
    setLevel(lv);
    setLoading(true);
    try {
      const res = await adminGet(token, `/intelligence/geo-breakdown?days=30&level=${lv}`);
      setRows(res.rows ?? []);
    } catch {}
    setLoading(false);
  };

  // Agrupar por departamento para mostrar árbol
  const byDept = rows.reduce<Record<string, GeoBreakdownRow[]>>((acc, r) => {
    const dept = r.geo_region ?? "Sin región";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(r);
    return acc;
  }, {});

  const sentimentColor = (v: number | null) => {
    if (v === null) return "text-gray-400";
    if (v >= 0.3) return "text-emerald-600";
    if (v >= 0)   return "text-gray-600";
    return "text-red-500";
  };

  return (
    <div className="space-y-4">
      {/* Selector de nivel */}
      <div className="flex gap-2">
        {(["province","district"] as const).map((lv) => (
          <button
            key={lv}
            onClick={() => load(lv)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              level === lv
                ? "bg-brand-500 text-white border-brand-500"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {lv === "province" ? "Por Provincia" : "Por Distrito"}
          </button>
        ))}
        <span className="text-xs text-gray-400 self-center ml-2">Últimos 30 días</span>
      </div>

      {loading && <p className="text-sm text-gray-500">Cargando...</p>}

      {!loading && rows.length === 0 && (
        <EmptyState
          icon={MapPin}
          title="Sin datos geográficos aún"
          message="Los datos aparecerán cuando usuarios ingresen al chat desde IPs de Perú."
          className="bg-white border border-gray-200 rounded-xl py-12"
        />
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-3">
          {Object.entries(byDept)
            .sort((a, b) => b[1].reduce((s, r) => s + r.sessions, 0) - a[1].reduce((s, r) => s + r.sessions, 0))
            .map(([dept, dRows]) => {
              const totalSessions = dRows.reduce((s, r) => s + r.sessions, 0);
              return (
                <div key={dept} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Cabecera del departamento */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                      <Building2 size={13} className="text-gray-400" /> {dept}
                    </span>
                    <span className="text-xs text-gray-500">{totalSessions} sesiones</span>
                  </div>
                  {/* Filas de provincia/distrito */}
                  <div className="divide-y divide-gray-100">
                    {dRows
                      .sort((a, b) => b.sessions - a.sessions)
                      .map((r, i) => {
                        const name = level === "district"
                          ? (r.geo_district ?? r.geo_city ?? "—")
                          : (r.geo_province ?? "—");
                        const parent = level === "district"
                          ? (r.geo_province ?? "")
                          : "";
                        const sentiment = r.avg_sentiment;
                        return (
                          <div key={i} className="flex items-center gap-3 px-4 py-2">
                            <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                              {parent && (
                                <p className="text-xs text-gray-400">{parent}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <p className="text-xs text-gray-400">Sesiones</p>
                                <p className="text-sm font-bold text-gray-900">{r.sessions}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400">Mensajes</p>
                                <p className="text-sm font-bold text-gray-700">{r.messages}</p>
                              </div>
                              <div className="w-16">
                                <p className="text-xs text-gray-400">Sentimiento</p>
                                <p className={`text-sm font-bold ${sentimentColor(sentiment)}`}>
                                  {sentiment !== null ? sentiment.toFixed(2) : "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function FunnelStep({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{(pct * 100).toFixed(1)}%</p>
    </div>
  );
}

// ─── Mapa de participación (Leaflet) ─────────────────────────────────────────

const VOTE_COLORS: Record<string, string> = {
  alta:     "#10B981",
  media:    "#34D399",
  indeciso: "#F59E0B",
  baja:     "#FB923C",
  opositor: "#EF4444",
};

function intentionLabel(v: string | null): string {
  if (!v) return "Sin datos";
  return { alta: "A favor", media: "Simpatizante", indeciso: "Indeciso", baja: "Crítico", opositor: "Opositor" }[v] ?? v;
}

function MapTab({ data }: { data: MapData | null }) {
  const mapRef  = useRef<HTMLDivElement>(null);
  const mapInst = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    (async () => {
      const L = (await import("leaflet")).default;

      if (!mapRef.current) return;

      // Inject Leaflet CSS once
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id   = "leaflet-css";
        link.rel  = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Destroy the previous instance before re-creating the map
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null;
      }

      // Lima / San Miguel as default center
      const map = L.map(mapRef.current!, { center: [-12.09, -77.05], zoom: 11 });
      mapInst.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
        maxZoom: 18,
      }).addTo(map);

      const all = [...(data?.citizens ?? []), ...(data?.sessions ?? [])];

      all.forEach((pt) => {
        const color  = VOTE_COLORS[pt.voting_intention ?? ""] ?? "#94A3B8";
        const radius = pt.voting_intention ? 9 : 6;

        const marker = L.circleMarker([pt.lat, pt.lng], {
          color,
          fillColor: color,
          fillOpacity: 0.85,
          radius,
          weight: 1.5,
        });

        const dateStr = pt.created_at
          ? new Date(pt.created_at).toLocaleDateString("es-PE")
          : "—";

        marker.bindPopup(`
          <div style="min-width:160px;font-family:sans-serif;font-size:13px;line-height:1.5">
            <strong style="display:block;margin-bottom:4px">${pt.name ?? "Visitante anónimo"}</strong>
            ${pt.district ? `<span>📍 ${pt.district}</span><br/>` : ""}
            ${pt.location_department ? `<span>🏛️ ${pt.location_department}</span><br/>` : ""}
            <span>⭐ ${pt.points} puntos</span><br/>
            <span style="color:${color};font-weight:600">${intentionLabel(pt.voting_intention)}</span><br/>
            <span style="color:#888;font-size:11px">${dateStr}</span>
          </div>
        `);

        marker.addTo(map);
      });

      // Auto-fit bounds if there are points
      if (all.length > 0) {
        const bounds = L.latLngBounds(all.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }

    })();

    return () => {
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const citizens = data?.citizens ?? [];
  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">Ciudadanos con GPS</p>
          <p className="text-2xl font-bold text-gray-900">{citizens.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">Sesiones anónimas GPS</p>
          <p className="text-2xl font-bold text-gray-900">{sessions.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">A favor</p>
          <p className="text-2xl font-bold text-emerald-600">
            {citizens.filter((c) => c.voting_intention === "alta" || c.voting_intention === "media").length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">Opositores / Críticos</p>
          <p className="text-2xl font-bold text-red-600">
            {citizens.filter((c) => c.voting_intention === "opositor" || c.voting_intention === "baja").length}
          </p>
        </div>
      </div>

      {/* Map card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-200 rounded-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700">Mapa de participación ciudadana</h3>
          <span className="text-xs text-gray-400">{(data?.total ?? 0)} puntos totales</span>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 flex flex-wrap gap-3 border-b border-gray-100 bg-gray-50">
          {Object.entries(VOTE_COLORS).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span style={{ backgroundColor: c }} className="w-3 h-3 rounded-full inline-block" />
              {intentionLabel(k)}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span style={{ backgroundColor: "#94A3B8" }} className="w-3 h-3 rounded-full inline-block" />
            Anónimo
          </span>
        </div>

        {/* Leaflet container — always rendered so the ref stays mounted */}
        <div
          ref={mapRef}
          style={{ height: 500, width: "100%" }}
          className={data === null || data.total === 0 ? "hidden" : undefined}
        />

        {/* Placeholder shown when there are no location points */}
        {(data === null || data.total === 0) && (
          <div className="flex flex-col items-center justify-center h-80 text-gray-400 bg-gray-50">
            <p className="text-sm">Sin datos de ubicación todavía.</p>
            <p className="text-xs mt-1">Aparecerán cuando ciudadanos compartan su ubicación en el chat.</p>
          </div>
        )}
      </motion.div>

      {/* Table of latest registered citizens with GPS */}
      {citizens.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-gray-200 rounded-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700">Últimos ciudadanos registrados con ubicación</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                  <th className="text-left px-4 py-2 font-medium">Nombre</th>
                  <th className="text-left px-4 py-2 font-medium">Distrito declarado</th>
                  <th className="text-left px-4 py-2 font-medium">Ubicación GPS</th>
                  <th className="text-left px-4 py-2 font-medium">Intención</th>
                  <th className="text-right px-4 py-2 font-medium">Puntos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {citizens.slice(0, 20).map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2 font-medium text-gray-800">{c.name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{c.district ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {c.location_department
                        ? `${c.district ?? ""}, ${c.location_department}`
                        : `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`}
                    </td>
                    <td className="px-4 py-2">
                      {c.voting_intention ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: VOTE_COLORS[c.voting_intention] ?? "#94A3B8" }}
                        >
                          {intentionLabel(c.voting_intention)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-gray-800">{c.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <p className="text-sm">Sin datos de {label} disponibles.</p>
      <p className="text-xs mt-1">Los datos aparecerán cuando haya más conversaciones.</p>
    </div>
  );
}
