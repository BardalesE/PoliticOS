"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { adminApi, request, resolveTenantSlug } from "@/lib/api";
import {
  Users, Download, Search, Filter, Phone, Mail, MapPin,
  Star, TrendingUp, RefreshCw, Copy, Check, ChevronDown,
  UserCheck, Share2, Loader2,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────

type Citizen = {
  id: number;
  name: string | null;
  phone_whatsapp: string | null;
  email: string | null;
  district: string | null;
  voting_intention: string | null;
  source: string;
  points_balance: number;
  referral_code: string | null;
  created_at: string;
};

type Summary = {
  total: number;
  with_phone: number;
  with_email: number;
  by_intention: Record<string, number>;
  by_district: Record<string, number>;
  top_referrers: { id: number; name: string; referidos: number }[];
};

type ApiResponse = {
  citizens: { data: Citizen[]; last_page: number; total: number };
  summary: Summary;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const INTENTION_LABELS: Record<string, { label: string; color: string }> = {
  alta:    { label: "Alta",      color: "text-emerald-700 bg-emerald-50" },
  media:   { label: "Media",     color: "text-blue-700 bg-blue-50" },
  baja:    { label: "Baja",      color: "text-amber-700 bg-amber-50" },
  opositor:{ label: "Opositor",  color: "text-red-700 bg-red-50" },
  indeciso:{ label: "Indeciso",  color: "text-zinc-600 bg-zinc-100" },
};

const SOURCE_LABELS: Record<string, string> = {
  chat:     "Chat",
  web_form: "Formulario web",
  qr:       "QR",
  referral: "Referido",
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 text-gray-400 hover:text-gray-600 transition inline-flex"
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
    </button>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────

export default function CitizensPage() {
  const { token } = useAuth();

  const [data, setData]         = useState<ApiResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");
  const [filterIntention, setFilterIntention] = useState("");
  const [exporting, setExporting] = useState(false);
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search)          params.set("search",    search);
      if (filterDistrict)  params.set("district",  filterDistrict);
      if (filterIntention) params.set("intention", filterIntention);

      const res = await request<ApiResponse>(
        `/admin/citizens?${params}`, {}, token, 0
      );
      setData(res);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [token, page, search, filterDistrict, filterIntention]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  async function handleExport() {
    if (!token) return;
    setExporting(true);
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    const slug    = resolveTenantSlug();
    const params  = new URLSearchParams();
    if (filterDistrict)  params.set("district",  filterDistrict);
    if (filterIntention) params.set("intention", filterIntention);

    try {
      const res = await fetch(`${API_URL}/admin/citizens/export?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant": slug || "",
        },
      });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `ciudadanos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const summary = data?.summary;
  const citizens = data?.citizens.data ?? [];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-1">Plataforma de inteligencia</p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Ciudadanos Registrados</h1>
          <p className="text-xs text-gray-400 mt-1">
            {summary ? `${summary.total.toLocaleString()} registros · ${summary.with_phone.toLocaleString()} con WhatsApp · ${summary.with_email.toLocaleString()} con email` : "Cargando..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Users,     label: "Total",       value: summary.total,       color: "#2563EB", bg: "#EFF6FF" },
            { icon: Phone,     label: "Con WhatsApp",value: summary.with_phone,  color: "#16A34A", bg: "#F0FDF4" },
            { icon: Mail,      label: "Con email",   value: summary.with_email,  color: "#7C3AED", bg: "#F5F3FF" },
            { icon: UserCheck, label: "Alta intención", value: summary.by_intention?.alta ?? 0, color: "#059669", bg: "#ECFDF5" },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: bg }}>
                <Icon size={16} style={{ color }} />
              </div>
              <p className="font-serif text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top referidores */}
      {summary?.top_referrers && summary.top_referrers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-serif text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Share2 size={15} className="text-brand-500" /> Top Referidores
          </h3>
          <div className="flex flex-wrap gap-2">
            {summary.top_referrers.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
                <span className="text-xs font-bold text-amber-700">#{i + 1}</span>
                <span className="text-sm font-medium text-gray-900">{r.name ?? "Anónimo"}</span>
                <span className="text-xs text-amber-600 font-bold">{r.referidos} referidos</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros + búsqueda */}
      <div className="flex flex-wrap gap-2">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nombre, WhatsApp o email..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition">
            Buscar
          </button>
        </form>

        <select
          value={filterIntention}
          onChange={(e) => { setFilterIntention(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-500"
        >
          <option value="">Todas las intenciones</option>
          {Object.entries(INTENTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {summary && Object.keys(summary.by_district).length > 0 && (
          <select
            value={filterDistrict}
            onChange={(e) => { setFilterDistrict(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-500"
          >
            <option value="">Todos los distritos</option>
            {Object.keys(summary.by_district).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : citizens.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
          <Users size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin ciudadanos registrados aún</p>
          <p className="text-sm text-gray-400 mt-1">
            Los ciudadanos se registrarán a través del chat o del formulario público
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Nombre", "WhatsApp", "Distrito", "Intención", "Fuente", "Puntos", "Registrado"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {citizens.map((c) => {
                const intention = c.voting_intention ? INTENTION_LABELS[c.voting_intention] : null;
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      {c.name ?? <span className="text-gray-400 italic">Sin nombre</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">
                      {c.phone_whatsapp
                        ? <span className="flex items-center">{c.phone_whatsapp}<CopyBtn text={c.phone_whatsapp} /></span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {c.district ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {intention
                        ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${intention.color}`}>{intention.label}</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {SOURCE_LABELS[c.source] ?? c.source}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-sm font-bold text-amber-600">
                        <Star size={12} />
                        {c.points_balance}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleDateString("es-PE")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Paginación */}
          {data && data.citizens.last_page > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">{data.citizens.total} ciudadanos en total</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(data.citizens.last_page, 7) }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`h-7 w-7 rounded-lg text-xs font-medium transition ${
                      p === page ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
