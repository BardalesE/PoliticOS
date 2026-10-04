"use client";

import { useEffect, useState } from "react";
import { MessageSquareQuote, Star } from "lucide-react";
import { getFeedbackPublicos, getFeedbackResumen, type FeedbackPublico, type FeedbackResumen } from "@/lib/feedback";

/**
 * "Lo que opina la gente" en la home: promedio en vivo, barras por estrellas y
 * comentarios aprobados por el superadmin. Se refresca cada 30 s.
 * Sin calificaciones todavía, no se muestra (nada de "0 de 5").
 */

const REFRESH_MS = 30_000;
const LEAF = "#2F7D4F";

function Estrellas({ valor, size = 18 }: { valor: number; size?: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(valor) ? "fill-amber-400 text-amber-400" : "text-ink-200"} />
      ))}
    </span>
  );
}

export function CalificacionesEnVivo() {
  const [res, setRes] = useState<FeedbackResumen | null>(null);
  const [coms, setComs] = useState<FeedbackPublico[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const [r, c] = await Promise.all([getFeedbackResumen(), getFeedbackPublicos()]);
      if (!alive) return;
      if (r) setRes(r);
      setComs(c);
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!res || res.total === 0) return null;
  const max = Math.max(1, ...Object.values(res.distribucion));

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 pb-10" aria-labelledby="opiniones-title">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#2F7D4F]/10 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="opiniones-title" className="text-[clamp(22px,2.6vw,30px)] font-bold leading-tight text-ink-800">
            Lo que opina la gente
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3E6] px-3 py-1 text-[12px] font-semibold" style={{ color: LEAF }}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: LEAF }} aria-hidden /> En vivo
          </span>
        </div>

        <div className="mt-5 grid gap-6 md:grid-cols-[260px_1fr]">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-[56px] font-bold leading-none text-ink-800">{res.average.toFixed(1)}</span>
              <span className="text-[16px] font-semibold text-ink-500">de 5</span>
            </p>
            <div className="mt-1" role="img" aria-label={`${res.average.toFixed(1)} de 5 estrellas`}>
              <Estrellas valor={res.average} size={22} />
            </div>
            <p className="mt-1 text-[14px] text-ink-500">
              {res.total} {res.total === 1 ? "calificación" : "calificaciones"}
              {res.ultimos_7_dias > 0 && <> · {res.ultimos_7_dias} esta semana</>}
            </p>
            <div className="mt-4 space-y-1.5" aria-label="Calificaciones por estrellas">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = res.distribucion[String(n)] ?? 0;
                return (
                  <div key={n} className="flex items-center gap-2 text-[13px]">
                    <span className="w-7 text-right font-semibold text-ink-600">{n}★</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(c / max) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums text-ink-500">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {coms.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Comentarios">
              {coms.slice(0, 6).map((c) => (
                <li key={c.id} className="rounded-2xl bg-[#F7FAF5] p-4 ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-2">
                    <Estrellas valor={c.stars} size={14} />
                    <span className="text-[11px] text-ink-400">
                      {new Date(c.created_at.replace(" ", "T")).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <p className="mt-2 flex gap-2 text-[14px] leading-snug text-ink-700">
                    <MessageSquareQuote size={16} className="mt-0.5 shrink-0 text-ink-300" aria-hidden />
                    <span>{c.comment}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="self-center rounded-2xl bg-[#F7FAF5] p-5 text-center text-[14px] text-ink-500">
              Califica PoliticOS desde el chat: tu opinión aparece aquí.
            </p>
          )}
        </div>
        <p className="mt-4 text-[11px] text-ink-400">Calificaciones anónimas. Los comentarios se revisan antes de publicarse.</p>
      </div>
    </section>
  );
}
