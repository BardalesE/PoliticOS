"use client";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { GlassCard } from "@/components/ui/GlassCard";
import { useCandidate } from "@/context/CandidateContext";
import { TenantLink } from "@/components/ui/TenantLink";
import { ArrowRight } from "lucide-react";

export default function ProposalsPage() {
  const { profile, topics } = useCandidate();
  const shortName = profile.name.split(" ")[0];

  return (
    <main>
      <Navbar />
      <section className="pt-8 md:pt-12 pb-24 px-6 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="section-badge mb-5 mx-auto">Plan de Gobierno · Peru Primero</div>
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 mt-2">
              Propuestas <span className="text-brand-500">para {profile.location}</span>
            </h1>
            <p className="text-gray-500">Ejes de trabajo concreto, sin promesas vacías.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {topics.map((t, i) => (
              <GlassCard key={t.name} delay={i * 0.05} className="p-8 group">
                <div className="text-5xl mb-5">{t.emoji}</div>
                <h3 className="font-display text-2xl font-bold text-gray-900 mb-3">{t.label}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-6">
                  Propuestas específicas para cada distrito, con presupuesto detallado y plazos de ejecución claros.
                </p>
                <TenantLink
                  href={`/chat?q=${encodeURIComponent(`Cuéntame sobre ${t.label.toLowerCase()}`)}`}
                  className="inline-flex items-center gap-2 text-sm text-brand-500 hover:text-brand-600 font-medium"
                >
                  Preguntar a {shortName} <ArrowRight size={14} />
                </TenantLink>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
