"use client";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Con sombra (shadow-soft) o plana (solo borde). */
  shadow?: boolean;
  padding?: "none" | "sm" | "md";
}

const paddings: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-4 sm:p-6",
};

/** Contenedor base de la landing: fondo blanco, rounded-card y borde --page-line. */
export function Card({ shadow = false, padding = "md", className, style, children, ...props }: CardProps) {
  return (
    <div
      className={cn("bg-white rounded-card", shadow && "shadow-soft", paddings[padding], className)}
      style={{ border: "1px solid var(--page-line)", ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
