"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Loader2, MapPin, MessageSquare, X } from "lucide-react";
import { adminApi, type TopicDetail } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";

type Period = "day" | "week" | "month" | "year";

const PERIOD_LABEL: Record<Period, string> = {
  day: "últimas 24 h",
  week: "últimos 7 días",
  month: "últimos 30 días",
  year: "últimos 12 meses",
};

const SENTIMENT = [
  { key: "positivo", label: "Positivo", color: "#16A34A" },
  { key: "neutral", label: "Neutral", color: "#94A3B8" },
  { key: "negativo", label: "Negativo", color: "#DC2626" },
] as const;

export const topicLabel = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);

function formatSlot(date: string, granularity: TopicDetail["granularity"]) {
  const d = new Date(granularity === "hour" ? date : `${date}T12:00:00`);
  if (granularity === "hour") return d.toLocaleTimeString("es-PE", { hour: "2-digit" });
  if (granularity === "month") return d.toLocaleDateString("es-PE", { month: "short" });
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

/**
 * Panel lateral con el detalle de un tema: qué pregunta la gente, desde dónde,
 * con qué tono y las conversaciones para leerlas. Se abre al hacer clic en
 * cualquier gráfico de temas del dashboard.
 */
export function TopicDetailDrawer({
  topic, period, token, onClose,
}: { topic: string | null; period: Period; token: string | null; onClose: () => void }) {
  const { profile } = useCandidate();
  const brand = profile.color_primary || "#16A34A";
  const [data, setData] = useState<TopicDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topic || !token) return;
    let alive = true;
    setData(null);
    setError(null);
    adminApi.analytics.topic(token, topic, period)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError("No se pudo cargar el detalle del tema."); });
    return () => { alive = false; };
  }, [topic, period, token]);

  useEffect(() => {
    if (!topic) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [topic, onClose]);

  const trend = data && data.previous_total > 0
    ? Math.round(((data.total_messages - data.previous_total) / data.previous_total) * 100)
    : null;
  const sentimentTotal = data ? data.sentiment.positivo + data.sentiment.neutral + data.sentiment.negativo : 0;
  const maxQuestion = data?.questions[0]?.count ?? 1;
  const maxZone = data?.zones[0]?.count ?? 1;

  return (
    <AnimatePresence>
      {topic && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Detalle del tema ${topicLabel(topic)}`}>
          <motion.div
            className="absolute inset-0 bg-black/30"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="relative h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22 }}
          >
            {/* Encabezado */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500">Tema · {PERIOD_LABEL[period]}</p>
                <h2 className="font-serif text-xl font-bold text-gray-900">{topicLabel(topic)}</h2>
              </div>
              <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            {!data && !error && (
              <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-brand-400" /></div>
            )}
            {error && <p className="px-6 py-10 text-sm text-red-600">{error}</p>}

            {data && (
              <div className="px-6 py-5 space-y-7">
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-3">
                  <Kpi label="Preguntas" value={data.total_messages} />
                  <Kpi label="Conversaciones" value={data.total_conversations} />
                  <Kpi label="Del total con tema" value={`${data.share}%`} />
                </div>
                {trend !== null && (
                  <p className={`-mt-4 text-xs font-medium flex items-center gap-1 ${trend >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {trend >= 0 ? "+" : ""}{trend}% frente al periodo anterior ({data.previous_total})
                  </p>
                )}

                {/* Tendencia */}
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Evolución</h3>
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={data.series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <XAxis
                        dataKey="date" tickLine={false} axisLine={false} interval="preserveStartEnd"
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickFormatter={(d) => formatSlot(d, data.granularity)}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(0,0,0,0.04)" }}
                        formatter={(v) => [`${v} preguntas`, ""]}
                        labelFormatter={(d) => formatSlot(String(d), data.granularity)}
                      />
                      <Bar dataKey="count" fill={brand} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </section>

                {/* Qué pregunta la gente */}
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Qué pregunta la gente</h3>
                  {data.questions.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin preguntas en este periodo.</p>
                  ) : (
                    <ol className="space-y-2.5">
                      {data.questions.map((q, i) => (
                        <li key={i}>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-gray-800 leading-snug">{q.question}</p>
                            <span className="text-xs font-bold text-gray-600 shrink-0">{q.count}</span>
                          </div>
                          <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(q.count / maxQuestion) * 100}%`, backgroundColor: brand }} />
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                {/* Zonas + tono */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1"><MapPin size={12} /> Desde dónde</h3>
                    {data.zones.length === 0 ? <p className="text-sm text-gray-400">Sin datos de zona.</p> : (
                      <ul className="space-y-2">
                        {data.zones.map((z) => (
                          <li key={z.name}>
                            <div className="flex justify-between text-xs text-gray-700"><span>{z.name}</span><span className="font-bold">{z.count}</span></div>
                            <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-sky-600" style={{ width: `${(z.count / maxZone) * 100}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Tono de las preguntas</h3>
                    {sentimentTotal === 0 ? <p className="text-sm text-gray-400">Aún sin analizar.</p> : (
                      <>
                        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                          {SENTIMENT.map((s) => {
                            const n = data.sentiment[s.key];
                            return n > 0 ? <div key={s.key} style={{ width: `${(n / sentimentTotal) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${n}`} /> : null;
                          })}
                        </div>
                        <ul className="mt-2 space-y-1">
                          {SENTIMENT.map((s) => (
                            <li key={s.key} className="flex items-center justify-between text-xs text-gray-600">
                              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />{s.label}</span>
                              <span className="font-bold">{Math.round((data.sentiment[s.key] / sentimentTotal) * 100)}%</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                </div>

                {/* Conversaciones */}
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Conversaciones recientes</h3>
                  {data.conversations.length === 0 ? <p className="text-sm text-gray-400">Sin conversaciones.</p> : (
                    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                      {data.conversations.map((c) => (
                        <li key={c.id}>
                          <Link href={`/admin/chat-sessions?session=${c.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                            <MessageSquare size={14} className="mt-0.5 text-gray-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-800 truncate">{c.question || "—"}</p>
                              <p className="text-[11px] text-gray-400">
                                {c.created_at ? new Date(c.created_at).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                                {" · "}{c.messages_count} msgs
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}
