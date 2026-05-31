"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 px-4 text-center">
      <div className="h-14 w-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
        <AlertTriangle size={24} className="text-red-400" />
      </div>
      <h2 className="font-display text-2xl font-bold text-white mb-2">Algo salió mal</h2>
      <p className="text-sm text-ink-400 max-w-sm mb-8">
        Ocurrió un error inesperado. Intenta recargar la página o contacta al administrador.
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
      >
        <RefreshCw size={14} />
        Reintentar
      </button>
    </div>
  );
}
