"use client";
import { useEffect, useState } from "react";
import { Eye, MessagesSquare } from "lucide-react";
import { syncVisits, type SiteStats } from "@/lib/visits";

const COUNT_UP_MS = 900;

/** Cuenta hacia arriba hasta `target` (salvo prefers-reduced-motion). */
function useCountUp(target: number | null): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (target === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target < 2) { setShown(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function Pill({ icon, value, label, live = false }: { icon: React.ReactNode; value: number; label: string; live?: boolean }) {
  return (
    <div
      role="status"
      aria-label={`${value.toLocaleString("es-PE")} ${label.toLowerCase()}`}
      className="inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-md ring-1 ring-black/5"
    >
      {icon}
      <span className="flex flex-col leading-none">
        <span className="flex items-center gap-1.5">
          <span className="font-condensed text-[26px] tabular-nums tracking-wide" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
            {value.toLocaleString("es-PE")}
          </span>
          {live && (
            <span className="h-2 w-2 rounded-full motion-safe:animate-pulse" style={{ background: "rgb(var(--brand-primary-rgb))" }} aria-hidden />
          )}
        </span>
        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[.18em] text-ink-400">{label}</span>
      </span>
    </div>
  );
}

/**
 * Pastillas "👁 1,234 VISTAS" y "💬 567 PREGUNTAS RESPONDIDAS". Cada apertura de
 * la home suma una vista (con enfriamiento por dispositivo en el servidor).
 * Si el API no responde no renderiza nada (nunca un "0" falso).
 */
export function VisitCounter({ className = "" }: { className?: string }) {
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    let alive = true;
    syncVisits().then((s) => { if (alive && s) setStats(s); });
    return () => { alive = false; };
  }, []);

  const views = useCountUp(stats?.views ?? null);
  const questions = useCountUp(stats?.questions ?? null);

  // Reserva el alto para que no haya salto de layout al cargar.
  if (!stats) return <div className={`h-[52px] ${className}`} aria-hidden />;

  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <Pill icon={<Eye size={20} className="text-ink-400" aria-hidden />} value={views} label="Vistas" live />
      {stats.questions !== null && stats.questions > 0 && (
        <Pill icon={<MessagesSquare size={20} className="text-ink-400" aria-hidden />} value={questions} label="Preguntas respondidas" />
      )}
    </div>
  );
}
