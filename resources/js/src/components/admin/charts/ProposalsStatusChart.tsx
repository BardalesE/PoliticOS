"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

type DataPoint = { status: string; count: number };

const STATUS_COLORS: Record<string, string> = {
  propuesta:  "#3b82f6",
  en_curso:   "#f59e0b",
  completada: "#10b981",
};

const STATUS_LABELS: Record<string, string> = {
  propuesta:  "Propuesta",
  en_curso:   "En curso",
  completada: "Completada",
};

type TooltipProps = {
  active?: boolean;
  payload?: { value: number; payload: DataPoint }[];
  label?: string;
};

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg">
      <p className="text-sm font-bold text-gray-900">{payload[0].value} propuestas</p>
    </div>
  );
}

type Props = { data: Record<string, number> };

export function ProposalsStatusChart({ data }: Props) {
  const chartData: DataPoint[] = Object.entries(data).map(([status, count]) => ({ status, count }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={32}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis
          dataKey="status"
          tickFormatter={(v) => STATUS_LABELS[v] ?? v}
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={STATUS_COLORS[entry.status] ?? "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
