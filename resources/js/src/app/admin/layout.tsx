"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { useCandidate } from "@/context/CandidateContext";
import { PlanProvider } from "@/context/PlanContext";
import { AdminSidebar } from "@/components/admin/Sidebar";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { profile } = useCandidate();
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== "/admin/login") {
      router.replace("/admin/login");
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Browser tab title: "[Candidato] — PoliticOS"
  useEffect(() => {
    const hasReal = profile?.name && profile.name !== "Candidato";
    if (hasReal && pathname !== "/admin/login") {
      document.title = `${profile.name} — PoliticOS`;
    }
  }, [profile?.name, pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="h-6 w-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated && pathname !== "/admin/login") return null;

  if (pathname === "/admin/login") return <>{children}</>;

  const hasRealCandidate = profile?.name && profile.name !== "Candidato";
  const firstName        = hasRealCandidate ? profile.name.split(" ")[0] : null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar desktop */}
      <div className="hidden lg:flex lg:shrink-0">
        <AdminSidebar />
      </div>

      {/* Sidebar mobile drawer */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <AdminSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            {profile?.logo_url ? (
              <img
                src={profile.logo_url}
                alt={profile.name}
                className="h-7 w-auto max-w-[28px] object-contain"
              />
            ) : (
              <div className="h-7 w-7 rounded-lg bg-brand-500 flex items-center justify-center">
                <span className="font-serif text-sm font-bold text-white leading-none">
                  {firstName?.[0] ?? "P"}
                </span>
              </div>
            )}
            <span className="font-serif text-base font-bold text-gray-900">
              Panel de {firstName ?? "Admin"}
            </span>
          </div>
        </div>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PlanProvider>
        <AdminGuard>{children}</AdminGuard>
      </PlanProvider>
    </AuthProvider>
  );
}
