"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// Barras apiladas de apoyo (sí/no/indeciso) por lugar/distrito.
// Reemplaza al "mapa": distribución de apoyo sin coordenadas GPS.

const COLORS = { si: "#16A34A", no: "#DC2626", indeciso: "#94A3B8" };
const LABELS = { si: "Sí", no: "No", indeciso: "Indeciso" } as const;

type DataPoint = { place: string; si: number; no: number; indeciso: number; total: number };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-xl">
      <p className="text-xs font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs text-gray-600 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {LABELS[p.dataKey as keyof typeof LABELS]}: <span className="font-bold text-gray-900">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function CustomLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3">
      {(["si", "no", "indeciso"] as const).map((k) => (
        <li key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[k] }} />
          {LABELS[k]}
        </li>
      ))}
    </ul>
  );
}

export function SurveySupportByPlaceChart({ data }: { data: DataPoint[] }) {
  const sorted = [...data].sort((a, b) => b.total - a.total).slice(0, 12);

  return (
    <ResponsiveContainer width="100%" height={Math.max(sorted.length * 38 + 40, 180)}>
      <BarChart layout="vertical" data={sorted} margin={{ top: 4, right: 16, left: 4, bottom: 0 }} barSize={16}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="place"
          tick={{ fontSize: 11, fill: "#374151" }}
          axisLine={false}
          tickLine={false}
          width={96}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend content={<CustomLegend />} />
        <Bar dataKey="si" stackId="a" fill={COLORS.si} radius={[0, 0, 0, 0]} />
        <Bar dataKey="no" stackId="a" fill={COLORS.no} />
        <Bar dataKey="indeciso" stackId="a" fill={COLORS.indeciso} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
