"use client";
import { cn } from "@/lib/utils";

interface LiveBadgeProps {
  /** solid: pill rojo con texto blanco (sobre video/nav). soft: fondo claro con borde (sobre superficies blancas). */
  variant?: "solid" | "soft";
  className?: string;
}

/**
 * Pill "EN VIVO" compartido entre el visor en-vivo y el player.
 * El rojo es deliberado y NO usa tokens de marca: es la convención
 * universal de transmisión en vivo (semántica de broadcast), igual
 * para todos los tenants sea cual sea su color de campaña.
 */
export function LiveBadge({ variant = "solid", className }: LiveBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full",
        variant === "solid"
          ? "bg-red-600 text-white"
          : "bg-red-50 border border-red-200 text-red-600",
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full animate-pulse",
          variant === "solid" ? "bg-white" : "bg-red-500"
        )}
      />
      EN VIVO
    </span>
  );
}
