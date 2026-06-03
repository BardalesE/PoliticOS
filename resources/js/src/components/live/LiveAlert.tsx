"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, X, Users, ArrowRight } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface LiveStream {
  title: string;
  description?: string;
  stream_key: string;
  current_viewers: number;
  status: "live" | "ended" | "idle";
}

type ViewState = "hidden" | "modal" | "banner";

export function LiveAlert() {
  const [stream, setStream]     = useState<LiveStream | null>(null);
  const [view, setView]         = useState<ViewState>("hidden");

  useEffect(() => {
    const check = async () => {
      try {
        const res  = await fetch(`${API}/livestreams`);
        if (!res.ok) return;
        const list: LiveStream[] = await res.json();
        const live = list.find(s => s.status === "live") ?? null;

        setStream(live ?? null);

        if (live) {
          // First time this stream is seen in this browser tab → show modal
          // If user already dismissed it → show banner only
          const key = `live_seen_${live.stream_key}`;
          const seen = sessionStorage.getItem(key);
          setView(seen ? "banner" : "modal");
        } else {
          setView("hidden");
        }
      } catch {}
    };

    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);

  const dismissToBar = () => {
    if (stream) sessionStorage.setItem(`live_seen_${stream.stream_key}`, "1");
    setView("banner");
  };

  if (view === "hidden" || !stream) return null;

  return (
    <>
      {/* ── Full-screen modal overlay ──────────────────────────────── */}
      <AnimatePresence>
        {view === "modal" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4 sm:p-6"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              onClick={dismissToBar}
            />

            {/* Card */}
            <motion.div
              initial={{ y: 80, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              className="relative z-10 w-full max-w-sm bg-zinc-950 border border-red-500/30 rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Animated top bar */}
              <div className="h-1 bg-gradient-to-r from-red-700 via-red-500 to-red-700 animate-pulse" />

              <button
                onClick={dismissToBar}
                className="absolute top-3 right-3 text-zinc-600 hover:text-white p-1.5 rounded-xl transition-colors"
              >
                <X size={16} />
              </button>

              <div className="p-6 pt-5">
                {/* Icon + status */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-2xl bg-red-600 flex items-center justify-center">
                      <Radio size={26} className="text-white" />
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
                    </span>
                  </div>
                  <div>
                    <p className="text-red-400 text-[11px] font-bold uppercase tracking-widest">
                      Transmisión en vivo
                    </p>
                    <p className="text-zinc-500 text-xs mt-0.5">El candidato está al aire ahora</p>
                  </div>
                </div>

                <h2 className="text-white font-bold text-lg leading-snug mb-1">
                  {stream.title}
                </h2>
                {stream.description && (
                  <p className="text-zinc-400 text-sm mb-3 line-clamp-2">{stream.description}</p>
                )}

                {stream.current_viewers > 0 && (
                  <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-5">
                    <Users size={12} />
                    {stream.current_viewers.toLocaleString()} personas viendo ahora
                  </p>
                )}

                <Link
                  href={`/en-vivo/${stream.stream_key}`}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-2xl transition-colors mb-2"
                >
                  <Radio size={16} />
                  Ver transmisión en vivo
                </Link>
                <button
                  onClick={dismissToBar}
                  className="w-full py-2.5 text-zinc-500 hover:text-zinc-300 text-sm rounded-2xl hover:bg-zinc-900 transition-colors"
                >
                  Ahora no
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky mini-banner ─────────────────────────────────────── */}
      <AnimatePresence>
        {view === "banner" && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="sticky top-0 z-40"
          >
            <Link
              href={`/en-vivo/${stream.stream_key}`}
              className="flex items-center gap-2.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 transition-colors text-white"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
              <Radio size={13} className="shrink-0" />
              <span className="font-semibold text-sm flex-1 truncate">
                EN VIVO: {stream.title}
              </span>
              {stream.current_viewers > 0 && (
                <span className="flex items-center gap-1 text-red-200 text-xs shrink-0">
                  <Users size={11} />
                  {stream.current_viewers.toLocaleString()}
                </span>
              )}
              <span className="flex items-center gap-1 text-sm font-bold shrink-0">
                Ver
                <ArrowRight size={13} />
              </span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
