"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { request } from "@/lib/api";
import type { Map as LeafletMap } from "leaflet";

const adminGet = (token: string, path: string) =>
  request<any>(`/admin${path}`, {}, token);
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";

const COLORS = ["#DC2626","#F59E0B","#10B981","#3B82F6","#8B5CF6","#EC4899","#6366F1","#14B8A6"];

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

type Tab = "pulse" | "attacks" | "segments" | "districts" | "map";

export default function IntelligencePage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("pulse");
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [attacks, setAttacks] = useState<AttackFeed | null>(null);
  const [segments, setSegments] = useState<Segments | null>(null);
  const [realtime, setRealtime] = useState<Realtime | null>(null);
  const [districts, setDistricts] = useState<Districts | null>(null);
  const [mapData, setMapData]     = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);

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
    const [p, a, s, r, d, m] = await Promise.allSettled([
      adminGet(token, "/intelligence/pulse"),
      adminGet(token, "/intelligence/attacks?limit=30"),
      adminGet(token, "/intelligence/segments"),
      adminGet(token, "/intelligence/realtime"),
      adminGet(token, "/intelligence/districts"),
      adminGet(token, "/intelligence/map"),
    ]);
    if (p.status === "fulfilled") setPulse(p.value);
    if (a.status === "fulfilled") setAttacks(a.value);
    if (s.status === "fulfilled") setSegments(s.value);
    if (r.status === "fulfilled") setRealtime(r.value);
    if (d.status === "fulfilled") setDistricts(d.value);
    if (m.status === "fulfilled") setMapData(m.value);
    setLoading(false);
  };

  const loadRealtime = async () => {
    if (!token) return;
    try {
      const r = await adminGet(token, "/intelligence/realtime");
      setRealtime(r);
    } catch {}
  };

  if (loading) return <div className="p-6 text-zinc-500">Cargando inteligencia...</div>;

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-900">Inteligencia Electoral</h1>
        <p className="text-sm text-zinc-500">Pulso ciudadano · ataques · segmentación · alertas</p>
      </header>

      {/* Banda de métricas en vivo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Conversaciones activas" value={realtime?.active_sessions ?? 0} pulse />
        <StatCard label="Mensajes/min" value={realtime?.messages_per_min ?? 0} />
        <StatCard
          label="Alertas pendientes"
          value={realtime?.unacknowledged_alerts ?? 0}
          color={(realtime?.unacknowledged_alerts ?? 0) > 0 ? "amber" : "default"}
        />
        <StatCard
          label="Críticas"
          value={realtime?.critical_alerts ?? 0}
          color={(realtime?.critical_alerts ?? 0) > 0 ? "red" : "default"}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 border-b border-zinc-200 overflow-x-auto">
        {(["pulse","attacks","segments","districts","map"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition ${
              tab === t ? "text-zinc-900 border-b-2 border-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t === "pulse" ? "Pulso Ciudadano"
              : t === "attacks" ? "Ataques"
              : t === "segments" ? "Segmentación"
              : t === "districts" ? "Por Distrito"
              : "🗺️ Mapa"}
          </button>
        ))}
      </div>

      {tab === "pulse"     && (pulse     ? <PulseTab     data={pulse}     /> : <EmptyTab label="Pulso ciudadano" />)}
      {tab === "attacks"   && (attacks   ? <AttacksTab   data={attacks}   /> : <EmptyTab label="Ataques"         />)}
      {tab === "segments"  && (segments  ? <SegmentsTab  data={segments}  /> : <EmptyTab label="Segmentación"    />)}
      {tab === "districts" && (districts ? <DistrictsTab data={districts} /> : <EmptyTab label="Análisis por distrito" />)}
      {tab === "map"       && <MapTab data={mapData} />}
    </div>
  );
}

function StatCard({ label, value, pulse: pulseDot, color = "default" }: { label: string; value: number; pulse?: boolean; color?: "default" | "amber" | "red" }) {
  const colors = {
    default: "text-zinc-900",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-zinc-500">{label}</p>
        {pulseDot && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />}
      </div>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function PulseTab({ data }: { data: Pulse }) {
  const sentClass = data.sentiment.delta > 0 ? "text-emerald-600" : data.sentiment.delta < 0 ? "text-red-600" : "text-zinc-500";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Sentimiento Ciudadano">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-zinc-500">Hoy</p>
            <p className="text-3xl font-bold text-zinc-900">{data.sentiment.today.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Semana</p>
            <p className="text-2xl font-bold text-zinc-700">{data.sentiment.week.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Δ vs ayer</p>
            <p className={`text-2xl font-bold ${sentClass}`}>
              {data.sentiment.delta > 0 ? "+" : ""}
              {data.sentiment.delta.toFixed(2)}
            </p>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-2">Escala: -1 (muy negativo) → +1 (muy positivo)</p>
      </Card>

      <Card title="Emociones detectadas">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data.emotions} dataKey="count" nameKey="emotion" cx="50%" cy="50%" outerRadius={70} label>
              {data.emotions.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Top regiones (conversaciones)">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data.by_region.slice(0, 8)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="geo_region" width={100} />
            <Tooltip />
            <Bar dataKey="sessions" fill="#3B82F6" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Intención de voto declarada">
        {data.voter_intentions.length === 0 ? (
          <p className="text-sm text-zinc-500">Aún sin datos declarados.</p>
        ) : (
          <div className="space-y-2">
            {data.voter_intentions.map((v) => (
              <div key={v.field_value} className="flex items-center justify-between">
                <span className="text-sm text-zinc-700">{v.field_value}</span>
                <span className="text-sm font-bold text-zinc-900">{v.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Segmentos detectados" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.segments}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="inferred_segment" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#10B981" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function AttacksTab({ data }: { data: AttackFeed }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Velocidad de ataques (24h)" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.velocity_24h}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#DC2626" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-zinc-500 mt-2">Total semana: {data.total_week} ataques</p>
      </Card>

      <Card title="Categorías más atacadas">
        <div className="space-y-2">
          {data.top_categories.map((c) => (
            <div key={c.attack_category} className="flex items-center justify-between">
              <span className="text-sm text-zinc-700 capitalize">{c.attack_category}</span>
              <span className="text-sm font-bold text-red-600">{c.count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Feed de ataques recientes" className="lg:col-span-3">
        <div className="divide-y divide-zinc-100 max-h-96 overflow-y-auto">
          {data.feed.map((a, i) => (
            <div key={i} className="py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium px-2 py-0.5 bg-zinc-100 rounded-full">
                  {a.source}
                </span>
                {a.category && (
                  <span className="text-xs font-medium px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                    {a.category}
                  </span>
                )}
                <span className="text-xs text-zinc-400">
                  {new Date(a.date).toLocaleString("es-PE")}
                </span>
              </div>
              <p className="text-sm text-zinc-700">{a.content}</p>
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
          <p className="text-sm text-zinc-500">Sin datos suficientes aún. Necesitas más conversaciones con segmentos detectados.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(data.concerns_by_segment).map(([seg, concerns]) => (
              <div key={seg}>
                <p className="text-sm font-bold text-zinc-700 mb-1 capitalize">{seg}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(concerns).map(([c, count]) => (
                    <span key={c} className="text-xs bg-zinc-100 text-zinc-700 px-2 py-1 rounded-full">
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
    s > 0.2 ? "text-emerald-600" : s < -0.2 ? "text-red-600" : "text-zinc-500";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Menciones por distrito */}
      <Card title="Menciones por distrito (7 días)" className="lg:col-span-2">
        {data.by_district.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin datos aún. Los distritos aparecen cuando los ciudadanos los mencionan en el chat.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_district.slice(0, 12)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="district" width={120} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(val) => [val, "Menciones"]} />
              <Bar dataKey="mentions" fill="#3B82F6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Sentimiento por distrito */}
      {data.by_district.length > 0 && (
        <Card title="Sentimiento promedio por distrito">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.by_district.map((d) => (
              <div key={d.district} className="flex items-center justify-between py-1 border-b border-zinc-100 last:border-0">
                <span className="text-sm text-zinc-700">{d.district}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-zinc-100 rounded-full overflow-hidden">
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
          <p className="text-sm text-zinc-500">Sin problemas detectados aún.</p>
        ) : (
          <div className="space-y-4 max-h-72 overflow-y-auto">
            {Object.entries(data.problems_by_district).map(([district, problems]) => (
              <div key={district}>
                <p className="text-xs font-bold text-zinc-600 mb-1">{district}</p>
                <div className="space-y-1">
                  {(problems as string[]).slice(0, 3).map((p, i) => (
                    <p key={i} className="text-xs text-zinc-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
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
          <p className="text-sm text-zinc-500">Aún no hay propuestas ciudadanas detectadas. Aparecen cuando los ciudadanos sugieren ideas en el chat.</p>
        ) : (
          <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
            {data.citizen_proposals.slice(0, 20).map((p, i) => (
              <div key={i} className="py-2.5 flex items-start gap-3">
                <span className="text-xs font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full shrink-0 mt-0.5">
                  {p.district ?? "General"}
                </span>
                <p className="text-sm text-zinc-700 flex-1">{p.text}</p>
                <span className="text-xs text-zinc-400 shrink-0">
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

function FunnelStep({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
      <p className="text-xs text-zinc-400">{(pct * 100).toFixed(1)}%</p>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white border border-zinc-200 rounded-xl p-4 ${className}`}
    >
      <h3 className="text-sm font-bold text-zinc-700 mb-3">{title}</h3>
      {children}
    </motion.div>
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
        <div className="bg-white border border-zinc-200 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Ciudadanos con GPS</p>
          <p className="text-2xl font-bold text-zinc-900">{citizens.length}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Sesiones anónimas GPS</p>
          <p className="text-2xl font-bold text-zinc-900">{sessions.length}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-3">
          <p className="text-xs text-zinc-500">A favor</p>
          <p className="text-2xl font-bold text-emerald-600">
            {citizens.filter((c) => c.voting_intention === "alta" || c.voting_intention === "media").length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Opositores / Críticos</p>
          <p className="text-2xl font-bold text-red-600">
            {citizens.filter((c) => c.voting_intention === "opositor" || c.voting_intention === "baja").length}
          </p>
        </div>
      </div>

      {/* Map card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-700">Mapa de participación ciudadana</h3>
          <span className="text-xs text-zinc-400">{(data?.total ?? 0)} puntos totales</span>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 flex flex-wrap gap-3 border-b border-zinc-100 bg-zinc-50">
          {Object.entries(VOTE_COLORS).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-zinc-600">
              <span style={{ backgroundColor: c }} className="w-3 h-3 rounded-full inline-block" />
              {intentionLabel(k)}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-zinc-600">
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
          <div className="flex flex-col items-center justify-center h-80 text-zinc-400 bg-zinc-50">
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
          className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-zinc-100">
            <h3 className="text-sm font-bold text-zinc-700">Últimos ciudadanos registrados con ubicación</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-500">
                  <th className="text-left px-4 py-2 font-medium">Nombre</th>
                  <th className="text-left px-4 py-2 font-medium">Distrito declarado</th>
                  <th className="text-left px-4 py-2 font-medium">Ubicación GPS</th>
                  <th className="text-left px-4 py-2 font-medium">Intención</th>
                  <th className="text-right px-4 py-2 font-medium">Puntos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {citizens.slice(0, 20).map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50 transition">
                    <td className="px-4 py-2 font-medium text-zinc-800">{c.name ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-600">{c.district ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-500 text-xs">
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
                        <span className="text-zinc-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-zinc-800">{c.points}</td>
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
    <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
      <p className="text-sm">Sin datos de {label} disponibles.</p>
      <p className="text-xs mt-1">Los datos aparecerán cuando haya más conversaciones.</p>
    </div>
  );
}
