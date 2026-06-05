"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { resolveTenantSlug, withTenant } from "@/lib/api";

type LinkProps = ComponentProps<typeof Link>;

/**
 * Drop-in para <Link> que agrega automáticamente ?tenant=X a rutas internas.
 * El href inicial se renderiza sin tenant (evita mismatch de hidratación);
 * el tenant se inyecta en el primer efecto del cliente.
 */
export function TenantLink({ href, children, ...rest }: LinkProps) {
  const [resolved, setResolved] = useState<typeof href>(href);

  useEffect(() => {
    if (typeof href !== "string") return;
    const slug = resolveTenantSlug();
    if (slug) setResolved(withTenant(href, slug));
  }, [href]);

  return (
    <Link href={resolved} {...rest}>
      {children}
    </Link>
  );
}
