import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  onNew?: () => void;
  newLabel?: string;
  children?: React.ReactNode;
};

export function PageHeader({ title, subtitle, onNew, newLabel = "Nuevo", children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 md:mb-8">
      <div>
        <span className="eyebrow-red">{subtitle ?? "Gestión de contenido"}</span>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-gray-900 mt-1">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onNew && (
          <button
            onClick={onNew}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus size={15} />
            {newLabel}
          </button>
        )}
      </div>
    </div>
  );
}

type SearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchBar({ value, onChange, placeholder = "Buscar...", className }: SearchBarProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "px-4 py-2 rounded-xl text-sm text-gray-900 placeholder-gray-400",
        "bg-white border border-gray-200",
        "focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition",
        className
      )}
    />
  );
}
