"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";

/**
 * Botón circular de volver arriba — solo desktop/tablet (en mobile ya
 * existe el botón "Inicio" de MobileBottomNav con la misma función).
 * Abajo-izquierda para no chocar con ChatFAB, que ocupa abajo-derecha.
 */
export function ScrollToTopFab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.85);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Volver arriba"
          className="hidden md:grid fixed bottom-6 left-6 z-40 w-11 h-11 rounded-full place-items-center text-white shadow-lg"
          style={{ background: "rgb(var(--brand-primary-rgb))" }}
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
