"use client";
import { useEffect, useState } from "react";

// Lógica de cuenta regresiva compartida (Countdown de la home + EventsSection).
// Extraída de EventsSection para no duplicarla.

export interface TimeLeft { days: number; hours: number; minutes: number; seconds: number; }

export function getTimeLeft(target: Date): TimeLeft | null {
  const diff = target.getTime() - Date.now();
  if (isNaN(diff) || diff <= 0) return null;
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000)  / 60_000),
    seconds: Math.floor((diff % 60_000)     / 1_000),
  };
}

export function useCountdown(target: Date | null): TimeLeft | null {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    if (!target) { setTimeLeft(null); return; }
    setTimeLeft(getTimeLeft(target));
    const id = setInterval(() => setTimeLeft(getTimeLeft(target)), 1_000);
    return () => clearInterval(id);
  }, [target]);

  return timeLeft;
}
