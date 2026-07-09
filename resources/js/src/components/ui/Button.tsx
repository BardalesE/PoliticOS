"use client";
import { motion, MotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "gold";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof MotionProps> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: React.ReactNode;
}

const variants: Record<Variant, string> = {
  primary:   "bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40",
  secondary: "bg-white hover:bg-brand-50 text-brand-600 border-2 border-brand-500",
  ghost:     "bg-white/5 hover:bg-white/10 text-white border border-white/10",
  gold:      "bg-gradient-to-br from-gold-400 to-gold-600 text-ink-950 font-semibold shadow-lg shadow-gold-500/25",
};

const sizes: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-base",
  lg: "px-8 py-4 text-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, loading, children, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium",
        "transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant], sizes[size], className
      )}
      disabled={loading || props.disabled}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {loading ? <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : children}
    </motion.button>
  )
);
Button.displayName = "Button";
