"use client";

import { useEffect, useState } from "react";
import { TenantLink } from "@/components/ui/TenantLink";
import { Radio, Users, ArrowRight } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface LiveStream {
  title: string;
  stream_key: string;
  current_viewers: number;
  status: "live" | "ended" | "idle";
}

export function LiveStreamBanner() {
  const [liveStream, setLiveStream] = useState<LiveStream | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API}/livestreams`);
        if (!res.ok) return;
        const data: LiveStream[] = await res.json();
        const live = data.find(s => s.status === "live") ?? null;
        setLiveStream(live);
      } catch {}
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, []);

  if (!liveStream) return null;

  return (
    <div className="w-full bg-red-600 text-white">
      <TenantLink
        href={`/en-vivo/${liveStream.stream_key}`}
        className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3 hover:bg-red-700 transition-colors"
      >
        {/* Pulsing dot */}
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
        </span>

        <Radio size={15} className="shrink-0" />

        <span className="font-bold text-sm">EN VIVO AHORA:</span>
        <span className="text-sm text-white/90 truncate flex-1">{liveStream.title}</span>

        {liveStream.current_viewers > 0 && (
          <span className="flex items-center gap-1 text-white/70 text-xs shrink-0">
            <Users size={12} />
            {liveStream.current_viewers.toLocaleString()}
          </span>
        )}

        <span className="flex items-center gap-1 text-sm font-semibold shrink-0 ml-2">
          Ver ahora
          <ArrowRight size={14} />
        </span>
      </TenantLink>
    </div>
  );
}
