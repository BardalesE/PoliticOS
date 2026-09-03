"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Droplets, GraduationCap, HardHat, HeartPulse, Landmark, ShieldCheck,
  TrendingUp, ArrowRight, Wallet, type LucideIcon,
} from "lucide-react";
import { TenantLink } from "@/components/ui/TenantLink";
import { ProposalModal } from "@/components/landing/Proposals";
import { api, type Proposal } from "@/lib/api";
import { formatBudget } from "@/lib/utils";

const TOPIC_ICONS: Array<[RegExp, LucideIcon]> = [
  [/agua|saneamiento/i, Droplets],
  [/infraestructura|obra|carretera|vial/i, HardHat],
  [/salud/i, HeartPulse],
  [/educaci/i, GraduationCap],
  [/econom|empleo|agro|turismo/i, TrendingUp],
  [/seguridad/i, ShieldCheck],
];

function topicIcon(topic?: string | null): LucideIcon {
  if (topic) for (const [re, icon] of TOPIC_ICONS) if (re.test(topic)) return icon;
  return Landmark;
}

const MAX_GOALS = 5;

/**
 * "Objetivos de gobierno" — versión narrativa de Proposals.tsx: máximo 5
 * tarjetas, ícono grande + título corto + un beneficio en una línea, sin el
 * framing de "primeros 100 días". Proposals.tsx sigue intacto para
 * HomeTabs, que muestra el listado completo con modal de detalle.
 */
export function GoalCards() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<Proposal | null>(null);

  useEffect(() => {
    api.proposals.list()
      .then((data) => {
        const sorted = [...data].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
        setProposals(sorted.slice(0, MAX_GOALS));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || proposals.length === 0) return null;

  return (
    <section id="objetivos" className="py-20 md:py-28 px-5" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 max-w-xl"
        >
          <span
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
            style={{ color: "rgb(var(--brand-primary-rgb))" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
            Objetivos de gobierno
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            Esto es lo que{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
              vamos a hacer.
            </em>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {proposals.map((p, i) => {
            const Icon = topicIcon(p.topic);
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.07, type: "spring", stiffness: 90 }}
                className="bg-white rounded-[20px] p-5 sm:p-6 cursor-pointer"
                style={{ border: "1px solid var(--page-line)" }}
                role="button"
                tabIndex={0}
                aria-label={`Ver detalle: ${p.title}`}
                onClick={() => setActive(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(p);
                  }
                }}
              >
                <div
                  className="w-12 h-12 rounded-[14px] grid place-items-center mb-4"
                  style={{ background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 10%, transparent)" }}
                >
                  <Icon size={22} style={{ color: "rgb(var(--brand-primary-rgb))" }} aria-hidden />
                </div>
                <h3 className="font-serif font-semibold text-[17px] leading-snug mb-1.5" style={{ color: "var(--page-ink)" }}>
                  {p.title}
                </h3>
                {p.description && (
                  <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--page-ink-soft)" }}>
                    {p.description}
                  </p>
                )}
                <p className="flex items-center gap-1.5 text-[11px] font-bold mt-3" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
                  <Wallet size={12} aria-hidden />
                  {formatBudget(p.budget)}
                </p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="mt-10 text-center"
        >
          <TenantLink
            href="/propuestas"
            className="inline-flex items-center gap-2.5 font-bold text-base pb-1"
            style={{ color: "var(--page-ink)", borderBottom: "2px solid rgb(var(--brand-primary-rgb))" }}
          >
            Ver todas las propuestas
            <ArrowRight size={18} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
          </TenantLink>
        </motion.div>
      </div>

      {/* Modal de detalle — el mismo componente que usa Proposals.tsx */}
      <AnimatePresence>
        {active && <ProposalModal proposal={active} onClose={() => setActive(null)} />}
      </AnimatePresence>
    </section>
  );
}
