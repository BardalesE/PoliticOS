"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Captura natural de datos del ciudadano vía botones rápidos.
 * Aparece cada N mensajes en el chat (lo controla el padre).
 */
interface Props {
  field: "distrito" | "edad" | "profesion" | "intencion_voto" | "preocupacion";
  onSubmit: (field: string, value: string) => void;
  onDismiss: () => void;
}

const FIELD_OPTIONS: Record<Props["field"], { label: string; options: string[] }> = {
  distrito: {
    label: "¿En qué región vives?",
    options: ["Lima", "Arequipa", "Trujillo", "Cusco", "Piura", "Otro"],
  },
  edad: {
    label: "¿Cuál es tu rango de edad?",
    options: ["18-25", "26-35", "36-50", "51-65", "65+"],
  },
  profesion: {
    label: "¿A qué te dedicas?",
    options: ["Estudiante", "Independiente", "Empleado", "Empresario", "Agricultor", "Otro"],
  },
  intencion_voto: {
    label: "¿Ya tienes definido tu voto?",
    options: ["Sí, definido", "Aún evaluando", "Voto en blanco", "Prefiero no decir"],
  },
  preocupacion: {
    label: "¿Qué tema te preocupa más?",
    options: ["Seguridad", "Empleo", "Salud", "Educación", "Corrupción"],
  },
};

export default function DeclaredDataPrompt({ field, onSubmit, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);
  const cfg = FIELD_OPTIONS[field];

  const select = (value: string) => {
    setVisible(false);
    setTimeout(() => onSubmit(field, value), 200);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 my-2"
        >
          <div className="flex items-start justify-between mb-2">
            <p className="text-sm text-zinc-700 font-medium">{cfg.label}</p>
            <button onClick={() => { setVisible(false); onDismiss(); }} className="text-zinc-400 hover:text-zinc-600 text-xs">
              Omitir
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cfg.options.map((opt) => (
              <button
                key={opt}
                onClick={() => select(opt)}
                className="px-3 py-1.5 bg-white border border-zinc-200 rounded-full text-xs font-medium text-zinc-700 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition"
              >
                {opt}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
