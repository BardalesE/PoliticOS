"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, MapPin } from "lucide-react";

interface ConsentModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

const STORAGE_KEY = "politicos_consent_v1";

export default function ConsentModal({ onAccept, onDecline }: ConsentModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!v) setOpen(true);
  }, []);

  const handle = (accept: boolean) => {
    localStorage.setItem(STORAGE_KEY, accept ? "accepted" : "declined");
    document.cookie = `politicos_consent=${accept ? "1" : "0"};path=/;max-age=31536000;samesite=lax`;
    setOpen(false);
    accept ? onAccept() : onDecline();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3"
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 sm:p-7 border border-gray-200"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700">
                <Bot size={18} />
              </div>
              <h2 className="font-serif text-lg font-bold text-gray-900">Asistente Virtual con IA</h2>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Estás por hablar con un <strong>asistente virtual basado en inteligencia artificial</strong>,
              entrenado con información pública del candidato. <strong>No es el candidato en persona.</strong>
            </p>

            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Para mejorar tus respuestas, este chat puede almacenar tus mensajes y datos opcionales
              que tú elijas compartir (edad, lugar, preferencias). Operado conforme a la Ley 29733
              de Protección de Datos Personales. Puedes solicitar borrado en{" "}
              <a href="/privacidad" className="text-brand-600 underline">privacidad@politicos.pe</a>.
            </p>
            <p className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4 border border-gray-200">
              <MapPin size={13} className="shrink-0 mt-0.5" />
              <span>También podemos usar tu <strong>ubicación aproximada</strong> para entender mejor
              las necesidades de tu zona. Es opcional — te lo pediremos aparte y puedes denegar.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={() => handle(true)}
                className="flex-1 bg-chat-500 text-white font-semibold py-3 px-4 rounded-xl hover:bg-chat-600 transition"
              >
                Aceptar y conversar
              </button>
              <button
                onClick={() => handle(false)}
                className="flex-1 bg-gray-100 text-gray-600 font-semibold py-3 px-4 rounded-xl hover:bg-gray-200 transition"
              >
                Solo leer sin compartir datos
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3 text-center">
              <a href="/privacidad" className="underline">Política de privacidad completa</a> ·{" "}
              <a href="/terminos" className="underline">Términos de uso</a>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

ConsentModal.hasConsent = (): boolean | null => {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "accepted") return true;
  if (v === "declined") return false;
  return null;
};
