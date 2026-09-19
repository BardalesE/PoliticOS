"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const KEY = "politicos_tenant";
const SKIP = ["/admin", "/superadmin"];

/**
 * Monta en el root layout y garantiza que ?tenant= nunca se pierda:
 * - Si la URL tiene ?tenant= → persiste en localStorage.
 * - Si no tiene ?tenant= pero localStorage sí → redirige con router.replace().
 * Solo aplica a páginas públicas (no /admin ni /superadmin).
 */
export function TenantGuard() {
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (SKIP.some((p) => pathname.startsWith(p))) return;

    // La raíz "/" es la home de la plataforma: no debe "pegarse" al último
    // candidato/tenant que el navegador recuerde (p. ej. tras entrar al admin
    // con ?tenant=). Las rutas de un candidato sí conservan su tenant.
    if (pathname === "/") return;

    const params       = new URLSearchParams(window.location.search);
    const tenantInUrl  = params.get("tenant");

    if (tenantInUrl) {
      try { localStorage.setItem(KEY, tenantInUrl); } catch {}
      return;
    }

    try {
      const stored = localStorage.getItem(KEY);
      if (stored) {
        params.set("tenant", stored);
        router.replace(
          `${pathname}?${params.toString()}${window.location.hash}`
        );
      }
    } catch {}
  }, [pathname, router]);

  return null;
}
