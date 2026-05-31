"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className, delay = 0, hover = true, onClick }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.25, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover ? { y: -4, transition: { duration: 0.25 } } : undefined}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-white border border-gray-200",
        "shadow-sm",
        hover && "transition-all duration-300 hover:shadow-xl hover:border-brand-500/30 cursor-pointer",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
