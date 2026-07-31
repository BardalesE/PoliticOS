import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Servidor-a-servidor: Laravel llama este endpoint (fire-and-forget) justo
 * después de guardar branding/contenido en el admin, para que el ISR de
 * Next.js refresque de inmediato en vez de esperar su TTL natural
 * (30-120s, ver layout.tsx y page.tsx) — la causa principal de "los cambios
 * tardan en verse" en el sitio público (ver informe de QA).
 *
 * Protegido con un secreto compartido (REVALIDATE_SECRET, mismo valor en
 * Laravel vía services.revalidate.secret) — nunca expuesto al navegador,
 * solo llamado servidor-a-servidor.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-revalidate-secret");
  const expected = process.env.REVALIDATE_SECRET;

  if (!expected || !secret || secret !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const tenant = typeof body?.tenant === "string" ? body.tenant : "";

  if (tenant) {
    // candidate-${slug}: perfil/branding (layout.tsx). tenant-${slug}: hero,
    // home-settings, propuestas, eventos, equipo, galería, videos (page.tsx).
    revalidateTag(`candidate-${tenant}`);
    revalidateTag(`tenant-${tenant}`);
  }

  // Fallback robusto: revalida el layout raíz y todas sus páginas sin
  // depender de que el tag de tenant esté bien plomeado en cada fetch (p.
  // ej. en modo single-tenant sin NEXT_PUBLIC_TENANT_SLUG configurado, los
  // tags quedan vacíos y revalidateTag no tendría nada que invalidar).
  revalidatePath("/", "layout");

  return NextResponse.json({ revalidated: true, tenant: tenant || null, now: Date.now() });
}
