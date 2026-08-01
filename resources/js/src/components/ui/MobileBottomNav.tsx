"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, BookOpen, Target, HandHeart, MessageCircle } from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";

type NavId = "inicio" | "bio" | "objetivos" | "participa";

const ANCHOR_ITEMS: { id: NavId; label: string; icon: typeof Home }[] = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "bio", label: "Historia", icon: BookOpen },
  { id: "objetivos", label: "Propuestas", icon: Target },
  { id: "participa", label: "Participa", icon: HandHeart },
];

/**
 * Nav rápida fija en mobile con anclas a las secciones clave del scroll
 * narrativo + acceso directo al chat. Solo visible en `/` (la home), donde
 * existen las anclas; en el resto de páginas no se monta.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const [active, setActive] = useState<NavId>("inicio");

  useEffect(() => {
    if (pathname !== "/") return;

    const sections = ANCHOR_ITEMS.filter((i) => i.id !== "inicio")
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) {
          if (window.scrollY < window.innerHeight * 0.6) setActive("inicio");
          return;
        }
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        const id = topMost.target.id as NavId;
        if (id) setActive(id);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  if (pathname !== "/") return null;

  const goTo = (id: NavId) => {
    if (id === "inicio") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md safe-bottom"
      style={{ borderTop: "1px solid var(--page-line)" }}
      aria-label="Navegación rápida"
    >
      <div className="grid grid-cols-5 h-16">
        {ANCHOR_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => goTo(id)}
              className="flex flex-col items-center justify-center gap-1 transition-colors"
              style={{ color: isActive ? "rgb(var(--brand-primary-rgb))" : "var(--page-ink-soft)" }}
            >
              <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          );
        })}
        <TenantLink
          href="/chat"
          className="flex flex-col items-center justify-center gap-1 text-white"
          style={{ background: "rgb(var(--brand-primary-rgb))" }}
        >
          <MessageCircle size={19} />
          <span className="text-[10px] font-semibold">Chat</span>
        </TenantLink>
      </div>
    </nav>
  );
}
