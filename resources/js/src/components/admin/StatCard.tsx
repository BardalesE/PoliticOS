"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  bg: string;
  delay?: number;
  href?: string;
  trend?: number | null;
  pulse?: boolean;
};

/**
 * Tile de métrica compartido (extraído de admin/page.tsx). intelligence/page.tsx
 * y citizens/page.tsx tenían su propia versión más simple — se unifican aquí
 * para que toda métrica del panel se vea igual.
 */
export function StatCard({ icon: Icon, label, value, sub, accent, bg, delay = 0, href, trend, pulse }: StatCardProps) {
  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl opacity-60" style={{ background: accent }} />

      <div className="flex items-start justify-between mb-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
        <div className="flex items-center gap-1.5">
          {pulse && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          {trend !== null && trend !== undefined && (
            <span className={cn(
              "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              trend >= 0 ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"
            )}>
              {trend >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
      </div>

      <p className="font-serif text-3xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-xs text-gray-500 mt-1.5 font-medium">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </motion.div>
  );

  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}
