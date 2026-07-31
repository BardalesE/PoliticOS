"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSuperAdmin } from "@/context/SuperAdminContext";
import { superadminApi, ApiError } from "@/lib/api";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";

export default function SuperAdminLogin() {
  const { login } = useSuperAdmin();
  const router    = useRouter();
  const [key, setKey]       = useState("");
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError(null);

    try {
      // Verificar que la clave funciona haciendo un request real
      await superadminApi.tenants.list(key.trim());
      login(key.trim());
      router.replace("/superadmin");
    } catch (err) {
      if (err instanceof ApiError) {
        // Backend respondió (no es un problema de red/CORS): mostrar la causa real.
        setError(
          err.status === 403
            ? "Clave incorrecta. Acceso denegado."
            : `Error del servidor (HTTP ${err.status}): ${err.message}`
        );
      } else {
        // fetch() nunca completó el round-trip: red, DNS, o CORS bloqueando
        // la respuesta. err.message trae el motivo real que da el navegador
        // (p.ej. "Failed to fetch" / "NetworkError when attempting to fetch").
        const detail = err instanceof Error ? err.message : String(err);
        setError(`No se pudo conectar al backend (${detail}). Revisa NEXT_PUBLIC_API_URL y CORS (FRONTEND_URL) en el backend.`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-trust-50 border border-trust-100 flex items-center justify-center mb-4">
            <ShieldCheck className="w-7 h-7 text-trust-700" />
          </div>
          <h1 className="font-serif text-xl font-bold text-gray-900">SuperAdmin</h1>
          <p className="text-sm text-gray-400 mt-1">PoliticOS Platform Owner</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Clave de acceso
            </label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-sa-..."
                autoFocus
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900
                           placeholder-gray-400 focus:outline-none focus:border-trust-500 focus:ring-2
                           focus:ring-trust-500/15 transition pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full bg-trust-700 hover:bg-trust-900 disabled:opacity-40 disabled:cursor-not-allowed
                       text-white font-semibold text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Verificando..." : "Acceder"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Variable de entorno: <code className="text-gray-500">SUPER_ADMIN_KEY</code>
        </p>
      </div>
    </div>
  );
}
