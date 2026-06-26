"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Ruta de campo dedicada: requiere sesión (admin o editor) pero NO monta el
// panel admin ni el sidebar. Pensada para usarse desde el celular del encuestador.
function FieldGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/admin/login?next=/encuestar");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50">
        <div className="h-6 w-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}

export default function EncuestarLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <FieldGuard>{children}</FieldGuard>
    </AuthProvider>
  );
}
