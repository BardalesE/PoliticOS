"use client";
import { useEffect, useState } from "react";

// Jornada electoral: domingo 4 de octubre de 2026, 00:00 hora de Lima (UTC-5,
// sin horario de verano). La jornada "dura" hasta el 5 de octubre 00:00.
const ELECTION_START = Date.parse("2026-10-04T00:00:00-05:00");
const ELECTION_END   = Date.parse("2026-10-05T00:00:00-05:00");
const ELECTION_LABEL = "4 DE OCTUBRE";

const pad = (n: number) => String(n).padStart(2, "0");

/** `now` arranca en null y se fija en cliente: sin mismatch de hidratación. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-[52px] flex-col items-center sm:min-w-[68px]">
      <span className="font-condensed text-[44px] leading-none tabular-nums text-white sm:text-[56px]">
        {value}
      </span>
      <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/75 sm:text-[10px]">
        {label}
      </span>
    </div>
  );
}

const Sep = () => (
  <span className="self-start pt-1 font-condensed text-[36px] leading-none text-white/50 sm:text-[44px]" aria-hidden>
    :
  </span>
);

export function ElectionCountdown() {
  const now = useNow();
  const accent = { color: "rgb(var(--brand-primary-rgb))" };

  const state =
    now === null          ? "loading"
    : now < ELECTION_START ? "before"
    : now < ELECTION_END   ? "today"
    :                        "after";

  const diff  = Math.max(0, ELECTION_START - (now ?? ELECTION_START));
  const days  = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins  = Math.floor((diff % 3_600_000) / 60_000);
  const secs  = Math.floor((diff % 60_000) / 1_000);
  const ph    = state === "loading";   // placeholders mientras hidrata

  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-[clamp(22px,3vw,32px)] font-black uppercase tracking-wide" style={accent}>
        {state === "before" || ph ? "Faltan" : state === "today" ? "Hoy es" : "Finalizó la"}
      </p>

      <div
        className="mt-2 rounded-2xl bg-ink-600 px-4 py-4 shadow-lg sm:px-7"
        role="timer"
        aria-live="off"
        aria-label={
          state === "before"
            ? `Faltan ${days} días, ${hours} horas, ${mins} minutos y ${secs} segundos para las elecciones del ${ELECTION_LABEL.toLowerCase()}`
            : "Cuenta regresiva para las elecciones"
        }
      >
        {state === "today" || state === "after" ? (
          <p className="px-2 font-condensed text-[34px] uppercase leading-tight tracking-wide text-white sm:text-[44px]">
            Jornada electoral
          </p>
        ) : (
          <div className="flex items-center justify-center gap-1.5 sm:gap-3">
            <Unit value={ph ? "--" : String(days)} label="Día(s)" />
            <Sep />
            <Unit value={ph ? "--" : pad(hours)} label="Hora(s)" />
            <Sep />
            <Unit value={ph ? "--" : pad(mins)} label="Minuto(s)" />
            <Sep />
            <Unit value={ph ? "--" : pad(secs)} label="Segundo(s)" />
          </div>
        )}
      </div>

      <p className="mt-3 text-[clamp(18px,2.4vw,26px)] font-black uppercase tracking-wide" style={accent}>
        {state === "before" || ph ? `Para el ${ELECTION_LABEL}` : `del ${ELECTION_LABEL}`}
      </p>
    </div>
  );
}
