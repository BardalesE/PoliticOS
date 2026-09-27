"use client";

/**
 * Badge persistente que recuerda al usuario que esta hablando con una IA.
 * Compliance: divulgacion obligatoria en cada momento de la conversacion.
 * En celulares usa el texto corto para no romper la cabecera.
 *
 * En modo PEPA (asistente civico multi-candidato) muestra la identidad
 * neutral; en modo campana, la divulgacion clasica.
 */
export default function AIBadge({ mode }: { mode?: string | null }) {
  if (mode === "pepa") {
    return (
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 sm:px-2.5 sm:py-1 sm:text-xs">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-indigo-500" />
        <span className="truncate">PEPA &middot; Asistente C&iacute;vico Neutral</span>
      </div>
    );
  }

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 sm:px-2.5 sm:py-1 sm:text-xs">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
      <span className="truncate">
        Asistente IA &middot; <span className="sm:hidden">no es el candidato</span>
        <span className="hidden sm:inline">No es el candidato en persona</span>
      </span>
    </div>
  );
}
