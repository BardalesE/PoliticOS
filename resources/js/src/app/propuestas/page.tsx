"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FileText, MapPin, Wallet } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useCandidate } from "@/context/CandidateContext";
import { api, type Proposal } from "@/lib/api";
import { formatBudget } from "@/lib/utils";

const STATUS_LABEL: Record<Proposal["status"], string> = {
  propuesta:  "Propuesta",
  en_curso:   "En curso",
  completada: "Completada",
};

// Agrupa por tema y ordena cada grupo por la prioridad más alta que contiene,
// para que el orden de la página siga el mismo criterio que el resto del sitio.
function groupByTopic(proposals: Proposal[]): Array<[string, Proposal[]]> {
  const map = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const key = p.topic?.trim() || "General";
    const bucket = map.get(key);
    if (bucket) bucket.push(p);
    else map.set(key, [p]);
  }
  const minPriority = (list: Proposal[]) =>
    Math.min(...list.map((p) => p.priority ?? 99));
  return [...map.entries()].sort((a, b) => minPriority(a[1]) - minPriority(b[1]));
}

function ProposalBlock({ p }: { p: Proposal }) {
  return (
    <article
      className="bg-white rounded-[20px] p-6 sm:p-8"
      style={{ border: "1px solid var(--page-line)" }}
    >
      {/* Etiquetas */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {p.topic && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.1em]"
            style={{ color: "rgb(var(--brand-primary-rgb))" }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: "rgb(var(--brand-dark-rgb))" }}
            />
            {p.topic}
          </span>
        )}
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 10%, transparent)",
            color: "rgb(var(--brand-dark-rgb))",
          }}
        >
          {STATUS_LABEL[p.status]}
        </span>
        {p.district && (
          <span
            className="inline-flex items-center gap-1 text-[12px] font-semibold"
            style={{ color: "var(--page-ink)" }}
          >
            <MapPin size={13} aria-hidden style={{ color: "rgb(var(--brand-primary-rgb))" }} />
            {p.district}
          </span>
        )}
      </div>

      {/* Título */}
      <h2
        className="font-serif font-semibold leading-[1.15]"
        style={{ fontSize: "clamp(20px,2.6vw,28px)", color: "var(--page-ink)" }}
      >
        {p.title}
      </h2>

      {/* Presupuesto */}
      <p
        className="flex items-center gap-2 text-sm font-bold mt-3"
        style={{ color: "var(--page-ink)" }}
      >
        <Wallet size={15} aria-hidden style={{ color: "rgb(var(--brand-primary-rgb))" }} />
        <span>
          Presupuesto:{" "}
          <span style={{ color: "rgb(var(--brand-dark-rgb))" }}>{formatBudget(p.budget)}</span>
        </span>
      </p>

      {/* Imagen */}
      {p.image && (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden mt-4">
          <Image
            src={p.image}
            alt={`Imagen de la propuesta: ${p.title}`}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}

      {/* Descripción completa — sin recortes */}
      {p.description && (
        <p
          className="text-[15px] leading-relaxed mt-4 whitespace-pre-line"
          style={{ color: "var(--page-ink-soft)" }}
        >
          {p.description}
        </p>
      )}

      {/* Documento oficial */}
      {p.document_url && (
        <a
          href={p.document_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-5 text-sm font-bold pb-0.5"
          style={{ color: "var(--page-ink)", borderBottom: "2px solid rgb(var(--brand-primary-rgb))" }}
        >
          <FileText size={15} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
          Ver documento oficial de la propuesta
        </a>
      )}
    </article>
  );
}

export default function ProposalsPage() {
  const { profile } = useCandidate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.proposals
      .list()
      .then((data) =>
        setProposals(
          [...data].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)),
        ),
      )
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const groups = useMemo(() => groupByTopic(proposals), [proposals]);

  const withBudget = proposals.filter((p) => Number(p.budget) > 0);
  const totalBudget = withBudget.reduce((sum, p) => sum + Number(p.budget), 0);

  return (
    <main>
      <Navbar />

      <section className="pt-10 md:pt-16 pb-24 px-5" style={{ background: "var(--page-bg)" }}>
        <div className="mx-auto max-w-3xl">
          {/* Encabezado */}
          <div className="mb-10">
            <span
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
              style={{ color: "rgb(var(--brand-primary-rgb))" }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
              Plan de gobierno
            </span>
            <h1
              className="font-serif font-semibold leading-[1.05] tracking-tight"
              style={{ fontSize: "clamp(30px,4.4vw,48px)", color: "var(--page-ink)" }}
            >
              Propuestas para {profile.location}
            </h1>
            <p className="mt-3 text-base" style={{ color: "var(--page-ink-soft)" }}>
              Cada propuesta con su texto completo, presupuesto y documento de
              respaldo. Sin recortes: esto es lo que hay.
            </p>

            {/* Resumen de transparencia */}
            {loaded && proposals.length > 0 && (
              <div
                className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl p-4"
                style={{ background: "var(--page-soft)", border: "1px solid var(--page-line)" }}
              >
                <div>
                  <p className="font-serif font-bold text-2xl" style={{ color: "var(--page-ink)" }}>
                    {proposals.length}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: "var(--page-ink-soft)" }}>
                    propuestas publicadas
                  </p>
                </div>
                <div>
                  <p className="font-serif font-bold text-2xl" style={{ color: "var(--page-ink)" }}>
                    {totalBudget > 0 ? formatBudget(totalBudget) : "—"}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: "var(--page-ink-soft)" }}>
                    inversión estimada publicada
                  </p>
                </div>
                <div>
                  <p className="font-serif font-bold text-2xl" style={{ color: "var(--page-ink)" }}>
                    {withBudget.length}/{proposals.length}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: "var(--page-ink-soft)" }}>
                    con presupuesto cargado
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Listado */}
          {!loaded ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-52 rounded-[20px] animate-pulse" style={{ background: "var(--page-soft)" }} />
              ))}
            </div>
          ) : proposals.length === 0 ? (
            <div
              className="rounded-[20px] p-10 text-center"
              style={{ background: "var(--page-soft)", border: "1px solid var(--page-line)" }}
            >
              <p className="font-serif font-semibold text-lg" style={{ color: "var(--page-ink)" }}>
                Aún no hay propuestas publicadas.
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--page-ink-soft)" }}>
                Vuelve pronto: el plan de gobierno se publica aquí, completo.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {groups.map(([topic, list]) => (
                <div key={topic}>
                  <h2
                    className="font-serif font-bold text-xl mb-4 pb-2"
                    style={{ color: "var(--page-ink)", borderBottom: "1px solid var(--page-line)" }}
                  >
                    {topic}
                    <span className="ml-2 text-sm font-semibold" style={{ color: "var(--page-ink-soft)" }}>
                      · {list.length}
                    </span>
                  </h2>
                  <div className="space-y-4">
                    {list.map((p) => (
                      <ProposalBlock key={p.id} p={p} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
