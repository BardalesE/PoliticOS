"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { CalendarDays, MapPin, Clock, ArrowRight, Radio, Zap } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { homeApi, type CampaignEvent } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";
import { useCountdown } from "@/hooks/useCountdown";

const DEFAULT_ELECTION_ISO = "2026-10-04";

function formatEventTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const MONTHS_SHORT = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const MONTHS_LONG  = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const WEEKDAYS     = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { day: "—", month: "---", weekday: "---", full: "---" };
  return {
    day:     d.getDate(),
    month:   MONTHS_SHORT[d.getMonth()],
    weekday: WEEKDAYS[d.getDay()],
    full:    `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`,
  };
}

// ── Dígito del countdown ──────────────────────────────────────────────────────
function Digit({ value, label }: { value: number; label: string }) {
  const str = String(value).padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      <div
        className="relative w-14 sm:w-[72px] h-14 sm:h-[72px] rounded-xl sm:rounded-2xl overflow-hidden flex items-center justify-center"
        style={{
          background: "linear-gradient(145deg, color-mix(in srgb, rgb(var(--brand-dark-rgb)) 55%, black) 0%, rgb(var(--brand-primary-rgb)) 60%, color-mix(in srgb, rgb(var(--brand-primary-rgb)) 75%, white) 100%)",
          boxShadow: "0 8px 24px var(--brand-glow-40), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-black/20 z-10" />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-white/[0.08] rounded-t-2xl" />
        <AnimatePresence mode="popLayout">
          <motion.span
            key={str}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="font-serif text-xl sm:text-3xl font-extrabold text-white tabular-nums relative z-20 tracking-tight"
          >
            {str}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="text-[9px] sm:text-[10px] uppercase tracking-[1.5px] text-brand-600 font-extrabold">{label}</span>
    </div>
  );
}

// ── Separador animado ─────────────────────────────────────────────────────────
function Sep() {
  return (
    <div className="flex flex-col gap-1.5 pb-6 items-center">
      <motion.span
        animate={{ opacity: [1, 0.2, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="w-1.5 h-1.5 rounded-full bg-brand-400"
      />
      <motion.span
        animate={{ opacity: [1, 0.2, 1] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
        className="w-1.5 h-1.5 rounded-full bg-brand-400"
      />
    </div>
  );
}

// ── Card de evento próximo ────────────────────────────────────────────────────
function EventMiniCard({ event, index }: { event: CampaignEvent; index: number }) {
  const df = formatEventDate(event.event_date);
  const time = formatEventTime(event.event_date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, delay: index * 0.07, type: "spring", stiffness: 90 }}
    >
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-ink-200 hover:border-brand-300 transition-colors duration-200"
        style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
      >
        {/* Fecha */}
        <div
          className="flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center"
          style={{
            background: "var(--brand-grad)",
            boxShadow: "0 4px 14px var(--brand-glow-35)",
          }}
        >
          <span className="text-white font-serif font-extrabold text-xl leading-none">{df.day}</span>
          <span className="text-white/70 text-[9px] font-extrabold tracking-wider mt-0.5">{df.month}</span>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-serif font-bold text-ink-800 truncate leading-tight">{event.title}</p>
          <div className="flex items-center gap-3 mt-1">
            {event.location && (
              <span className="flex items-center gap-1 text-[11px] text-ink-400 font-medium truncate">
                <MapPin size={10} className="text-brand-400 shrink-0" />
                {event.location}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] text-brand-600 font-extrabold shrink-0">
              <Clock size={10} />
              {time}
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function EventsSection({
  initialEvents   = [],
  initialFeatured = null,
  title           = "Próximos encuentros con el pueblo.",
  badge           = "Agenda",
  electionDateIso = DEFAULT_ELECTION_ISO,
}: {
  initialEvents?:   CampaignEvent[];
  initialFeatured?: CampaignEvent | null;
  title?:           string;
  badge?:           string;
  electionDateIso?: string;
}) {
  const { profile } = useCandidate();
  const electionDate = useMemo(() => {
    if (electionDateIso) {
      const d = new Date(electionDateIso + "T08:00:00");
      if (!isNaN(d.getTime())) return d;
    }
    return new Date(DEFAULT_ELECTION_ISO + "T08:00:00");
  }, [electionDateIso]);

  const [events,   setEvents]   = useState<CampaignEvent[]>(initialEvents);
  const [featured, setFeatured] = useState<CampaignEvent | null>(initialFeatured);
  const [countdownTarget, setCountdownTarget] = useState<Date>(() => {
    if (initialFeatured?.event_date) {
      const d = new Date(initialFeatured.event_date);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date((electionDateIso ?? DEFAULT_ELECTION_ISO) + "T08:00:00");
  });

  useEffect(() => {
    if (initialEvents.length || initialFeatured) return;
    homeApi.events().then(setEvents).catch(() => {});
    homeApi.featuredEvent().then((data) => {
      if (data?.event_date) {
        const d = new Date(data.event_date);
        if (!isNaN(d.getTime())) { setFeatured(data); setCountdownTarget(d); }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeLeft = useCountdown(countdownTarget);

  const validFeatured = featured?.event_date ? featured : null;
  const displayEvent = validFeatured ?? events.find((e) => new Date(e.event_date) >= new Date()) ?? null;
  const upcomingEvents = events.filter((e) => e !== displayEvent).slice(0, 3);
  const df = displayEvent ? formatEventDate(displayEvent.event_date) : null;
  const eventTime = displayEvent ? formatEventTime(displayEvent.event_date) : null;

  return (
    <section id="eventos" className="relative py-20 md:py-28 px-5 overflow-hidden" style={{ background: "var(--page-bg)" }}>
      {/* Fondo decorativo */}
      <div
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 50% at 0% 50%, var(--brand-soft-bg) 0%, transparent 60%)" }}
      />

      <div className="max-w-5xl mx-auto relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <span className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-extrabold uppercase tracking-[2px] px-4 py-2 rounded-full mb-4">
            <Zap size={11} />
            {badge}
          </span>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mt-2">
            {title.includes("*")
              ? title.split(/(\*[^*]+\*)/).map((p, i) =>
                  p.startsWith("*") && p.endsWith("*")
                    ? <span key={i} style={{ background: "var(--brand-grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{p.slice(1,-1)}</span>
                    : <span key={i}>{p}</span>
                )
              : title
            }
          </h2>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">

          {/* ── Columna izquierda: countdown ── */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-2"
          >
            <div
              className="rounded-2xl overflow-hidden border border-brand-200"
              style={{ boxShadow: "0 8px 32px var(--brand-glow-15)" }}
            >
              {/* Header */}
              <div className="px-5 py-4" style={{ background: "var(--brand-grad)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/90 font-extrabold truncate">
                    {displayEvent ? displayEvent.title : "Elecciones 2026"}
                  </p>
                </div>
                <p className="text-white/60 text-[11px] font-semibold pl-4">Cuenta regresiva</p>
              </div>

              {/* Dígitos */}
              <div className="px-5 py-6 bg-white">
                {timeLeft ? (
                  <div className="flex gap-1.5 sm:gap-2 items-end flex-wrap">
                    <Digit value={timeLeft.days}    label="días" />
                    <Sep />
                    <Digit value={timeLeft.hours}   label="horas" />
                    <Sep />
                    <Digit value={timeLeft.minutes} label="min" />
                    <Sep />
                    <Digit value={timeLeft.seconds} label="seg" />
                  </div>
                ) : (
                  <motion.p
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="font-serif text-3xl font-bold"
                    style={{ background: "var(--brand-grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
                  >
                    ¡Es hoy! 🗳️
                  </motion.p>
                )}
              </div>

              {/* Filas de info */}
              <div className="border-t border-ink-100 divide-y divide-ink-50 bg-white">
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <CalendarDays size={15} className="text-brand-500 shrink-0" />
                  <div>
                    <p className="text-[9px] text-brand-500 font-bold uppercase tracking-wider">Fecha</p>
                    <p className="text-sm font-semibold text-ink-800">
                      {df?.full ?? (profile.election_date || electionDate.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <Clock size={15} className="text-brand-500 shrink-0" />
                  <div>
                    <p className="text-[9px] text-brand-500 font-bold uppercase tracking-wider">Hora</p>
                    <p className="text-xl font-extrabold text-ink-900 leading-none tracking-tight">
                      {eventTime ?? "8:00 AM"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <MapPin size={15} className="text-brand-500 shrink-0" />
                  <div>
                    <p className="text-[9px] text-brand-500 font-bold uppercase tracking-wider">Lugar</p>
                    <p className="text-sm font-semibold text-ink-800">
                      {displayEvent?.location ?? (profile.location || "Cajamarca, Perú")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Columna derecha: evento destacado ── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.06 }}
            className="lg:col-span-3 flex flex-col gap-5"
          >
            {displayEvent ? (
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="rounded-2xl overflow-hidden border border-ink-200 bg-white"
                style={{ boxShadow: "0 8px 40px var(--brand-glow-10)" }}
              >
                {/* Imagen */}
                <div className="relative aspect-video bg-brand-50 overflow-hidden">
                  {displayEvent.image_url ? (
                    <Image
                      src={displayEvent.image_url}
                      alt={displayEvent.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 60vw, 45vw"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-brand-50 to-brand-100">
                      <CalendarDays size={48} className="text-brand-400" />
                      <p className="text-sm text-brand-400 font-medium">Imagen del evento</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

                  {/* Badge destacado */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-700 backdrop-blur-sm">
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                    <span className="text-xs font-bold text-white">
                      {displayEvent.is_featured ? "Evento destacado" : "Próximo evento"}
                    </span>
                  </div>

                  {/* Hora flotante */}
                  {eventTime && (
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      <span className="text-xs font-extrabold text-brand-800 flex items-center gap-1">
                        <Clock size={11} /> {eventTime}
                      </span>
                    </div>
                  )}

                  {/* Fecha en esquina inferior */}
                  {df && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                      <div
                        className="w-11 h-11 rounded-xl flex flex-col items-center justify-center"
                        style={{ background: "var(--brand-grad)", boxShadow: "0 4px 12px var(--brand-glow-40)" }}
                      >
                        <span className="text-white font-serif font-extrabold text-base leading-none">{df.day}</span>
                        <span className="text-white/70 text-[8px] font-extrabold tracking-wider">{df.month}</span>
                      </div>
                      <div>
                        <p className="text-white text-xs font-extrabold capitalize">{df.weekday}</p>
                        {displayEvent.location && (
                          <p className="text-white/70 text-[10px] font-medium">{displayEvent.location}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Contenido */}
                <div className="p-5">
                  <h3 className="font-serif text-xl font-bold text-ink-800 mb-2 leading-snug">
                    {displayEvent.title}
                  </h3>
                  {displayEvent.description && (
                    <p className="text-sm text-ink-500 mb-4 line-clamp-2 leading-relaxed">
                      {displayEvent.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4 items-center">
                    {displayEvent.stream_url && (
                      <a
                        href={displayEvent.stream_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900 transition-colors"
                      >
                        <Radio size={14} /> Ver transmisión
                      </a>
                    )}
                    <TenantLink
                      href="/chat"
                      className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-brand-700 font-semibold transition-colors"
                    >
                      Más información <ArrowRight size={14} />
                    </TenantLink>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-10 text-center">
                <div
                  className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4 mx-auto"
                  style={{ background: "var(--brand-grad)", boxShadow: "0 8px 24px var(--brand-glow-30)" }}
                >
                  <CalendarDays size={28} className="text-white" />
                </div>
                <h3 className="font-serif text-xl font-bold text-ink-800 mb-2">Gran Mitin de Campaña</h3>
                <p className="text-ink-500 text-sm mb-4 leading-relaxed max-w-xs mx-auto">
                  Próximamente se anunciarán los eventos. Síguenos en redes sociales.
                </p>
                {profile.facebook_url && (
                  <a
                    href={profile.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900 transition-colors"
                  >
                    Seguir en Facebook <ArrowRight size={14} />
                  </a>
                )}
              </div>
            )}

            {/* Próximos eventos */}
            {upcomingEvents.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-[2px] text-ink-400 font-extrabold px-1">
                  También próximamente
                </p>
                {upcomingEvents.map((ev, i) => (
                  <EventMiniCard key={ev.id} event={ev} index={i} />
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
