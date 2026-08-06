import type { ReactNode } from "react";

/**
 * Sintaxis de énfasis compartida para copy narrativo (Hero, StoryTimeline,
 * WhyRunning, BioSection):
 *   - "\n"        → salto de línea
 *   - "*texto*"   → texto en color de marca (énfasis suave)
 *   - "==texto==" → chip resaltado con fondo de color de marca (el resaltado
 *                   tipo "palabra clave" de una carta abierta o hito de vida)
 * Extraída de Hero.tsx (antes `renderTitleWithEmphasis`, inline y sin el
 * resaltado en chip) para reusarla en los demás componentes narrativos.
 */
export function EmphasisText({ text }: { text: string }): ReactNode {
  return text.split(/(==[^=]+==|\*[^*]+\*|\n)/).map((part, i) => {
    if (part === "\n") return <br key={i} />;

    if (part.startsWith("==") && part.endsWith("==")) {
      return (
        <span
          key={i}
          className="inline-block px-1.5 py-0.5 rounded-[5px] font-semibold text-white"
          style={{ background: "rgb(var(--brand-primary-rgb))" }}
        >
          {part.slice(2, -2)}
        </span>
      );
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <span key={i} className="relative inline-block" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
          {part.slice(1, -1)}
        </span>
      );
    }

    return <span key={i}>{part}</span>;
  });
}
