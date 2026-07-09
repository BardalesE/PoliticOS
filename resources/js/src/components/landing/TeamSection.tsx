"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { homeApi, type TeamMember } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function TeamSection({ initialMembers }: { initialMembers?: TeamMember[] }) {
  const { profile } = useCandidate();
  const [members, setMembers] = useState<TeamMember[]>(initialMembers ?? []);
  const [loaded,  setLoaded]  = useState(!!initialMembers?.length);

  useEffect(() => {
    if (initialMembers?.length) return;
    homeApi.teamMembers()
      .then((data) => setMembers(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fallbackTeam: TeamMember[] = [{
    id:           0,
    name:         profile.name,
    role:         profile.title || "Candidato",
    description:  profile.bio,
    photo_url:    profile.photo_url,
    facebook_url: profile.facebook_url,
    instagram_url: null,
    sort_order:   0,
    is_active:    true,
    created_at:   "",
  }];

  const display = loaded && members.length > 0 ? members : fallbackTeam;

  return (
    <section
      id="equipo"
      className="py-20 md:py-28 px-5"
      style={{ background: "var(--page-bg)" }}
    >
      <div className="max-w-5xl mx-auto">

        {/* Header */}
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
            Equipo
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            Las personas detrás del{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>cambio.</em>
          </h2>
          <p className="mt-3 text-base" style={{ color: "var(--page-ink-soft)" }}>
            Un equipo comprometido, con experiencia en gestión pública y trabajo de campo.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {display.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className="text-center"
            >
              {/* Avatar cuadrado */}
              <div
                className="aspect-square rounded-[20px] mb-4 overflow-hidden relative flex items-center justify-center border"
                style={{
                  background: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 8%, var(--page-soft))",
                  borderColor: "var(--page-line)",
                }}
              >
                {member.photo_url ? (
                  <img
                    src={member.photo_url}
                    alt={member.name}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <span
                    className="font-serif font-semibold select-none"
                    style={{
                      fontSize: "clamp(28px, 5vw, 46px)",
                      color: "rgb(var(--brand-primary-rgb))",
                      opacity: 0.55,
                    }}
                  >
                    {initials(member.name)}
                  </span>
                )}
              </div>

              {/* Nombre */}
              <b
                className="block font-serif font-semibold text-base leading-snug mb-0.5"
                style={{ color: "var(--page-ink)" }}
              >
                {member.name}
              </b>

              {/* Rol */}
              <span
                className="text-[13px] font-semibold"
                style={{ color: "rgb(var(--brand-dark-rgb))" }}
              >
                {member.role}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Join CTA */}
        {profile.whatsapp_number && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-10 pt-8"
            style={{ borderTop: "1px solid var(--page-line)" }}
          >
            <a
              href={`https://wa.me/${profile.whatsapp_number.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-bold text-sm pb-1 transition-all duration-200"
              style={{
                color: "var(--page-ink)",
                borderBottom: "2px solid rgb(var(--brand-primary-rgb))",
              }}
            >
              Únete al equipo de campaña
              <ArrowRight size={16} style={{ color: "rgb(var(--brand-primary-rgb))" }} />
            </a>
          </motion.div>
        )}
      </div>
    </section>
  );
}
