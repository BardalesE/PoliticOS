"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCandidate } from "@/context/CandidateContext";
import { usePlan } from "@/context/PlanContext";
import UpgradePlanModal from "@/components/admin/UpgradePlanModal";
import {
  LayoutDashboard, MessageSquare, FileText, Video, HelpCircle, Users,
  Brain, Shield, Radio, Settings, LogOut, Image as ImageIcon,
  MapPin, BookOpen, AlertCircle, Tag, FileQuestion, UserCircle, Calendar,
  Lock, UserCheck, Rocket,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  feature?: string;
};

type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Vista general",
    items: [
      { href: "/admin",              label: "Dashboard",              icon: LayoutDashboard },
      { href: "/admin/onboarding",   label: "Configurar campaña",     icon: Rocket },
      { href: "/admin/intelligence", label: "Inteligencia Electoral", icon: Brain,      badge: "NEW", feature: "intelligence" },
    ],
  },
  {
    label: "Defensa y respuestas",
    items: [
      { href: "/admin/attack-responses", label: "Respuestas a ataques", icon: Shield, badge: "NEW", feature: "attack_responses" },
      { href: "/admin/external-signals", label: "Señales externas",     icon: Radio,  badge: "NEW", feature: "external_signals" },
    ],
  },
  {
    label: "Contenido y IA",
    items: [
      { href: "/admin/ai-settings",        label: "Configuración IA",      icon: Settings },
      { href: "/admin/candidate-profile",  label: "Perfil del candidato",  icon: UserCircle },
      { href: "/admin/proposals",          label: "Propuestas",            icon: FileText,    feature: "proposals" },
      { href: "/admin/knowledge",          label: "Base de conocimiento",  icon: BookOpen,    feature: "knowledge" },
      { href: "/admin/faqs",               label: "FAQs",                  icon: HelpCircle },
      { href: "/admin/topics",             label: "Temas",                 icon: Tag },
      { href: "/admin/suggested-questions",label: "Preguntas sugeridas",   icon: FileQuestion },
    ],
  },
  {
    label: "Agenda",
    items: [
      { href: "/admin/events", label: "Eventos y cronómetro", icon: Calendar, feature: "events" },
    ],
  },
  {
    label: "Medios",
    items: [
      { href: "/admin/livestream",      label: "En vivo",          icon: Radio,      badge: "LIVE", feature: "livestream" },
      { href: "/admin/videos",          label: "Videos",           icon: Video,      feature: "media" },
      { href: "/admin/gallery",         label: "Galería",          icon: ImageIcon,  feature: "media" },
      { href: "/admin/campaign-videos", label: "Videos campaña",   icon: Video,      feature: "media" },
      { href: "/admin/team",            label: "Equipo",           icon: Users,      feature: "team" },
    ],
  },
  {
    label: "Inteligencia ciudadana",
    items: [
      { href: "/admin/citizens", label: "Ciudadanos registrados", icon: UserCheck, badge: "NEW" },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/admin/chat-sessions", label: "Sesiones de chat",  icon: MessageSquare },
      { href: "/admin/districts",     label: "Distritos",         icon: MapPin },
      { href: "/admin/users",         label: "Usuarios",          icon: Users },
      { href: "/admin/hero-settings", label: "Hero (portada)",    icon: ImageIcon },
      { href: "/admin/home-settings", label: "Secciones del Home",icon: Settings },
    ],
  },
];

const PLAN_BADGE_STYLES: Record<string, string> = {
  starter: "bg-zinc-800 text-zinc-400",
  pro:     "bg-blue-900/40 text-blue-400",
  elite:   "bg-amber-900/30 text-amber-400",
  custom:  "bg-purple-900/30 text-purple-400",
};

export default function Sidebar({ onClose }: { onClose?: () => void } = {}) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { profile } = useCandidate();
  const { isEnabled, plan, isLoading: planLoading } = usePlan();

  const [upgradeModal, setUpgradeModal] = useState<{ feature: string } | null>(null);

  const hasRealCandidate = profile?.name && profile.name !== "Candidato";
  const firstName        = hasRealCandidate ? profile.name.split(" ")[0] : null;

  return (
    <aside className="w-60 bg-zinc-50 border-r border-zinc-200 h-screen sticky top-0 overflow-y-auto flex flex-col p-3">
      {/* Brand header */}
      <div className="mb-4 px-2 py-3">
        <div className="flex items-center gap-2 mb-1">
          {profile?.logo_url ? (
            <img src={profile.logo_url} alt={profile.name} className="h-7 w-auto max-w-[28px] object-contain shrink-0" />
          ) : (
            <div className="h-7 w-7 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white leading-none">{firstName?.[0] ?? "P"}</span>
            </div>
          )}
          <h2 className="font-bold text-zinc-900">PoliticOS</h2>
        </div>
        <p className="text-xs text-zinc-500">Panel de {firstName ?? "campaña"}</p>
      </div>

      {/* Nav */}
      <nav className="space-y-4 flex-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold px-2 mb-1">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active  = pathname === item.href;
                const locked  = !planLoading && item.feature ? !isEnabled(item.feature) : false;
                const Icon    = item.icon;

                if (locked) {
                  return (
                    <li key={item.href}>
                      <button
                        onClick={() => setUpgradeModal({ feature: item.feature! })}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-zinc-400
                                   hover:bg-zinc-100 transition cursor-pointer"
                      >
                        <Icon className="w-4 h-4 shrink-0 opacity-40" />
                        <span className="flex-1 text-left truncate opacity-60">{item.label}</span>
                        <Lock className="w-3 h-3 text-zinc-400 shrink-0" />
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition ${
                        active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-200"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          active ? "bg-white text-zinc-900" : item.badge === "LIVE" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: plan badge + logout */}
      <div className="mt-4 space-y-1">
        {plan && (
          <div className={`px-2 py-1.5 rounded-lg flex items-center gap-2 ${PLAN_BADGE_STYLES[plan.plan] ?? PLAN_BADGE_STYLES.starter}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Plan {plan.label}
            </span>
            {plan.plan === "starter" && (
              <span className="text-[9px] text-zinc-600 ml-auto">Actualizar →</span>
            )}
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-zinc-700 hover:bg-red-50 hover:text-red-700 transition"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>

      {upgradeModal && plan && (
        <UpgradePlanModal
          feature={upgradeModal.feature}
          currentPlan={plan.plan}
          onClose={() => setUpgradeModal(null)}
        />
      )}
    </aside>
  );
}

export { Sidebar as AdminSidebar };
