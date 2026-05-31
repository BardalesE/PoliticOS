import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 px-4 text-center">
      <p className="text-6xl font-display font-bold text-white/10 mb-4">404</p>
      <h2 className="font-display text-2xl font-bold text-white mb-2">Página no encontrada</h2>
      <p className="text-sm text-ink-400 max-w-sm mb-8">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/"
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
      >
        <Home size={14} />
        Volver al inicio
      </Link>
    </div>
  );
}
