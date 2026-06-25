"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  MessageSquare, Users, FileText, Video,
  HelpCircle, TrendingUp, TrendingDown, Activity,
  Clock, Loader2, ArrowRight, Zap, BarChart2,
  Flame, Award, Rocket,
} from "lucide-react";
import Link from "next/link";
import { adminApi, invalidateCache, type AdminAnalytics, type OnboardingStatus } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCandidate } from "@/context/CandidateContext";
import { ConversationsChart } from "@/components/admin/charts/ConversationsChart";
import { TopicsChart } from "@/components/admin/charts/TopicsChart";
import { ProposalsStatusChart } from "@/components/admin/charts/ProposalsStatusChart";
import { WeeklyBarChart } from "@/components/admin/charts/WeeklyBarChart";
import { HorizontalTopicsChart } from "@/components/admin/charts/HorizontalTopicsChart";
import { cn } from "@/lib/utils";

// ─── Periodo ──────────────────────────────────────────────────────────────

type Period = "day" | "week" | "month" | "year";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day",   label: "24h" },
  { value: "week",  label: "7D" },
  { value: "month", label: "30D" },
  { value: "year",  label: "12M" },
];

const PERIOD_SECTION_TITLE: Record<Period, string> = {
  day:   "Conversaciones — últimas 24 horas",
  week:  "Conversaciones — últimos 7 días",
  month: "Conversaciones — últimos 30 días",
  year:  "Conversaciones — últimos 12 meses",
};

// ─── Derived analytics helpers ────────────────────────────────────────────

function computeTrend(data: { date: string; count: number }[]) {
  if (data.length < 14) return null;
  const last7  = data.slice(-7).reduce((s, d) => s + d.count, 0);
  const prev7  = data.slice(-14, -7).reduce((s, d) => s + d.count, 0);
  if (prev7 === 0) return null;
  return Math.round(((last7 - prev7) / prev7) * 100);
}

function peakDay(data: { date: string; count: number }[]) {
  if (!data.length) return null;
  return data.reduce((best, d) => (d.count > best.count ? d : best));
}

function todayCount(data: { date: string; count: number }[]) {
  const today = new Date().toISOString().slice(0, 10);
  return data.find((d) => d.date === today)?.count ?? 0;
}

// ─── Stat card ────────────────────────────────────────────────────────────

type StatCardProps = {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  bg: string;
  delay?: number;
  href?: string;
  trend?: number | null;
};

function StatCard({ icon: Icon, label, value, sub, accent, bg, delay = 0, href, trend }: StatCardProps) {
  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden"
    >
      {/* Subtle accent line on top */}
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl opacity-60" style={{ background: accent }} />

      <div className="flex items-start justify-between mb-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
        <div className="flex items-center gap-1.5">
          {trend !== null && trend !== undefined && (
            <span className={cn(
              "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              trend >= 0
                ? "text-green-700 bg-green-50"
                : "text-red-600 bg-red-50"
            )}>
              {trend >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
              {Math.abs(trend)}%
            </span>
          )}
          {href && <ArrowRight size={12} className="text-gray-300 group-hover:text-gray-600 transition-colors" />}
        </div>
      </div>

      <p className="font-serif text-3xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-xs text-gray-500 mt-1.5 font-medium">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </motion.div>
  );

  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

// ─── Section wrapper ──────────────────────────────────────────────────────

function Section({ title, sub, action, children, className }: {
  title: string; sub?: string; action?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden", className)}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          {sub && <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-0.5">{sub}</p>}
          <h3 className="font-serif text-base font-bold text-gray-900">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Insight chip ─────────────────────────────────────────────────────────

function InsightChip({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string; color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-gray-200 shadow-sm">
      <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + "18" }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-gray-400 leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { token, user } = useAuth();
  const { profile } = useCandidate();
  const brandColor  = profile.color_primary || "#DC2626";
  const brandBg     = `${brandColor}12`;
  const [data, setData]       = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [period, setPeriod]   = useState<Period>("month");

  useEffect(() => {
    if (!token) return;
    adminApi.onboarding.status(token).then(setOnboarding).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    const fetchData = (initial = false) => {
      if (!initial) invalidateCache(`/admin/analytics?period=${period}`);
      adminApi.analytics.summary(token, period)
        .then((d) => { setData(d); setError(false); })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    };

    fetchData(true);
    const timer = setInterval(() => fetchData(false), 30_000);
    return () => clearInterval(timer);
  }, [token, period]);

  const derived = useMemo(() => {
    if (!data) return null;
    const trend = computeTrend(data.conversations_per_day);
    const peak  = peakDay(data.conversations_per_day);
    const today = todayCount(data.conversations_per_day);
    const last7 = data.conversations_per_day.slice(-7).reduce((s, d) => s + d.count, 0);
    const completedProposals = data.proposals_by_status["completada"] ?? 0;
    const totalProposals = data.content_counts.proposals;
    const completionRate = totalProposals > 0 ? Math.round((completedProposals / totalProposals) * 100) : 0;
    return { trend, peak, today, last7, completionRate };
  }, [data]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-PE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-brand-500" />
          <p className="text-sm text-gray-400">Cargando métricas...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center">
          <BarChart2 size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">Error cargando métricas</p>
          <p className="text-gray-400 text-xs mt-1">Verifica que el servidor esté activo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5">

      {/* ── Onboarding pendiente ── */}
      {onboarding && !onboarding.completed_at && (
        <Link href="/admin/onboarding"
          className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-colors group">
          <div className="h-10 w-10 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
            <Rocket size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Termina de configurar tu campaña</p>
            <p className="text-xs text-gray-500">
              {!onboarding.profile.complete
                ? "Falta completar el perfil del candidato."
                : onboarding.knowledge.total === 0
                ? "Falta subir documentos para que el asistente responda con datos reales."
                : "Prueba el chat y finaliza el onboarding."}
            </p>
          </div>
          <ArrowRight size={16} className="text-brand-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-1">Panel de control</p>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-gray-900">
            Bienvenido, {profile.name !== "Candidato" ? profile.name.split(" ")[0] : (user?.name?.split(" ")[0] ?? "Administrador")}
          </h1>
          <p className="text-xs text-gray-400 mt-1 capitalize">{dateStr}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Selector de periodo */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150",
                  period === p.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Chip de tendencia — solo cuando period === "month" (14 buckets diarios = sentido) */}
          {period === "month" && derived?.trend !== null && derived?.trend !== undefined && (
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border",
              derived.trend >= 0
                ? "text-green-700 bg-green-50 border-green-100"
                : "text-red-600 bg-red-50 border-red-100"
            )}>
              {derived.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {derived.trend >= 0 ? "+" : ""}{derived.trend}% vs semana anterior
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            En vivo
          </div>
        </div>
      </div>

      {/* ── Fila 1: 6 KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          icon={FileText} label="Propuestas" value={data.content_counts.proposals}
          accent={brandColor} bg={brandBg} delay={0} href="/admin/proposals"
          sub={`${data.proposals_by_status["completada"] ?? 0} completadas`}
          trend={null}
        />
        <StatCard
          icon={Video} label="Videos" value={data.content_counts.videos}
          accent="#D97706" bg="#FFFBEB" delay={0.04} href="/admin/videos"
          trend={null}
        />
        <StatCard
          icon={HelpCircle} label="FAQs" value={data.content_counts.faqs}
          accent="#7C3AED" bg="#F5F3FF" delay={0.08} href="/admin/faqs"
          trend={null}
        />
        <StatCard
          icon={Users} label="Sesiones totales" value={data.sessions.total.toLocaleString()}
          accent="#059669" bg="#ECFDF5" delay={0.12} href="/admin/chat-sessions"
          sub="conversaciones"
          trend={null}
        />
        <StatCard
          icon={MessageSquare} label="Mensajes" value={data.messages.total.toLocaleString()}
          accent="#2563EB" bg="#EFF6FF" delay={0.16}
          trend={null}
        />
        <StatCard
          icon={Clock} label="Msgs / sesión" value={data.sessions.avg_messages}
          accent="#DB2777" bg="#FDF2F8" delay={0.20}
          sub="promedio"
          trend={null}
        />
      </div>

      {/* ── Fila 2: Insight chips ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InsightChip
          icon={Activity}
          label="Sesiones hoy"
          value={`${data.sessions.today} sesión${data.sessions.today !== 1 ? "es" : ""}`}
          color="#059669"
        />
        <InsightChip
          icon={TrendingUp}
          label="Esta semana"
          value={`${data.sessions.this_week} sesiones`}
          color="#2563EB"
        />
        <InsightChip
          icon={Flame}
          label="Punto pico"
          value={derived?.peak
            ? `${derived.peak.count} sesiones`
            : "Sin datos"
          }
          color={brandColor}
        />
        <InsightChip
          icon={Award}
          label="Propuestas completadas"
          value={`${derived?.completionRate ?? 0}% del total`}
          color="#7C3AED"
        />
      </div>

      {/* ── Fila 3: Gráfica principal (full width) ── */}
      <Section
        title={PERIOD_SECTION_TITLE[period]}
        sub="Actividad"
        action={
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
              Conversaciones
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-brand-500 opacity-30 inline-block border-dashed border-t-2 border-brand-500" />
              Promedio
            </span>
          </div>
        }
      >
        {data.conversations_per_day.length > 0 ? (
          <ConversationsChart
            data={data.conversations_per_day}
            height={280}
            granularity={data.granularity}
          />
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            Sin actividad todavía.
          </div>
        )}
      </Section>

      {/* ── Fila 4: Tres charts secundarios ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Últimos 7 días — solo cuando la granularidad es diaria */}
        {data.granularity === "day" && (
          <Section title="Últimos 7 días" sub="Reciente">
            {data.conversations_per_day.length >= 7 ? (
              <WeeklyBarChart data={data.conversations_per_day} />
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Sin datos.</div>
            )}
          </Section>
        )}

        {/* Temas por mensajes */}
        <Section title="Mensajes por tema" sub="Temas">
          {data.top_topics.length > 0 ? (
            <HorizontalTopicsChart data={data.top_topics} />
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Sin datos.</div>
          )}
        </Section>

        {/* Propuestas por estado */}
        <Section title="Estado de propuestas" sub="Contenido">
          {Object.keys(data.proposals_by_status).length > 0 ? (
            <>
              <ProposalsStatusChart data={data.proposals_by_status} />
              {/* Mini summary */}
              <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                {Object.entries(data.proposals_by_status).map(([status, count]) => {
                  const labels: Record<string, string> = { propuesta: "Propuesta", en_curso: "En curso", completada: "Completada" };
                  const colors: Record<string, string> = { propuesta: "#3b82f6", en_curso: "#f59e0b", completada: "#22c55e" };
                  return (
                    <div key={status} className="flex-1 text-center">
                      <p className="text-lg font-bold text-gray-900" style={{ color: colors[status] }}>{count}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{labels[status] ?? status}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Sin propuestas.</div>
          )}
        </Section>
      </div>

      {/* ── Fila 5: Top preguntas + Sesiones recientes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top preguntas */}
        <Section title="Preguntas más frecuentes" sub="Interacciones">
          {data.top_questions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin interacciones aún.</p>
          ) : (
            <div className="space-y-3">
              {data.top_questions.slice(0, 8).map((q, i) => {
                const maxCount = data.top_questions[0]?.count ?? 1;
                const pct = Math.round((q.count / maxCount) * 100);
                const isTop = i === 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          "text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                          isTop ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500"
                        )}>
                          {i + 1}
                        </span>
                        <p className="text-xs text-gray-700 truncate capitalize">{q.question}</p>
                      </div>
                      <span className={cn(
                        "shrink-0 text-xs font-bold px-2 py-0.5 rounded-full",
                        isTop ? "text-brand-600 bg-brand-50" : "text-gray-500 bg-gray-100"
                      )}>
                        {q.count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden ml-7">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.3, delay: i * 0.03 }}
                        className="h-full rounded-full"
                        style={{ background: isTop ? brandColor : `${brandColor}60` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Sesiones recientes */}
        <Section
          title="Sesiones recientes"
          sub="Conversaciones"
          action={
            <Link
              href="/admin/chat-sessions"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-500 transition-colors font-medium"
            >
              Ver todas <ArrowRight size={11} />
            </Link>
          }
        >
          {data.recent_sessions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin sesiones recientes.</p>
          ) : (
            <div className="space-y-0 divide-y divide-gray-100 -mt-1">
              {data.recent_sessions.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                      <MessageSquare size={12} className="text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-gray-600 truncate">{s.session_id.slice(0, 12)}…</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{s.ip ?? "IP no disponible"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
                      {s.messages_count} msgs
                    </span>
                    <span className="text-[11px] text-gray-400 hidden sm:block">
                      {new Date(s.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Fila 6: Distribution donut + Topics completo ── */}
      {data.top_topics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            <Section title="Distribución por tema" sub="Temas">
              <TopicsChart data={data.top_topics} />
            </Section>
          </div>
          <div className="lg:col-span-3">
            <Section title="Ranking de temas" sub="Popularidad">
              <div className="space-y-2">
                {[...data.top_topics]
                  .sort((a, b) => b.count - a.count)
                  .map((t, i) => {
                    const max = data.top_topics[0]?.count ?? 1;
                    const pct = Math.round((t.count / max) * 100);
                    const RANK_COLORS = [brandColor,"#E85D04","#F59E0B","#16A34A","#2563EB","#7C3AED","#DB2777","#0891B2"];
                    const color = RANK_COLORS[i % RANK_COLORS.length];
                    return (
                      <div key={t.topic} className="flex items-center gap-3">
                        <span className="text-[10px] text-gray-400 w-4 shrink-0 text-right">#{i + 1}</span>
                        <p className="text-xs text-gray-700 capitalize w-24 shrink-0">{t.topic}</p>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.25, delay: i * 0.03 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-600 w-10 text-right shrink-0">
                          {t.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </Section>
          </div>
        </div>
      )}

    </div>
  );
}
