"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { adminApi, type PlanFeatureSet } from "@/lib/api";

export type { PlanFeatureSet };

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
  custom: "Custom",
};

const ALWAYS_ENABLED = new Set([
  "chatbot", "candidate_profile", "faqs", "chat_sessions",
  "analytics", "ai_settings", "districts", "topics",
  "suggested_questions", "hero_settings", "home_settings",
  "users", "branding",
]);

type PlanContextValue = {
  plan: PlanFeatureSet | null;
  isLoading: boolean;
  isEnabled: (feature: string) => boolean;
  planLabel: string;
  planColor: string;
};

const PlanContext = createContext<PlanContextValue>({
  plan: null,
  isLoading: true,
  isEnabled: () => true,
  planLabel: "Starter",
  planColor: "text-zinc-400",
});

const PLAN_COLORS: Record<string, string> = {
  starter: "text-zinc-400",
  pro:     "text-blue-400",
  elite:   "text-amber-400",
  custom:  "text-purple-400",
};

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [plan, setPlan]       = useState<PlanFeatureSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setIsLoading(false);
      return;
    }

    adminApi.plan.get(token)
      .then(setPlan)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated, token]);

  function isEnabled(feature: string): boolean {
    if (ALWAYS_ENABLED.has(feature)) return true;
    if (!plan) return true; // loading → show everything optimistically
    const val = (plan.features as Record<string, unknown>)[feature];
    if (typeof val === "boolean") return val;
    if (typeof val === "object" && val !== null) return !!(val as Record<string, unknown>).enabled;
    return true;
  }

  return (
    <PlanContext.Provider value={{
      plan,
      isLoading,
      isEnabled,
      planLabel: plan ? (PLAN_LABELS[plan.plan] ?? plan.plan) : "Starter",
      planColor: plan ? (PLAN_COLORS[plan.plan] ?? "text-zinc-400") : "text-zinc-400",
    }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  return useContext(PlanContext);
}
