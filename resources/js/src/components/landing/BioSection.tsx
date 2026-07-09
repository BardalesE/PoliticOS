"use client";
import { motion } from "framer-motion";
import { Flag, MapPin, Milestone, User } from "lucide-react";
import { useCandidate } from "@/context/CandidateContext";

// Hito de trayectoria del candidato.
// TODO(backend): /api/candidate aún no expone `bio_timeline` (JSON en
// CandidateProfile: [{ year, title, detail? }]). Cuando exista, la línea de
// tiempo se enciende sola; mientras tanto la sección muestra solo la bio.
interface BioMilestone {
  year: string;
  title: string;
  detail?: string | null;
}

export function BioSection() {
  const { profile } = useCandidate();

  const timeline: BioMilestone[] =
    (profile as { bio_timeline?: BioMilestone[] }).bio_timeline ?? [];

  // Sin bio ni trayectoria no hay nada que contar: la sección no renderiza.
  if (!profile.bio && timeline.length === 0) return null;

  const paragraphs = (profile.bio ?? "")
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <section id="bio" className="py-20 md:py-28 px-5" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 md:gap-14 items-start">

        {/* ── Foto + datos clave ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="md:sticky md:top-24"
        >
          <div
            className="relative rounded-[24px] overflow-hidden aspect-[4/5] max-w-sm"
            style={{ border: "1px solid var(--page-line)", boxShadow: "0 24px 60px -30px var(--page-shadow)" }}
          >
            {profile.photo_url ? (
              <img
                src={profile.photo_url}
                alt={`Foto de ${profile.name}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-brand-50 flex items-center justify-center">
                <User size={56} className="text-brand-200" aria-hidden />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
              <p className="text-white font-serif font-bold text-lg leading-tight">{profile.name}</p>
              {profile.title && (
                <p className="text-white/80 text-xs font-semibold mt-0.5">{profile.title}</p>
              )}
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 max-w-sm">
            {profile.party && (
              <div className="flex items-center gap-2.5 text-sm" style={{ color: "var(--page-ink)" }}>
                <Flag size={14} aria-hidden style={{ color: "rgb(var(--brand-primary-rgb))" }} />
                <dt className="sr-only">Partido</dt>
                <dd className="font-semibold">
                  {profile.party}
                  {profile.list_number && (
                    <span className="ml-1.5 font-normal opacity-60">· Lista {profile.list_number}</span>
                  )}
                </dd>
              </div>
            )}
            {profile.location && (
              <div className="flex items-center gap-2.5 text-sm" style={{ color: "var(--page-ink)" }}>
                <MapPin size={14} aria-hidden style={{ color: "rgb(var(--brand-primary-rgb))" }} />
                <dt className="sr-only">Ubicación</dt>
                <dd className="font-semibold">{profile.location}</dd>
              </div>
            )}
          </dl>
        </motion.div>

        {/* ── Bio + trayectoria ── */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <span
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
              style={{ color: "rgb(var(--brand-primary-rgb))" }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
              Conóceme
            </span>
            <h2
              className="font-serif font-semibold leading-[1.06] tracking-tight mt-2 mb-5"
              style={{ fontSize: "clamp(28px,4vw,44px)", color: "var(--page-ink)" }}
            >
              {profile.tagline ? (
                profile.tagline
              ) : (
                <>Una vida al servicio de{" "}
                  <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
                    nuestra tierra.
                  </em>
                </>
              )}
            </h2>
            {paragraphs.map((p, i) => (
              <p key={i} className="text-base leading-relaxed mb-4" style={{ color: "#4c5b51" }}>
                {p}
              </p>
            ))}
          </motion.div>

          {/* Línea de tiempo — solo si el backend expone hitos */}
          {timeline.length > 0 && (
            <ol className="mt-8 relative border-l-2 pl-6 space-y-7" style={{ borderColor: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 25%, transparent)" }}>
              {timeline.map((m, i) => (
                <motion.li
                  key={`${m.year}-${i}`}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="relative"
                >
                  <span
                    className="absolute -left-[31px] top-1 w-4 h-4 rounded-full grid place-items-center"
                    style={{ background: "rgb(var(--brand-primary-rgb))" }}
                  >
                    <Milestone size={9} className="text-white" aria-hidden />
                  </span>
                  <p className="text-[11px] font-bold uppercase tracking-[.15em]" style={{ color: "rgb(var(--brand-primary-rgb))" }}>
                    {m.year}
                  </p>
                  <p className="font-serif font-semibold text-base mt-0.5" style={{ color: "var(--page-ink)" }}>
                    {m.title}
                  </p>
                  {m.detail && (
                    <p className="text-sm leading-relaxed mt-1" style={{ color: "#4c5b51" }}>
                      {m.detail}
                    </p>
                  )}
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
