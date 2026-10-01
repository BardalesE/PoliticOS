"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { request } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react";

/**
 * Consumo de IA: tokens y costo por proveedor, día, propósito y candidato.
 * Datos de la tabla ai_usage (una fila por llamada). El costo es a precio de lista:
 * en un plan gratis (Groq por defecto) se muestra como "equivalente", no como gasto.
 */

interface Fila { provider: string; model: string | null; llamadas: number; fallos: number; entrada: number; salida: number; cache: number; tokens: number; costo_usd: number; gratis: boolean; estimadas: number }
interface Dia { fecha: string; tokens: number; costo_usd: number; costo_real_usd: number; llamadas: number; groq?: number; claude?: number; openai?: number }
interface Resumen {
  disponible: boolean;
  dias: number;
  gratis: string[];
  groq_tokens_dia: number;
  totales: { tokens: number; llamadas: number; fallos: number; costo_usd: number; costo_real_usd: number };
  por_mensaje: { tokens: number; costo_usd: number };
  hoy: { provider: string; tokens: number; llamadas: number; fallos: number; costo_usd: number }[];
  por_modelo: Fila[];
  por_dia: Dia[];
  por_proposito: { proposito: string; llamadas: number; tokens: number; costo_usd: number }[];
  por_candidato: { id: number; nombre: string; llamadas: number; tokens: number; costo_usd: number }[];
}

// Color fijo por proveedor (sigue a la entidad, no al orden). Paleta categórica validada.
const PROV: Record<string, { nombre: string; color: string }> = {
  groq:   { nombre: "Groq",                 color: "#2a78d6" },
  claude: { nombre: "Claude",               color: "#eb6834" },
  openai: { nombre: "Respaldo (Gemini/OpenAI)", color: "#1baf7a" },
};
const PROPOSITO: Record<string, string> = {
  chat: "Chat de vecinos", qa: "Control de calidad", comparador: "Comparador", etiquetas: "Etiquetas de preguntas", prueba: "Pruebas",
};

const n = (v: number) => v.toLocaleString("es-PE");
const k = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)} M` : v >= 1000 ? `${(v / 1000).toFixed(1)} k` : String(v));
const usd = (v: number) => `US$ ${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(2)}`;
const eje = (v: number) => (v >= 1_000_000 ? `${Math.round(v / 100_000) / 10}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
const dia = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return `${d.getDate()}/${d.getMonth() + 1}`; };

function Tile({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-gray-500">{detalle}</p>}
    </div>
  );
}

export default function ConsumoIaPage() {
  const { token } = useAuth();
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      setData(await request<Resumen>(`/admin/ai-uso?dias=${dias}`, {}, token, 0));
    } catch {
      setError("No se pudo cargar el consumo.");
    } finally {
      setLoading(false);
    }
  }, [token, dias]);

  useEffect(() => { load(); }, [load]);

  const hoyGroq = data?.hoy.find((h) => h.provider === "groq")?.tokens ?? 0;
  const proveedores = Object.keys(PROV).filter((p) => data?.por_dia.some((d) => (d as unknown as Record<string, number>)[p]));

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-brand-500">Contenido y IA</p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Consumo de IA</h1>
          <p className="mt-1 text-xs text-gray-400">Tokens y costo de cada proveedor, por día, uso y candidato.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" aria-label="Periodo">
            <option value={1}>Hoy</option>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
          <button onClick={load} className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100" aria-label="Actualizar">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && <p className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={15} /> {error}</p>}
      {loading && !data && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={15} className="animate-spin" /> Cargando…</p>}
      {data && !data.disponible && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">El registro de consumo se activa con el próximo despliegue (falta la tabla ai_usage).</p>
      )}

      {data?.disponible && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile titulo="Tokens" valor={k(data.totales.tokens)} detalle={`${n(data.totales.llamadas)} llamadas a la IA`} />
            <Tile titulo="Gasto real" valor={usd(data.totales.costo_real_usd)} detalle="Proveedores pagados (Claude…)" />
            <Tile titulo="Equivalente a precio de lista" valor={usd(data.totales.costo_usd)}
              detalle={data.gratis.length ? `Incluye ${data.gratis.map((g) => PROV[g]?.nombre ?? g).join(", ")} (plan gratis)` : undefined} />
            <Tile titulo="Por mensaje del chat" valor={`${k(data.por_mensaje.tokens)} tokens`} detalle={`≈ ${usd(data.por_mensaje.costo_usd)} a precio de lista`} />
          </div>

          {data.totales.fallos > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {n(data.totales.fallos)} llamadas fallaron (límite agotado o proveedor caído). Cada falla hace que el chat pase al siguiente proveedor.
            </p>
          )}

          {data.groq_tokens_dia > 0 && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
              <div className="flex justify-between text-xs"><span className="font-bold text-gray-700">Groq hoy (plan gratis)</span>
                <span className="tabular-nums text-gray-500">{k(hoyGroq)} de {k(data.groq_tokens_dia)}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={hoyGroq / data.groq_tokens_dia > 0.8 ? "h-full bg-amber-500" : "h-full bg-brand-500"}
                  style={{ width: `${Math.min(100, (hoyGroq / data.groq_tokens_dia) * 100)}%` }} />
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
            <p className="mb-3 text-sm font-bold text-gray-900">Tokens por día y proveedor</p>
            {data.por_dia.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Sin consumo en este periodo.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.por_dia} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#eeeeee" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={dia} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={eje} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      formatter={(v, key) => [`${n(Number(v ?? 0))} tokens`, PROV[String(key)]?.nombre ?? String(key)]}
                      labelFormatter={(l) => dia(String(l))}
                    />
                    <Legend formatter={(key: string) => <span className="text-xs text-gray-600">{PROV[key]?.nombre ?? key}</span>} />
                    {proveedores.map((p, i) => (
                      <Bar key={p} dataKey={p} stackId="t" fill={PROV[p].color} stroke="#ffffff" strokeWidth={2}
                        radius={i === proveedores.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-gray-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
                <tr><th className="px-4 py-2">Proveedor · modelo</th><th className="px-3 py-2 text-right">Llamadas</th><th className="px-3 py-2 text-right">Entrada</th>
                  <th className="px-3 py-2 text-right">Salida</th><th className="px-3 py-2 text-right">Caché</th><th className="px-3 py-2 text-right">Costo</th><th className="px-3 py-2 text-right">Fallos</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.por_modelo.map((f) => (
                  <tr key={`${f.provider}-${f.model}`}>
                    <td className="px-4 py-2">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: PROV[f.provider]?.color ?? "#9ca3af" }} />
                      <b className="text-gray-900">{PROV[f.provider]?.nombre ?? f.provider}</b>
                      <span className="ml-1 text-xs text-gray-500">{f.model}</span>
                      {f.estimadas > 0 && <span className="ml-1 text-[10px] text-gray-400" title="El proveedor no informó tokens en algunas llamadas: se estimaron">≈</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(f.llamadas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k(f.entrada)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k(f.salida)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k(f.cache)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(f.costo_usd)}{f.gratis && <span className="block text-[10px] text-gray-400">gratis · equivalente</span>}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${f.fallos ? "font-semibold text-amber-700" : "text-gray-400"}`}>{n(f.fallos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
              <p className="mb-2 text-sm font-bold text-gray-900">¿En qué se gasta?</p>
              <ul className="divide-y divide-gray-100 text-sm">
                {data.por_proposito.map((p) => (
                  <li key={p.proposito} className="flex justify-between py-2">
                    <span className="text-gray-700">{PROPOSITO[p.proposito] ?? p.proposito} <span className="text-xs text-gray-400">· {n(p.llamadas)}</span></span>
                    <span className="tabular-nums text-gray-900">{k(p.tokens)} <span className="text-xs text-gray-500">{usd(p.costo_usd)}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
              <p className="mb-2 text-sm font-bold text-gray-900">Por candidato</p>
              {data.por_candidato.length === 0 ? <p className="text-sm text-gray-400">Sin consumo por candidato aún.</p> : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {data.por_candidato.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 py-2">
                      <span className="truncate text-gray-700">{c.nombre} <span className="text-xs text-gray-400">· {n(c.llamadas)}</span></span>
                      <span className="shrink-0 tabular-nums text-gray-900">{k(c.tokens)} <span className="text-xs text-gray-500">{usd(c.costo_usd)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="flex items-start gap-2 text-[11px] text-gray-400">
            <Info size={12} className="mt-0.5 shrink-0" />
            Costos a precio de lista de referencia (config/ai_precios.php); pueden diferir de tu factura. Para el gasto exacto de Claude revisa platform.claude.com → Cost.
          </p>
        </>
      )}
    </div>
  );
}
