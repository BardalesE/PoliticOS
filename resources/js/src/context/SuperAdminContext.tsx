"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "sa_key";

type SuperAdminContextType = {
  saKey: string | null;
  isAuthenticated: boolean;
  login: (key: string) => void;
  logout: () => void;
};

const SuperAdminContext = createContext<SuperAdminContextType | null>(null);

export function SuperAdminProvider({ children }: { children: React.ReactNode }) {
  const [saKey, setSaKey] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSaKey(stored);
  }, []);

  const login = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    setSaKey(key);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSaKey(null);
  }, []);

  return (
    <SuperAdminContext.Provider value={{ saKey, isAuthenticated: !!saKey, login, logout }}>
      {children}
    </SuperAdminContext.Provider>
  );
}

export function useSuperAdmin() {
  const ctx = useContext(SuperAdminContext);
  if (!ctx) throw new Error("useSuperAdmin debe usarse dentro de SuperAdminProvider");
  return ctx;
}
