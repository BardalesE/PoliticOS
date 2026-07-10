"use client";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ModalProps {
  onClose: () => void;
  /** Nombre accesible del diálogo (aria-label). */
  label: string;
  children: React.ReactNode;
  /** Clases extra del panel (ej. "max-w-4xl" para el visor de PDF). */
  className?: string;
  /** Estilos extra del panel (ej. height/maxHeight específicos). */
  style?: React.CSSProperties;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, iframe, [tabindex]:not([tabindex="-1"])';

/**
 * Modal genérico de la landing: backdrop con blur, panel animado con spring,
 * cierre por Escape y click fuera, focus-trap, retorno del foco al elemento
 * que lo abrió, y scroll del body bloqueado mientras está abierto.
 *
 * Renderizar condicionalmente dentro de <AnimatePresence> para conservar la
 * animación de salida:
 *
 *   <AnimatePresence>
 *     {active && <Modal label={active.title} onClose={close}>…</Modal>}
 *   </AnimatePresence>
 */
export function Modal({ onClose, label, children, className, style }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Foco inicial al panel + retorno del foco al cerrar
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => restoreFocusRef.current?.focus();
  }, []);

  // Bloquear el scroll del body mientras el modal está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape para cerrar + focus-trap con Tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current.contains(active);

      if (e.shiftKey) {
        if (active === first || !inside) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !inside) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      <motion.div
        ref={panelRef}
        tabIndex={-1}
        initial={{ scale: 0.94, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 24, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className={cn(
          "relative z-10 w-full max-w-xl bg-white rounded-modal shadow-modal overflow-hidden flex flex-col outline-none",
          className
        )}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
