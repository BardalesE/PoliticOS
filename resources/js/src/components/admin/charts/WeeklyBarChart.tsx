"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useCandidate } from "@/context/CandidateContext";

type DataPoint = { date: string; count: number };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const date = label ? new Date(label).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short" }) : "";
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-xl">
      <p className="text-xs text-gray-400 mb-0.5 capitalize">{date}</p>
      <p className="text-sm font-bold text-gray-900">{payload[0].value} sesiones</p>
    </div>
  );
}

type Props = { data: DataPoint[] };

export function WeeklyBarChart({ data }: Props) {
  const { profile } = useCandidate();
  const color = profile.color_primary || "#DC2626";

  const last7  = data.slice(-7);
  const maxVal = Math.max(...last7.map((d) => d.count), 1);

  const formatted = last7.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("es-PE", { weekday: "short" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={formatted} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={20}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: `${color}10` }} />
        <Bar dataKey="count" radius={[5, 5, 0, 0]}>
          {formatted.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.count === maxVal ? color : `${color}60`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
