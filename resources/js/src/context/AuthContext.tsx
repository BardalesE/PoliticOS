"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { adminApi, invalidateCache, type AdminUser } from "@/lib/api";

type AuthContextValue = {
  user: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY  = "admin_token";
const USER_KEY   = "admin_user";
const TENANT_KEY = "admin_tenant_slug";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Always start null/true — same on server and client, no hydration mismatch
  const [user, setUser]       = useState<AdminUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored     = localStorage.getItem(TOKEN_KEY);
    const cachedRaw  = localStorage.getItem(USER_KEY);

    if (!stored) { setIsLoading(false); return; }

    // Apply cached user immediately — removes spinner in one frame
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as AdminUser;
        setUser(cached);
        setToken(stored);
        setIsLoading(false);
      } catch {}
    }

    // Validate token in background — update/clear state silently
    adminApi.auth.me(stored)
      .then((u) => {
        setUser(u);
        setToken(stored);
        try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {}
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    invalidateCache();
    const { token: t, user: u, tenant_slug } = await adminApi.auth.login(email, password);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    if (tenant_slug) localStorage.setItem(TENANT_KEY, tenant_slug);
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await adminApi.auth.logout(token).catch(() => {});
    }
    invalidateCache();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TENANT_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
