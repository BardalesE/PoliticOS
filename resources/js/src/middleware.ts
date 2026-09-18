import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Reads the tenant slug from:
 *  1. ?tenant= query param (dev / multi-tenant links)
 *  2. Subdomain (prod: roberto-sanchez.politicos.pe)
 *
 * Forwards it as x-tenant-slug request header so ALL server components
 * and route handlers can call `headers().get("x-tenant-slug")`.
 */
export function middleware(request: NextRequest) {
  const { searchParams, hostname } = request.nextUrl;

  const fromParam = searchParams.get("tenant") ?? "";

  // Dominios de hosting (p. ej. politic-os-beta.vercel.app, previews): su primer
  // tramo es el nombre del proyecto/deploy, NO un tenant. Sin esto la raíz "/"
  // siempre resolvía un tenant y nunca mostraba la home de la plataforma.
  const isHostingDomain = /\.(vercel\.app|onrender\.com)$/i.test(hostname);

  const fromSubdomain = (() => {
    if (isHostingDomain) return "";
    const parts = hostname.split(".");
    if (parts.length >= 3 && !["www", "app", "api", "localhost"].includes(parts[0])) {
      return parts[0];
    }
    return "";
  })();

  const slug = fromParam || fromSubdomain;
  if (!slug) return NextResponse.next();

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-tenant-slug", slug);

  return NextResponse.next({ request: { headers: reqHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
