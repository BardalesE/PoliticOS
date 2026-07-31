"use client";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  icon?: React.ElementType;
  title?: string;
  message: string;
  className?: string;
};

/**
 * Reemplaza los "sin datos" ad-hoc (texto suelto o gráficos con ejes vacíos)
 * por un estado explícito: un chart sin puntos se ve como roto, esto deja
 * claro que el dato simplemente aún no se acumuló.
 */
export function EmptyState({ icon: Icon = Inbox, title, message, className = "py-12" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <Icon size={18} className="text-gray-400" />
      </div>
      {title && <p className="text-sm font-semibold text-gray-600">{title}</p>}
      <p className="text-xs text-gray-400 mt-1 max-w-[260px]">{message}</p>
    </div>
  );
}
