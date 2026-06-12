"use client";

/**
 * Badge persistente que recuerda al usuario que está hablando con una IA.
 * Compliance: divulgación obligatoria en cada momento de la conversación.
 *
 * En modo PEPA (asistente cívico multi-candidato) muestra la identidad
 * neutral; en modo campaña, la divulgación clásica.
 */
export default function AIBadge({ mode }: { mode?: string | null }) {
  if (mode === "pepa") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-xs text-indigo-700 font-medium">
        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
        PEPA — Asistente Cívico Neutral
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 border border-zinc-200 rounded-full text-xs text-zinc-600 font-medium">
      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
      Asistente IA · No es el candidato en persona
    </div>
  );
}
