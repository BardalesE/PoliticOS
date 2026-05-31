"use client";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { useState, KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  suggestions?: string[];
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, suggestions = [], placeholder = "Escribe tu pregunta..." }: Props) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

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
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="h-12 w-12 grid place-items-center rounded-2xl bg-chat-500 hover:bg-chat-600
                       text-white shadow-md shadow-chat-500/25 disabled:opacity-40
                       disabled:pointer-events-none transition-colors"
            aria-label="Enviar"
          >
            <Send size={18} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
