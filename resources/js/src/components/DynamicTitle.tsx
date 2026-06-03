"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCandidate } from "@/context/CandidateContext";

export function DynamicTitle() {
  const { profile, isLoading } = useCandidate();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading || !profile.name || profile.name === "Candidato") return;

    const shortName = profile.name.split(" ")[0];
    const location  = profile.location ?? "Perú";

    if (pathname.startsWith("/admin") || pathname.startsWith("/superadmin")) {
      document.title = `Panel Admin — ${shortName}`;
    } else {
      document.title = `Habla con ${shortName} — ${location}`;
    }
  }, [profile.name, profile.location, isLoading, pathname]);

  return null;
}
