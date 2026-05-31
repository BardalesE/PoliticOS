"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { candidateApi, type CandidatePublicData, type CandidateProfile, type TopicItem, type ChatBtnConfig } from "@/lib/api";

function hexToRgbVars(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : null;
}

function applyColors(primary?: string | null, dark?: string | null, accent?: string | null) {
  const root = document.documentElement;
  if (primary) {
    root.style.setProperty("--brand-primary", primary);
    const rgb = hexToRgbVars(primary);
    if (rgb) root.style.setProperty("--brand-primary-rgb", rgb);
  }
  if (dark) {
    root.style.setProperty("--brand-dark", dark);
    const rgb = hexToRgbVars(dark);
    if (rgb) root.style.setProperty("--brand-dark-rgb", rgb);
  }
  if (accent) root.style.setProperty("--brand-accent", accent);
}

const COLORS_KEY = "brand_colors";
const PROFILE_CACHE_KEY = "candidate_profile_cache";

// Valores por defecto (usados mientras carga o si la API falla)
const DEFAULT_PROFILE: CandidateProfile = {
  name: "Candidato",
  title: "Candidato a Alcalde",
  location: "Perú",
  party: "",
  list_number: "1",
  bio: null,
  tagline: null,
  election_date: null,
  photo_url: null,
  logo_url: null,
  hero_photo_url: null,
  hero_video_url: null,
  color_primary: "#DC2626",
  color_dark: "#7F1D1D",
  color_accent: "#C9A84C",
  tiktok_url: null,
  facebook_url: null,
  instagram_url: null,
  whatsapp_number: null,
};

const DEFAULT_CHAT_BTN: ChatBtnConfig = {
  text: null, subtitle: "IA · 24/7",
  shape: "pill", color: null, size: "md", position: "bottom-right",
};

type CandidateContextValue = {
  profile: CandidateProfile;
  topics: TopicItem[];
  districts: string[];
  suggestedQuestions: { question: string; topic: string | null }[];
  chatBtn: ChatBtnConfig;
  isLoading: boolean;
};

const CandidateContext = createContext<CandidateContextValue>({
  profile: DEFAULT_PROFILE,
  topics: [],
  districts: [],
  suggestedQuestions: [],
  chatBtn: DEFAULT_CHAT_BTN,
  isLoading: true,
});

export function CandidateProvider({
  children,
  initialData,
}: {
  children: React.ReactNode;
  initialData?: CandidatePublicData | null;
}) {
  // If SSR pre-fetched data, use it immediately — no flash, no spinner
  const [data, setData] = useState<CandidatePublicData | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(!initialData);

  // Apply cached colors on mount (client-only, avoids FOUC)
  useEffect(() => {
    if (initialData) return; // SSR data already applied; no client cache needed
    try {
      const cached = localStorage.getItem(PROFILE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as CandidatePublicData;
        setData(parsed);
        return;
      }
      const cachedColors = localStorage.getItem(COLORS_KEY);
      if (cachedColors) {
        const { primary, dark, accent } = JSON.parse(cachedColors);
        applyColors(primary, dark, accent);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always refresh in background and update localStorage cache
  useEffect(() => {
    candidateApi
      .get()
      .then((fresh) => {
        setData(fresh);
        try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(fresh)); } catch {}
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // Apply + persist colors whenever profile changes (from cache or fresh API)
  useEffect(() => {
    if (!data?.profile) return;
    const { color_primary, color_dark, color_accent } = data.profile;
    applyColors(color_primary, color_dark, color_accent);
    try {
      localStorage.setItem(COLORS_KEY, JSON.stringify({
        primary: color_primary,
        dark: color_dark,
        accent: color_accent,
      }));
    } catch {}
  }, [data?.profile]);

  const value: CandidateContextValue = {
    profile:            data?.profile ?? DEFAULT_PROFILE,
    topics:             data?.topics ?? [],
    districts:          data?.districts ?? [],
    suggestedQuestions: data?.suggested_questions ?? [],
    chatBtn:            data?.chat_btn ?? DEFAULT_CHAT_BTN,
    isLoading,
  };

  return (
    <CandidateContext.Provider value={value}>
      {children}
    </CandidateContext.Provider>
  );
}

export function useCandidate() {
  return useContext(CandidateContext);
}
