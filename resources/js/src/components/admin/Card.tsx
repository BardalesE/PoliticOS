"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type CardProps = {
  title?: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

/**
 * Contenedor estándar del panel admin: mismo lenguaje visual en todas las
 * páginas (eyebrow institucional + título serif). Reemplaza los `Card`/
 * `Section` locales duplicados en admin/page.tsx e intelligence/page.tsx.
 */
export function Card({ title, sub, action, children, className, bodyClassName }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn("bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden", className)}
    >
      {title && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            {sub && <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-0.5">{sub}</p>}
            <h3 className="font-serif text-sm font-bold text-gray-900">{title}</h3>
          </div>
          {action}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </motion.div>
  );
}
