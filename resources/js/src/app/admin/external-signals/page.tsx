"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { request } from "@/lib/api";

const adminGet = (token: string, path: string) =>
  request<any>(`/admin${path}`, {}, token);

interface Signal {
  id: number;
  source: string;
  source_name?: string;
  source_url?: string;
  author?: string;
  title?: string;
  content: string;
  mentions: string[];
  sentiment?: number;
  emotion?: string;
  topic?: string;
  is_attack: boolean;
  target_candidate?: string;
  engagement: number;
  captured_at: string;
}

const SOURCES = ["all","twitter","news","youtube_comment","tiktok","facebook","poll","gov_pdf","blog","manual"];

export default function ExternalSignalsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Signal[]>([]);
  const [filterSource, setFilterSource] = useState("all");
  const [attacksOnly, setAttacksOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (token) load(); }, [token, filterSource, attacksOnly]);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSource !== "all") params.set("source", filterSource);
    if (attacksOnly) params.set("attacks_only", "1");
    const r = await adminGet(token!, `/external-signals?${params.toString()}`);
    setItems(r.data || []);
    setLoading(false);
  };

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">Señales Externas</h1>
        <p className="text-sm text-zinc-500">Menciones del candidato en redes, noticias y documentos públicos</p>
      </header>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm"
        >
          {SOURCES.map((s) => <option key={s} value={s}>{s === "all" ? "Todas las fuentes" : s}</option>)}
        </select>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={attacksOnly}
            onChange={(e) => setAttacksOnly(e.target.checked)}
          />
          <span className="text-sm">Solo ataques</span>
        </label>
      </div>

      {loading ? <p className="text-zinc-500">Cargando...</p> : (
        <div className="space-y-3">
          {items.map((s) => (
            <article key={s.id} className="bg-white border border-zinc-200 rounded-xl p-4">
              <div className="flex flex-wrap gap-1.5 mb-2 items-center">
                <span className="text-xs bg-zinc-100 text-zinc-700 font-medium px-2 py-0.5 rounded-full">
                  {s.source}{s.source_name ? ` · ${s.source_name}` : ""}
                </span>
                {s.is_attack && (
                  <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full">
                    ATAQUE
                  </span>
                )}
                {s.topic && (
                  <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                    {s.topic}
                  </span>
                )}
                {s.sentiment !== null && s.sentiment !== undefined && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.sentiment > 0 ? "bg-emerald-100 text-emerald-700" :
                    s.sentiment < 0 ? "bg-red-100 text-red-700" :
                    "bg-zinc-100 text-zinc-700"
                  }`}>
                    Sent: {s.sentiment.toFixed(2)}
                  </span>
                )}
                {s.engagement > 0 && (
                  <span className="text-xs text-zinc-500">👁 {s.engagement}</span>
                )}
                <span className="text-xs text-zinc-400 ml-auto">
                  {new Date(s.captured_at).toLocaleString("es-PE")}
                </span>
              </div>
              {s.title && <h3 className="font-bold text-sm text-zinc-900 mb-1">{s.title}</h3>}
              <p className="text-sm text-zinc-700 leading-relaxed">{s.content}</p>
              {s.source_url && (
                <a
                  href={s.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                >
                  Ver fuente original →
                </a>
              )}
            </article>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-10">
              No hay señales todavía. El servicio Python de ingesta aún no envió datos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
