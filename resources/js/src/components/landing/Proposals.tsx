"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { api, type Proposal } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";

interface ProposalExtended extends Proposal {
  eje?: string | null;
  year_range?: string | null;
}

const topicColors: Record<string, { bg: string; text: string; dot: string }> = {
  agua:           { bg: "bg-cyan-50",   text: "text-cyan-700",   dot: "bg-cyan-500" },
  infraestructura:{ bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500" },
  salud:          { bg: "bg-rose-50",   text: "text-rose-700",   dot: "bg-rose-500" },
  educacion:      { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  economia:       { bg: "bg-emerald-50",text: "text-emerald-700",dot: "bg-emerald-500" },
  seguridad:      { bg: "bg-slate-50",  text: "text-slate-700",  dot: "bg-slate-500" },
};

function getTopicColor(topic?: string | null) {
  if (!topic) return { bg: "bg-brand-50", text: "text-brand-700", dot: "bg-brand-500" };
  return topicColors[topic.toLowerCase()] ?? { bg: "bg-brand-50", text: "text-brand-700", dot: "bg-brand-500" };
}

function ProposalCard({ proposal, index }: { proposal: ProposalExtended; index: number }) {
  const tc = getTopicColor(proposal.topic);

  return (
    <motion.div
      initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20, y: 16 }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.06, type: "spring", stiffness: 80 }}
      whileHover={{ y: -4 }}
    >
      <div
        className="group relative bg-white rounded-2xl border border-ink-200 hover:border-brand-300 p-6 transition-all duration-300 overflow-hidden"
        style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 12px 40px rgba(220,38,38,0.12)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 2px 12px rgba(0,0,0,0.05)";
        }}
      >
        {/* Número de fondo */}
        <span className="absolute -top-3 -right-2 font-serif font-extrabold text-[80px] leading-none text-ink-200/50 group-hover:text-brand-100/60 select-none transition-colors duration-300 pointer-events-none">
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Barra superior animada */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-700 to-brand-400 scale-x-0 group-hover:scale-x-100 transition-transform duration-400 origin-left rounded-t-2xl" />

        <div className="relative z-10">
          {/* Badge topic */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${tc.bg} ${tc.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tc.dot}`} />
              {proposal.topic ?? "propuesta"}
            </span>
            <span className="text-[10px] text-ink-400 font-semibold">
              {proposal.eje ? `Eje ${proposal.eje} · ` : ""}{proposal.year_range ?? "2027–2030"}
            </span>
          </div>

          <h3 className="font-serif font-bold text-ink-900 text-base leading-snug mb-2 group-hover:text-brand-800 transition-colors duration-200">
            {proposal.title}
          </h3>

          {proposal.description && (
            <p className="text-ink-500 text-sm leading-relaxed font-medium">
              {proposal.description.slice(0, 110)}{proposal.description.length > 110 ? "…" : ""}
            </p>
          )}

          <div className="mt-4 flex items-center gap-1 text-brand-600 text-xs font-bold opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200">
            Ver detalle <ChevronRight size={12} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const FALLBACK: ProposalExtended[] = [
  { id: 1, title: "Agua potable para todos los caseríos", description: "Sistema integral de agua y saneamiento con financiamiento regional.", district: null, topic: "agua", status: "propuesta" as const },
  { id: 2, title: "Carreteras y conectividad rural", description: "Pavimentación de vías secundarias y puentes para todos los caseríos.", district: null, topic: "infraestructura", status: "propuesta" as const },
  { id: 3, title: "Salud comunitaria en cada caserío", description: "Postas médicas equipadas y brigadas de salud preventiva.", district: null, topic: "salud", status: "propuesta" as const },
  { id: 4, title: "Educación de calidad", description: "Mejora de infraestructura educativa y becas para todos los caseríos.", district: null, topic: "educacion", status: "propuesta" as const },
  { id: 5, title: "Reactivación económica local", description: "Apoyo a microempresarios y mercados locales con capital semilla.", district: null, topic: "economia", status: "propuesta" as const },
  { id: 6, title: "Seguridad ciudadana", description: "Cámaras, serenazgo y trabajo conjunto con la PNP.", district: null, topic: "seguridad", status: "propuesta" as const },
];

export function Proposals({ initialData }: { initialData?: ProposalExtended[] }) {
  const { profile } = useCandidate();
  const [proposals, setProposals] = useState<ProposalExtended[]>(() => {
    if (!initialData?.length) return [];
    return [...initialData].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).slice(0, 6);
  });
  const [loaded, setLoaded] = useState(!!initialData?.length);

  useEffect(() => {
    if (initialData?.length) return;
    api.proposals
      .list()
      .then((data) => {
        const sorted = [...data].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
        setProposals(sorted.slice(0, 6) as ProposalExtended[]);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayProposals = loaded && proposals.length === 0 ? FALLBACK : proposals;

  return (
    <section id="propuestas" className="relative bg-white py-20 md:py-28 px-5 overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div
          className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #FEE2E2 0%, transparent 70%)" }}
        />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6"
        >
          <div>
            <span className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-extrabold uppercase tracking-[2px] px-4 py-2 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              Propuestas prioritarias
            </span>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 leading-tight mt-2">
              Lo que haremos en los<br />
              <span
                style={{
                  background: "linear-gradient(135deg, #DC2626, #EF4444)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                primeros 100 días.
              </span>
            </h2>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="shrink-0"
          >
            <Link
              href="/propuestas"
              className="inline-flex items-center gap-2 text-sm text-brand-700 hover:text-brand-900 font-bold border-b-2 border-brand-300 hover:border-brand-700 pb-0.5 transition-colors duration-200"
            >
              Ver todas las propuestas <ArrowRight size={14} />
            </Link>
          </motion.div>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayProposals.map((p, i) => (
            <ProposalCard key={p.id} proposal={p} index={i} />
          ))}
        </div>

        {/* CTA bottom */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/propuestas"
              className="inline-flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-900 text-white px-7 py-3.5 rounded-xl text-sm font-extrabold uppercase tracking-wider transition-all duration-200"
              style={{ boxShadow: "0 8px 24px rgba(220,38,38,0.3)" }}
            >
              Ver todas las propuestas
            </Link>
          </motion.div>
          <Link
            href={`/chat?q=${encodeURIComponent("¿Cuáles son tus propuestas principales?")}`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700 font-semibold transition-colors"
          >
            Pregúntale a {profile.name.split(" ")[0]} <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
