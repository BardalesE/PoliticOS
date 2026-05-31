"use client";
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

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {(!as || as === "input") && (
        <input
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
          className={cn(inputClass, error && "border-red-400 focus:border-red-500")}
        />
      )}

      {as === "textarea" && (
        <textarea
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          rows={(props as TextareaProps).rows ?? 4}
          className={cn(inputClass, "resize-none", error && "border-red-400 focus:border-red-500")}
        />
      )}

      {as === "select" && (
        <select
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
