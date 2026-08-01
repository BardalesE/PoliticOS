"use client";
import { useId } from "react";
import { cn } from "@/lib/utils";

type BaseProps = {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
};

type InputProps = BaseProps & React.InputHTMLAttributes<HTMLInputElement> & { as?: "input" };
type TextareaProps = BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement> & { as: "textarea"; rows?: number };
type SelectProps = BaseProps & React.SelectHTMLAttributes<HTMLSelectElement> & {
  as: "select";
  options?: { value: string; label: string }[];
  children?: React.ReactNode;
};

type FormFieldProps = InputProps | TextareaProps | SelectProps;

const inputClass = cn(
  "w-full px-3.5 py-2.5 rounded-xl text-sm text-gray-900 placeholder-gray-400",
  "bg-white border border-gray-200",
  "focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition"
);

export function FormField(props: FormFieldProps) {
  const { label, error, required, className, as, ...rest } = props;
  // Auditoría de calidad (Fase 17): el <label> no tenía htmlFor/id — sin
  // asociación programática con su campo, ni un lector de pantalla ni
  // getByLabel() de Playwright pueden vincular la etiqueta al input. Este
  // componente lo usan ~15 páginas del admin, así que el fix acá cubre
  // todas de una vez. useId() en vez de un id fijo: FormField puede
  // renderizarse muchas veces en la misma página (una fila por propuesta,
  // por FAQ, etc.), un id fijo colisionaría.
  const autoId = useId();
  const fieldId = (rest as { id?: string }).id ?? autoId;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
        {required && <span className="text-red-500 ml-0.5"> *</span>}
      </label>

      {(!as || as === "input") && (
        <input
          id={fieldId}
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
          className={cn(inputClass, error && "border-red-400 focus:border-red-500")}
        />
      )}

      {as === "textarea" && (
        <textarea
          id={fieldId}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          rows={(props as TextareaProps).rows ?? 4}
          className={cn(inputClass, "resize-none", error && "border-red-400 focus:border-red-500")}
        />
      )}

      {as === "select" && (
        <select
          id={fieldId}
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
          className={cn(inputClass, "cursor-pointer", error && "border-red-400 focus:border-red-500")}
        >
          {(props as SelectProps).options
            ? (props as SelectProps).options!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            : (props as SelectProps).children}
        </select>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
