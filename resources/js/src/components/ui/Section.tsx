"use client";
import { cn } from "@/lib/utils";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  id?: string;
  /** Ancho del contenido: la home usa max-w-5xl en casi todas las secciones. */
  width?: "default" | "wide";
  /** Fondo de la sección (CSS value); por defecto el crema de página. */
  background?: string;
}

/**
 * Wrapper de sección de la home: padding vertical/horizontal consistente
 * (py-20 md:py-28 px-5) y contenedor centrado, para que Hero, Propuestas,
 * Bio, Media y Documentos no inventen cada uno su propio layout.
 */
export function Section({
  id,
  width = "default",
  background = "var(--page-bg)",
  className,
  style,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn("relative py-20 md:py-28 px-5 overflow-hidden", className)}
      style={{ background, ...style }}
      {...props}
    >
      <div className={cn("mx-auto relative z-10", width === "wide" ? "max-w-6xl" : "max-w-5xl")}>
        {children}
      </div>
    </section>
  );
}
