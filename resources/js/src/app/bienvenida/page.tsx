"use client";
import { NavbarHero } from "@/components/ui/hero-with-video";
import { useCandidate } from "@/context/CandidateContext";

export default function BienvenidaPage() {
  const { profile } = useCandidate();

  return (
    <div className="relative h-screen overflow-hidden bg-[#0B1E42]">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/3 w-[500px] h-[500px] rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-brand-700/20 blur-3xl" />
      </div>
      <NavbarHero
        dark
        mainClassName="absolute inset-0 bg-transparent overflow-y-auto"
        brandName={profile.party ?? "Campaña"}
        heroTitle={profile.tagline ?? "Una campaña para San Miguel"}
        heroDescription={`Conoce las propuestas de ${profile.name.split(" ")[0]} y únete al cambio que San Miguel necesita.`}
        emailPlaceholder="tu@correo.com"
        backgroundImage="https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=2070&q=80"
        videoUrl="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
      />
    </div>
  );
}
