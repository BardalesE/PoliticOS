"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useSuperAdmin } from "@/context/SuperAdminContext";
import { superadminApi, ApiError } from "@/lib/api";

type Diag = Awaited<ReturnType<typeof superadminApi.seguridad.diagnostico>>;

/**
 * Diagnóstico del blindaje: qué IP y país ve el servidor y qué cabeceras pone el
 * proxy de producción. Con esto se elige CLIENT_IP_HEADER y CLIENT_COUNTRY_HEADER en Render.
 */
export default function SuperAdminSeguridadPage() {
  const { saKey } = useSuperAdmin();
  const [d, setD] = useState<Diag | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!saKey) return;
    setLoading(true); setErr(null);
    try { setD(await superadminApi.seguridad.diagnostico(saKey)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo cargar."); }
    finally { setLoading(false); }
  }, [saKey]);

  useEffect(() => { load(); }, [load]);

  const cf = d?.cabeceras["CF-Connecting-IP"];
  const pais = d?.cabeceras["CF-IPCountry"];
  const ipOk = !!d?.config.CLIENT_IP_HEADER;
  const paisOk = !!d?.config.CLIENT_COUNTRY_HEADER;

  return (
    <div>
      <Link href="/superadmin" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
        <ArrowLeft size={14} /> Tenants
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Seguridad · Diagnóstico de acceso</h1>
          <p className="text-sm text-gray-500">Qué IP y país ve el servidor ahora mismo (tu conexión).</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {err && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {!d && loading && <p className="mt-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Cargando…</p>}

      {d && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-bold text-gray-900">Lo que ve el servidor</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">IP usada para topes y bloqueos</dt><dd className="font-mono">{d.ip_que_ve_laravel}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">País (GeoIP)</dt><dd className="font-mono">{d.pais_geoip ?? "—"}</dd></div>
              {Object.entries(d.cabeceras).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-gray-500">{k}</dt><dd className="max-w-[60%] truncate font-mono text-xs" title={v ?? ""}>{v ?? "—"}</dd></div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-bold text-gray-900">Configuración del blindaje</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {Object.entries(d.config).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="font-mono text-xs text-gray-500">{k}</dt><dd className="font-mono text-xs">{Array.isArray(v) ? (v.join(", ") || "sin restricción") : (v ?? "—")}</dd></div>
              ))}
            </dl>
            <div className="mt-4 space-y-2 text-[13px]">
              {ipOk ? (
                <p className="flex gap-2 text-emerald-700"><CheckCircle2 size={16} className="shrink-0" /> La IP real se toma de {String(d.config.CLIENT_IP_HEADER)}: no se puede falsificar.</p>
              ) : cf ? (
                <p className="flex gap-2 text-amber-700"><TriangleAlert size={16} className="shrink-0" /> El proxy envía CF-Connecting-IP. En Render pon <code className="rounded bg-amber-50 px-1">CLIENT_IP_HEADER=CF-Connecting-IP</code>: hoy un atacante puede cambiar su IP con X-Forwarded-For.</p>
              ) : (
                <p className="flex gap-2 text-amber-700"><TriangleAlert size={16} className="shrink-0" /> No llega CF-Connecting-IP: la IP sale de X-Forwarded-For. Revisa con soporte de Render qué cabecera es confiable.</p>
              )}
              {!paisOk && pais && (
                <p className="flex gap-2 text-amber-700"><TriangleAlert size={16} className="shrink-0" /> Llega CF-IPCountry ({pais}). Pon <code className="rounded bg-amber-50 px-1">CLIENT_COUNTRY_HEADER=CF-IPCountry</code> para no depender de GeoIP externo.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
