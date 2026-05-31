"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Facebook, Instagram, ArrowRight } from "lucide-react";
import { homeApi, type TeamMember } from "@/lib/api";
import { useCandidate } from "@/context/CandidateContext";

export function TeamSection({ initialMembers }: { initialMembers?: TeamMember[] }) {
  const { profile } = useCandidate();
  const [members, setMembers] = useState<TeamMember[]>(initialMembers ?? []);
  const [loaded,  setLoaded]  = useState(!!initialMembers?.length);

  useEffect(() => {
    if (initialMembers?.length) return; // already have SSR data
    homeApi.teamMembers()
      .then((data) => setMembers(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fallbackTeam: TeamMember[] = [{
    id:           0,
    name:         profile.name,
    role:         "Candidato a Alcalde Provincial",
    description:  profile.bio,
    photo_url:    profile.photo_url,
    facebook_url: profile.facebook_url,
    instagram_url: null,
    sort_order:   0,
    is_active:    true,
    created_at:   "",
  }];

  const display = loaded && members.length > 0 ? members : fallbackTeam;
  const isMain  = (m: TeamMember) => m.sort_order === 0 || display.indexOf(m) === 0;

  return (
    <section id="equipo" className="bg-white py-12 md:py-16 px-5">
      <div className="max-w-5xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.25 }}
          className="mb-8"
        >
          <span className="eyebrow-red">EQUIPO</span>
          <h2 className="h2-serif">Las personas detrás del cambio.</h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {display.map((member, i) => {
            const main = isMain(member);
            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
                className={`group rounded-md overflow-hidden transition-all duration-300 hover:shadow-lg
                            ${main
                              ? "border-2 border-brand-500 bg-white"
                              : "border-2 border-ink-200 bg-white hover:border-ink-400"
                            }`}
              >
                {/* Foto circular */}
                <div className="flex flex-col items-center pt-6 px-4 pb-4 text-center">
                  <div className={`relative mb-4 ${main ? "w-24 h-24" : "w-20 h-20"}`}>
                    {member.photo_url ? (
                      <img
                        src={member.photo_url}
                        alt={member.name}
                        className="w-full h-full rounded-full object-cover object-top
                                   border-4 border-white ring-2 ring-ink-200"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-ink-100 border-4 border-white ring-2 ring-ink-200
                                      flex items-center justify-center">
                        <span className="font-serif text-2xl font-bold text-ink-400">{member.name[0]}</span>
                      </div>
                    )}
                    {main && (
                      <div className="absolute -top-1 -right-1 bg-brand-500 text-white text-[9px] font-extrabold
                                      uppercase px-1.5 py-0.5 rounded-full tracking-wider">
                        #1
                      </div>
                    )}
                  </div>

                  {/* Cargo eyebrow */}
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-500 mb-1">
                    {member.role}
                  </p>

                  {/* Nombre serif */}
                  <h3 className={`font-serif font-bold text-ink-800 leading-tight mb-2
                                  ${main ? "text-base" : "text-sm"}`}>
                    {member.name}
                  </h3>

                  {member.description && (
                    <p className="text-xs text-ink-500 leading-relaxed line-clamp-3 font-medium">
                      {member.description}
                    </p>
                  )}

                  {(member.facebook_url || member.instagram_url) && (
                    <div className="flex gap-2 mt-3">
                      {member.facebook_url && (
                        <a
                          href={member.facebook_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md bg-ink-100 hover:bg-brand-500 text-ink-500
                                     hover:text-white transition-colors border border-ink-200"
                        >
                          <Facebook size={12} />
                        </a>
                      )}
                      {member.instagram_url && (
                        <a
                          href={member.instagram_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md bg-ink-100 hover:bg-brand-500 text-ink-500
                                     hover:text-white transition-colors border border-ink-200"
                        >
                          <Instagram size={12} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {profile.whatsapp_number && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="mt-8 text-center"
          >
            <a
              href={`https://wa.me/${profile.whatsapp_number.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-brand-500 hover:text-brand-600 font-semibold transition-colors"
            >
              Únete al equipo de campaña <ArrowRight size={14} />
            </a>
          </motion.div>
        )}

      </div>
    </section>
  );
}
