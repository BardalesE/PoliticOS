"use client";
import { useMemo } from "react";
import { Timer } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import type { CampaignEvent } from "@/lib/api";

interface CountdownProps {
  featured?:        CampaignEvent | null;
  electionDateIso?: string | null;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

/**
 * Franja delgada de cuenta regresiva. Reutiliza datos que ya llegan a la home:
 * el evento destacado (/events/featured) o la fecha de elección de home-settings.
 * Sin fecha válida (o ya pasada) no renderiza nada.
 */
export function Countdown({ featured = null, electionDateIso = null }: CountdownProps) {
  const { target, label } = useMemo(() => {
    if (featured?.event_date) {
      const d = new Date(featured.event_date);
      if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
        return { target: d, label: featured.title };
      }
    }
    if (electionDateIso) {
      const d = new Date(electionDateIso + "T08:00:00");
      if (!isNaN(d.getTime())) {
        return { target: d, label: `Elecciones ${d.getFullYear()}` };
      }
    }
    return { target: null as Date | null, label: "" };
  }, [featured, electionDateIso]);

  // timeLeft arranca en null y se calcula en cliente: sin mismatch de hidratación.
  const timeLeft = useCountdown(target);
  if (!target || !timeLeft) return null;

  return (
    <section
      aria-label={`Cuenta regresiva: ${label}`}
      className="px-5 py-2.5"
      style={{ background: "rgb(var(--brand-dark-rgb))" }}
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-white">
        <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[2px] text-white/80 min-w-0">
          <Timer size={12} className="shrink-0" aria-hidden />
          <span className="truncate max-w-[190px] sm:max-w-none">{label}</span>
        </span>
        <span className="font-serif font-extrabold tabular-nums text-sm sm:text-base tracking-tight">
          {timeLeft.days}<span className="text-white/60 font-sans text-[10px] mr-1.5">d</span>
          {pad(timeLeft.hours)}<span className="text-white/60 font-sans text-[10px] mr-1.5">h</span>
          {pad(timeLeft.minutes)}<span className="text-white/60 font-sans text-[10px] mr-1.5">m</span>
          {pad(timeLeft.seconds)}<span className="text-white/60 font-sans text-[10px]">s</span>
        </span>
      </div>
    </section>
  );
}
