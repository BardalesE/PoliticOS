"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { usePlan } from "@/context/PlanContext";
import UpgradePlanModal from "@/components/admin/UpgradePlanModal";

type Props = { feature: string; children: React.ReactNode };

/**
 * Auditoría de calidad (Fase 16): antes, solo el Sidebar ocultaba/bloqueaba
 * los módulos según el plan — un tenant starter que escribiera la URL de un
 * módulo pro/elite directo (ej. /admin/intelligence) veía la página completa
 * renderizar (solo la API le devolvía 403 en cada fetch). Este wrapper
 * bloquea la página misma, no solo el link del Sidebar.
 */
export function PlanGate({ feature, children }: Props) {
  const { isLoading, isEnabled, plan } = usePlan();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (!isEnabled(feature)) {
    return (
      <UpgradePlanModal
        feature={feature}
        currentPlan={plan?.plan ?? "starter"}
        onClose={() => router.replace("/admin")}
      />
    );
  }

  return <>{children}</>;
}
