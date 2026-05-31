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
      if (err instanceof ApiError && err.status === 403) {
        setError("Clave incorrecta. Acceso denegado.");
      } else {
        setError("No se pudo conectar al servidor. Verifica que el backend esté corriendo.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100">SuperAdmin</h1>
          <p className="text-sm text-zinc-500 mt-1">PoliticOS Platform Owner</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-1.5">
              Clave de acceso
            </label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-sa-..."
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100
                           placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1
                           focus:ring-emerald-500/30 transition pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed
                       text-white font-semibold text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Verificando..." : "Acceder"}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-600 mt-6">
          Variable de entorno: <code className="text-zinc-500">SUPER_ADMIN_KEY</code>
        </p>
      </div>
    </div>
  );
}
