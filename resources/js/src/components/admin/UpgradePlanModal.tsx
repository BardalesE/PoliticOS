"use client";

import { motion } from "framer-motion";
import { Lock, X, ArrowUpRight, Check } from "lucide-react";

const PLAN_PERKS: Record<string, { label: string; perks: string[] }> = {
  pro: {
    label: "Pro",
    perks: [
      "Propuestas ilimitadas",
      "Videos, galería y fotos",
      "Eventos y cronómetro",
      "Equipo de campaña",
      "Inteligencia electoral básica",
      "Señales externas básicas",
      "Hasta 20 documentos de conocimiento",
      "2,000 mensajes / mes",
    ],
  },
  elite: {
    label: "Elite",
    perks: [
      "Todo lo del plan Pro",
      "Respuestas a ataques",
      "Livestream integrado",
      "Inteligencia electoral avanzada",
      "Señales externas avanzadas",
      "Documentos ilimitados",
      "Mensajes ilimitados",
      "Soporte prioritario",
    ],
  },
};

const FEATURE_LABELS: Record<string, string> = {
  proposals:       "Propuestas",
  media:           "Videos y galería",
  events:          "Eventos",
  team:            "Equipo",
  attack_responses:"Respuestas a ataques",
  livestream:      "Livestream",
  external_signals:"Señales externas",
  intelligence:    "Inteligencia electoral",
  knowledge:       "Base de conocimiento",
};

const FEATURE_REQUIRED_PLAN: Record<string, "pro" | "elite"> = {
  proposals:       "pro",
  media:           "pro",
  events:          "pro",
  team:            "pro",
  external_signals:"pro",
  intelligence:    "pro",
  attack_responses:"elite",
  livestream:      "elite",
};

type Props = {
  feature: string;
  currentPlan: string;
  onClose: () => void;
};

export default function UpgradePlanModal({ feature, currentPlan, onClose }: Props) {
  const requiredPlan = FEATURE_REQUIRED_PLAN[feature] ?? "pro";
  const planInfo     = PLAN_PERKS[requiredPlan];
  const featureLabel = FEATURE_LABELS[feature] ?? feature;

  function handleContact() {
    window.open(
      `mailto:soporte@politicos.pe?subject=Actualizar plan a ${planInfo.label}&body=Hola, quiero actualizar mi plan de ${currentPlan} a ${planInfo.label} para acceder a ${featureLabel}.`,
      "_blank"
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-500 px-6 py-5 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-white/20 transition"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Lock size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Función bloqueada</p>
              <h3 className="font-bold text-lg leading-tight">{featureLabel}</h3>
            </div>
          </div>
          <p className="text-sm text-white/80">
            Disponible desde el plan <strong className="text-white">{planInfo.label}</strong>.
            Tu plan actual: <span className="capitalize font-semibold">{currentPlan}</span>.
          </p>
        </div>

        {/* Perks */}
        <div className="px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Plan {planInfo.label} incluye:
          </p>
          <ul className="space-y-2">
            {planInfo.perks.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-gray-700">
                <Check size={14} className="text-brand-500 mt-0.5 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="px-6 pb-5">
          <button
            onClick={handleContact}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-600 hover:bg-brand-500
                       text-white font-semibold text-sm rounded-xl transition"
          >
            Contactar para actualizar
            <ArrowUpRight size={15} />
          </button>
          <button
            onClick={onClose}
            className="w-full mt-2 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
          >
            Ahora no
          </button>
        </div>
      </motion.div>
    </div>
  );
}
