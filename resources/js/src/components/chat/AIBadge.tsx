"use client";

/**
 * Badge persistente que recuerda al usuario que está hablando con una IA.
 * Compliance: divulgación obligatoria en cada momento de la conversación.
 */
export default function AIBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 border border-zinc-200 rounded-full text-xs text-zinc-600 font-medium">
      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
      Asistente IA · No es el candidato en persona
    </div>
  );
}
