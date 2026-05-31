"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useCandidate } from "@/context/CandidateContext";

const STATIC_COLORS = ["#E85D04", "#F59E0B", "#16A34A", "#2563EB", "#7C3AED", "#DB2777", "#0891B2"];

type DataPoint = { topic: string; count: number };

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-xl">
      <p className="text-xs text-gray-400 capitalize mb-0.5">{payload[0].payload.topic}</p>
      <p className="text-sm font-bold text-gray-900">{payload[0].value} mensajes</p>
    </div>
  );
}

type Props = { data: DataPoint[] };

export function HorizontalTopicsChart({ data }: Props) {
  const { profile } = useCandidate();
  const brandColor   = profile.color_primary || "#DC2626";
  const COLORS       = [brandColor, ...STATIC_COLORS];
  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={Math.max(sorted.length * 32 + 24, 140)}>
      <BarChart
        layout="vertical"
        data={sorted}
        margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
        barSize={14}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="topic"
          tick={{ fontSize: 11, fill: "#374151" }}
          axisLine={false}
          tickLine={false}
          width={72}
          tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
          {sorted.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
