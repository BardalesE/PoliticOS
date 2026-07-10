"use client";
import { cn } from "@/lib/utils";

type BadgeVariant = "brand" | "soft" | "neutral";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  // Pill con tinte de marca (el patrón de los section-headers de la landing)
  brand: "bg-brand-50 border border-brand-200 text-brand-700",
  // Solo texto de marca con pip, sin fondo
  soft: "text-brand-600",
  neutral: "bg-ink-100 border border-ink-200 text-ink-600",
};

/** Etiqueta corta uppercase (ej. "Propuesta", "Nuevo", eyebrows de sección). */
export function Badge({ variant = "brand", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.1em] px-3 py-1.5 rounded-full",
        variants[variant],
        variant === "soft" && "px-0 py-0",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
