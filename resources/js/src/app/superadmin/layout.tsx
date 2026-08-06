"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SuperAdminProvider, useSuperAdmin } from "@/context/SuperAdminContext";
import { ShieldCheck, LogOut } from "lucide-react";

function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout } = useSuperAdmin();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated && pathname !== "/superadmin/login") {
      router.replace("/superadmin/login");
    }
  }, [isAuthenticated, pathname, router]);

  if (!isAuthenticated && pathname !== "/superadmin/login") return null;
  if (pathname === "/superadmin/login") return <>{children}</>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-2 sticky top-0 z-30 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-5 h-5 text-trust-700 shrink-0" />
          <span className="font-serif font-bold text-sm tracking-wide truncate text-gray-900">
            <span className="sm:hidden">SuperAdmin</span>
            <span className="hidden sm:inline">PoliticOS SuperAdmin</span>
          </span>
          <span className="hidden sm:inline-block text-[10px] bg-trust-50 text-trust-700 px-2 py-0.5 rounded-full font-mono ml-2 shrink-0 border border-trust-100">
            PLATFORM OWNER
          </span>
        </div>
        <button
          onClick={() => { logout(); router.replace("/superadmin/login"); }}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 transition-colors shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperAdminProvider>
      <SuperAdminGuard>{children}</SuperAdminGuard>
    </SuperAdminProvider>
  );
}
