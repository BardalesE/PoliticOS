"use client";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Square } from "lucide-react";
import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  suggestions?: string[];
  placeholder?: string;
}

// La Web Speech API no tiene tipos oficiales en el lib de TS del proyecto —
// se define el mínimo necesario acá en vez de instalar una dependencia solo
// para esto. Soporte real: Chrome/Edge/Safari (webkit prefix). Firefox no la
// implementa — el botón simplemente no se renderiza ahí (feature detection),
// no se muestra un botón roto.
interface MinimalSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => MinimalSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function ChatInput({ onSend, disabled, suggestions = [], placeholder = "Escribe tu pregunta..." }: Props) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  useEffect(() => {
    setMicSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const toggleMic = () => {
    if (disabled) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "es-PE";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        // Se agrega al texto existente en vez de reemplazarlo, por si el
        // usuario ya había escrito algo antes de usar el micrófono.
        setValue((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  // Si el componente se desmonta a mitad de una grabación, detenerla.
  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  return (
    <div className="border-t border-gray-200 bg-white safe-bottom">
      <div className="mx-auto max-w-3xl px-4 py-3">
        {suggestions.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((s, i) => (
              <motion.button
                key={s}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => onSend(s)}
                disabled={disabled}
                className="shrink-0 px-3.5 py-2 rounded-xl bg-white border border-gray-200
                           hover:border-chat-500/40 hover:text-chat-600
                           text-xs text-gray-600 whitespace-nowrap transition-colors
                           disabled:opacity-50 shadow-sm font-medium"
              >
                {s}
              </motion.button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 bg-white border border-gray-300 rounded-xl flex items-end px-4 py-2.5
                          focus-within:border-chat-500 focus-within:ring-4 focus-within:ring-chat-500/15
                          transition-all shadow-sm">
            <textarea
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              rows={1}
              className="flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400
                         resize-none outline-none max-h-32 py-1.5"
              style={{ height: "auto" }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
          </div>

          {micSupported && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={toggleMic}
              disabled={disabled}
              className={`h-12 w-12 grid place-items-center rounded-2xl border transition-colors shrink-0
                         disabled:opacity-40 disabled:pointer-events-none
                         ${listening
                           ? "bg-red-500 border-red-500 text-white shadow-md shadow-red-500/25"
                           : "bg-white border-gray-300 text-gray-500 hover:border-chat-500 hover:text-chat-600"}`}
              aria-label={listening ? "Detener grabación" : "Hablar en vez de escribir"}
              aria-pressed={listening}
            >
              <AnimatePresence mode="wait" initial={false}>
                {listening ? (
                  <motion.span
                    key="stop"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                  >
                    <Square size={16} fill="currentColor" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="mic"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                  >
                    <Mic size={18} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="h-12 w-12 grid place-items-center rounded-2xl bg-chat-500 hover:bg-chat-600
                       text-white shadow-md shadow-chat-500/25 disabled:opacity-40
                       disabled:pointer-events-none transition-colors shrink-0"
            aria-label="Enviar"
          >
            <Send size={18} />
          </motion.button>
        </div>

        {listening && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-500 mt-1.5 px-1 flex items-center gap-1.5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            Escuchando... toca el cuadrado para detener
          </motion.p>
        )}
      </div>
    </div>
  );
}
