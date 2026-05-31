"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, MessageSquare, FileText, Video, HelpCircle, Users,
  Brain, Shield, Radio, Settings, LogOut, BarChart3, Image as ImageIcon,
  MapPin, BookOpen, AlertCircle, Tag, FileQuestion, UserCircle, Calendar,
} from "lucide-react";

/**
 * Sidebar v2 con secciones de Inteligencia.
 * Reemplaza al Sidebar.tsx original.
 */
const NAV_GROUPS = [
  {
    label: "Vista general",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/intelligence", label: "Inteligencia Electoral", icon: Brain, badge: "NEW" },
    ],
  },
  {
    label: "Defensa y respuestas",
    items: [
      { href: "/admin/attack-responses", label: "Respuestas a ataques", icon: Shield, badge: "NEW" },
      { href: "/admin/external-signals", label: "Señales externas", icon: Radio, badge: "NEW" },
    ],
  },
  {
    label: "Contenido y IA",
    items: [
      { href: "/admin/ai-settings", label: "Configuración IA", icon: Settings },
      { href: "/admin/candidate-profile", label: "Perfil del candidato", icon: UserCircle },
      { href: "/admin/proposals", label: "Propuestas", icon: FileText },
      { href: "/admin/knowledge", label: "Base de conocimiento", icon: BookOpen },
      { href: "/admin/faqs", label: "FAQs", icon: HelpCircle },
      { href: "/admin/topics", label: "Temas", icon: Tag },
      { href: "/admin/suggested-questions", label: "Preguntas sugeridas", icon: FileQuestion },
    ],
  },
  {
    label: "Medios",
    items: [
      { href: "/admin/livestream", label: "En vivo", icon: Radio, badge: "LIVE" },
      { href: "/admin/videos", label: "Videos", icon: Video },
      { href: "/admin/gallery", label: "Galería", icon: ImageIcon },
      { href: "/admin/campaign-videos", label: "Videos campaña", icon: Video },
      { href: "/admin/events", label: "Eventos", icon: Calendar },
      { href: "/admin/team", label: "Equipo", icon: Users },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/admin/chat-sessions", label: "Sesiones de chat", icon: MessageSquare },
      { href: "/admin/districts", label: "Distritos", icon: MapPin },
      { href: "/admin/users", label: "Usuarios", icon: Users },
      { href: "/admin/hero-settings", label: "Hero settings", icon: ImageIcon },
      { href: "/admin/home-settings", label: "Home", icon: Settings },
    ],
  },
];

export default function Sidebar({ onClose }: { onClose?: () => void } = {}) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="w-60 bg-zinc-50 border-r border-zinc-200 h-screen sticky top-0 overflow-y-auto p-3">
      <div className="mb-4 px-2 py-3">
        <h2 className="font-bold text-zinc-900">PoliticOS</h2>
        <p className="text-xs text-zinc-500">Panel administrativo</p>
      </div>

      <nav className="space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold px-2 mb-1">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition ${
                        active
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-700 hover:bg-zinc-200"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          active ? "bg-white text-zinc-900" : "bg-emerald-100 text-emerald-700"
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

      <button
        onClick={logout}
        className="mt-6 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-zinc-700 hover:bg-red-50 hover:text-red-700"
      >
        <LogOut className="w-4 h-4" />
        Cerrar sesión
      </button>
    </aside>
  );
}

export { Sidebar as AdminSidebar };
