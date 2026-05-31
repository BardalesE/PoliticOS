import { cn } from "@/lib/utils";

type BadgeVariant = "propuesta" | "en_curso" | "completada" | "admin" | "editor" | "default";

const styles: Record<BadgeVariant, string> = {
  propuesta:  "bg-blue-50 text-blue-700 border-blue-100",
  en_curso:   "bg-amber-50 text-amber-700 border-amber-100",
  completada: "bg-green-50 text-green-700 border-green-100",
  admin:      "bg-red-50 text-brand-700 border-red-100",
  editor:     "bg-purple-50 text-purple-700 border-purple-100",
  default:    "bg-gray-100 text-gray-600 border-gray-200",
};

const labels: Partial<Record<BadgeVariant, string>> = {
  propuesta:  "Propuesta",
  en_curso:   "En curso",
  completada: "Completada",
};

type BadgeProps = {
  variant?: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
      styles[variant], className
    )}>
      {children ?? labels[variant] ?? variant}
    </span>
  );
}
