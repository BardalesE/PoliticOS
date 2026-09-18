"use client";
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { syncVisits } from "@/lib/visits";

const COUNT_UP_MS = 900;

/**
 * Pastilla "👁 199,336 VISITAS". Registra la visita del navegador actual y
 * muestra el total de visitantes únicos (por IP) de la plataforma.
 * Si el API no responde no renderiza nada (nunca un "0" falso).
 */
export function VisitCounter({ className = "" }: { className?: string }) {
  const [total, setTotal]     = useState<number | null>(null);
  const [shown, setShown]     = useState(0);

  useEffect(() => {
    let alive = true;
    syncVisits().then((n) => { if (alive && n !== null) setTotal(n); });
    return () => { alive = false; };
  }, []);

  // Cuenta hacia arriba hasta el total (salvo prefers-reduced-motion).
  useEffect(() => {
    if (total === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || total < 2) { setShown(total); return; }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(total * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  // Reserva el alto de la pastilla para que no haya salto de layout al cargar.
  if (total === null) return <div className={`h-[52px] ${className}`} aria-hidden />;

  return (
    <div
      role="status"
      aria-label={`${total.toLocaleString("es-PE")} visitas`}
      className={`inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-md ring-1 ring-black/5 ${className}`}
    >
      <Eye size={20} className="text-ink-400" aria-hidden />
      <span className="flex flex-col leading-none">
        <span className="flex items-center gap-1.5">
          <span
            className="font-condensed text-[26px] tabular-nums tracking-wide"
            style={{ color: "rgb(var(--brand-primary-rgb))" }}
          >
            {shown.toLocaleString("es-PE")}
          </span>
          <span
            className="h-2 w-2 rounded-full motion-safe:animate-pulse"
            style={{ background: "rgb(var(--brand-primary-rgb))" }}
            aria-hidden
          />
        </span>
        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[.18em] text-ink-400">
          Visitas
        </span>
      </span>
    </div>
  );
}
