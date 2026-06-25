"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useCandidate } from "@/context/CandidateContext";

type DataPoint = { date: string; count: number };
type Granularity = "hour" | "day" | "month";

function formatTick(value: string, granularity: Granularity): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  if (granularity === "hour") {
    return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (granularity === "month") {
    return d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
  }
  // day
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

function formatTooltipDate(value: string, granularity: Granularity): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  if (granularity === "hour") {
    return d.toLocaleString("es-PE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (granularity === "month") {
    return d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  }
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "long" });
}

function CustomTooltip({ active, payload, label, granularity }: any) {
  if (!active || !payload?.length) return null;
  const dateStr = label ? formatTooltipDate(label, granularity as Granularity) : "";
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-xl">
      <p className="text-xs text-gray-400 mb-0.5">{dateStr}</p>
      <p className="text-sm font-bold text-gray-900">{payload[0].value} conversaciones</p>
    </div>
  );
}

type Props = { data: DataPoint[]; height?: number; granularity?: Granularity };

export function ConversationsChart({ data, height = 280, granularity = "day" }: Props) {
  const { profile } = useCandidate();
  const color = profile.color_primary || "#DC2626";

  const avg = data.length > 0
    ? Math.round(data.reduce((s, d) => s + d.count, 0) / data.length)
    : 0;

  // Calcular step de ticks para no saturar el eje X
  const step = Math.max(1, Math.floor(data.length / 6));
  const ticks = data
    .filter((_, i) => i % step === 0 || i === data.length - 1)
    .map((d) => d.date);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="brandGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          ticks={ticks}
          tickFormatter={(v) => formatTick(v, granularity)}
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
        {avg > 0 && (
          <ReferenceLine
            y={avg}
            stroke={color}
            strokeDasharray="4 4"
            strokeOpacity={0.35}
            label={{ value: `Prom. ${avg}`, position: "right", fontSize: 9, fill: color, opacity: 0.6 }}
          />
        )}
        <Tooltip
          content={<CustomTooltip granularity={granularity} />}
          cursor={{ stroke: `${color}26`, strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={color}
          strokeWidth={2}
          fill="url(#brandGradient)"
          dot={false}
          activeDot={{ r: 5, fill: color, stroke: "#ffffff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
