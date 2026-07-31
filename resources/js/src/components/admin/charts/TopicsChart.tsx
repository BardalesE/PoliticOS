"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCandidate } from "@/context/CandidateContext";

// Paleta categórica unificada del panel admin (validada con
// dataviz/scripts/validate_palette.js — orden fijo, no rotar). El primer
// color lo pone el tenant (profile.color_primary); estos son los 7 restantes.
const STATIC_COLORS = ["#2563EB", "#16A34A", "#F59E0B", "#7C3AED", "#0891B2", "#DB2777", "#E85D04"];

type DataPoint = { topic: string; count: number };

type CustomTooltipProps = {
  active?: boolean;
  payload?: { name: string; value: number; payload: DataPoint }[];
};

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg">
      <p className="text-xs text-gray-400 capitalize mb-0.5">{payload[0].name}</p>
      <p className="text-sm font-bold text-gray-900">{payload[0].value} msgs</p>
    </div>
  );
}

function CustomLegend({ payload }: { payload?: { value: string; color: string }[] }) {
  if (!payload) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3">
      {payload.map((e, i) => (
        <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600 capitalize">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
          {e.value}
        </li>
      ))}
    </ul>
  );
}

type TopicsChartProps = { data: DataPoint[] };

export function TopicsChart({ data }: TopicsChartProps) {
  const { profile } = useCandidate();
  const COLORS = [profile.color_primary || "#DC2626", ...STATIC_COLORS];

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="topic"
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={88}
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
