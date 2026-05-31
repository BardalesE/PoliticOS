"use client";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open, title, message, confirmLabel = "Eliminar", loading, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white border border-gray-200 shadow-2xl p-6"
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0 h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <h4 className="font-serif font-bold text-gray-900 mb-1">{title}</h4>
                <p className="text-sm text-gray-500">{message}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={onCancel}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
