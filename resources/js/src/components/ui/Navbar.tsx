"use client";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Shield, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCandidate } from "@/context/CandidateContext";
import { TenantLink } from "@/components/ui/TenantLink";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const NAV_DEFS = [
  { href: "/",           label: "Inicio" },
  { href: "/propuestas", label: "Propuestas" },
  { href: "/galeria",    label: "Galería" },
  { href: "/videos",     label: "Videos" },
  { href: "/en-vivo",    label: "En vivo", live: true },
  { href: "/distritos",  label: "Lugares Visitados" },
  { href: "/chat",       label: "Chat IA" },
];

export function Navbar() {
  const [open, setOpen]         = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isLive, setIsLive]     = useState(false);
  const { profile }             = useCandidate();
  const pathname                = usePathname();
  const shortName               = profile.name.split(" ")[0];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API}/livestreams`);
        if (!res.ok) return;
        const list = await res.json();
        setIsLive(Array.isArray(list) && list.some((s: { status: string }) => s.status === "live"));
      } catch {}
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, []);

  // Compara la ruta base (sin query params) para detectar la página activa
  const isActive = (href: string) => {
    const base = href.split("?")[0];
    if (base === "/" && pathname === "/") return true;
    if (base !== "/" && pathname.startsWith(base)) return true;
    return false;
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full">

        {/* Top bar — azul institucional */}
        <div className="bg-brand-700">
          <div className="mx-auto max-w-7xl px-5 py-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold text-white/80 hidden sm:block">
              {profile.party || "Campaña Electoral"} · {profile.location}
            </span>
            <span className="text-[11px] font-semibold text-white/80 sm:hidden">
              Lista N°{profile.list_number} · {profile.location}
            </span>
            <TenantLink
              href="/#documentos"
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white
                         text-[10px] sm:text-[11px] font-bold uppercase px-3 py-1.5 rounded-full
                         transition-colors shrink-0 border border-white/20"
            >
              <Shield size={10} />
              <span className="hidden sm:inline">Portal de Transparencia</span>
              <span className="sm:hidden">Transparencia</span>
            </TenantLink>
          </div>
        </div>

        {/* Header principal */}
        <div
          className="bg-white border-b border-ink-200 transition-all duration-300"
          style={{
            boxShadow: scrolled
              ? "0 2px 12px rgba(0,0,0,0.06)"
              : "0 1px 0 rgba(0,0,0,0.06)",
          }}
        >
          <div className="mx-auto max-w-7xl px-5">
            <div className="flex items-center justify-between h-16 sm:h-[68px]">

              {/* Logo */}
              <TenantLink href="/" className="flex items-center gap-3 shrink-0 group">
                <div
                  className="relative w-11 h-11 rounded-xl overflow-hidden border-2 border-brand-100 shadow-sm
                              group-hover:border-brand-400 group-hover:shadow-md transition-all duration-200 shrink-0"
                >
                  {profile.logo_url ? (
                    <Image
                      src={profile.logo_url}
                      alt={profile.party || "Logo"}
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-brand-700 text-white font-serif font-extrabold text-lg grid place-items-center">
                      {profile.list_number || "1"}
                    </div>
                  )}
                </div>
                <div className="hidden sm:block leading-tight">
                  <p className="text-[11px] font-extrabold uppercase tracking-[1.5px] text-brand-700">
                    {profile.party || "Campaña Electoral"}
                  </p>
                  <p className="text-xs font-semibold text-ink-500">
                    {shortName} · {profile.title}
                  </p>
                </div>
              </TenantLink>

              {/* Navegación desktop */}
              <nav className="hidden lg:flex items-center gap-1">
                {NAV_DEFS.map((l) => {
                  const active = isActive(l.href);
                  const showDot = l.live && isLive;
                  return (
                    <TenantLink
                      key={l.href}
                      href={l.href}
                      className={`relative px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200
                        ${active
                          ? "text-brand-700 bg-brand-50"
                          : "text-ink-600 hover:text-brand-700 hover:bg-brand-50"
                        }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-pill"
                          className="absolute inset-0 bg-brand-50 rounded-lg"
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        {l.label}
                        {showDot && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                          </span>
                        )}
                      </span>
                      {active && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-brand-500 rounded-full" />
                      )}
                    </TenantLink>
                  );
                })}
              </nav>

              {/* CTA desktop + hamburger */}
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  className="hidden lg:block"
                >
                  <TenantLink
                    href="/chat"
                    className="inline-flex items-center gap-2 bg-brand-700 hover:bg-brand-900 text-white
                               px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide
                               transition-colors duration-150"
                  >
                    <span className="inline-flex rounded-full h-2 w-2 bg-white" />
                    Chatear
                  </TenantLink>
                </motion.div>

                <button
                  onClick={() => setOpen(!open)}
                  className="lg:hidden p-2.5 rounded-xl text-ink-600 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                  aria-label="Abrir menú"
                >
                  {open ? <X size={22} /> : <Menu size={22} />}
                </button>
              </div>
            </div>
          </div>

          {/* Línea azul inferior animada */}
          <div className="h-0.5 bg-gradient-to-r from-brand-700 via-brand-400 to-brand-700" />
        </div>
      </header>

      {/* Drawer móvil */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm lg:hidden"
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-[85vw] max-w-sm lg:hidden
                         bg-white shadow-2xl flex flex-col"
            >
              {/* Header del drawer */}
              <div className="bg-brand-700 px-5 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden border-2 border-white/30 shrink-0">
                    {profile.logo_url ? (
                      <Image src={profile.logo_url} alt={profile.party || "Logo"} fill sizes="36px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-brand-500 text-white font-serif font-extrabold text-base grid place-items-center">
                        {profile.list_number || "1"}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-extrabold text-sm uppercase tracking-wider leading-none">
                      {profile.party || "Campaña Electoral"}
                    </p>
                    <p className="text-white/65 text-[11px] font-semibold mt-0.5">
                      Lista N°{profile.list_number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  aria-label="Cerrar menú"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Links */}
              <nav className="flex-1 flex flex-col px-4 pt-4 overflow-y-auto">
                {NAV_DEFS.map((l, i) => {
                  const active = isActive(l.href);
                  const showDot = l.live && isLive;
                  return (
                    <motion.div
                      key={l.href}
                      initial={{ x: 24, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: i * 0.05, duration: 0.25, type: "spring", stiffness: 120 }}
                    >
                      <TenantLink
                        href={l.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center justify-between py-3.5 px-4 rounded-xl mb-1
                                    text-base font-semibold transition-colors
                                    ${active
                                      ? "bg-brand-50 text-brand-700"
                                      : "text-ink-700 hover:bg-ink-100 hover:text-brand-700"
                                    }`}
                      >
                        <span className="flex items-center gap-2">
                          {l.label}
                          {showDot && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                            </span>
                          )}
                        </span>
                        <ChevronRight size={16} className={active ? "text-brand-500" : "text-ink-300"} />
                      </TenantLink>
                    </motion.div>
                  );
                })}
              </nav>

              {/* CTA fijo */}
              <div className="px-4 pb-8 pt-4 shrink-0 border-t border-ink-100">
                <motion.div
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.3 }}
                >
                  <TenantLink
                    href="/chat"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 w-full bg-brand-700 hover:bg-brand-900
                               text-white py-4 rounded-xl text-base font-bold uppercase tracking-wide
                               transition-colors duration-150"
                  >
                    <span className="inline-flex rounded-full h-2 w-2 bg-white" />
                    Conversar con {shortName}
                  </TenantLink>
                  <p className="text-center text-xs text-ink-400 mt-3 font-medium">
                    {profile.party} · {profile.location} 2026
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
