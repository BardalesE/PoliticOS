import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, ExternalLink, Facebook, FileText, Instagram, MapPin, MessageCircle, Users } from "lucide-react";
import { DIRECTORY_TENANT, getCandidato } from "@/lib/directorio";

/**
 * Ficha pública de un candidato del directorio. Solo existe si el candidato
 * está publicado y su base de conocimiento está lista (lo garantiza el API: en
 * cualquier otro caso responde 404 y aquí se muestra not-found).
 */

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCandidato(slug);
  if (!c) return { title: "Candidato no encontrado · PoliticOS" };

  return {
    title: `${c.name} — ${c.title} · PoliticOS`,
    description: `${c.title} por ${c.party}${c.distrito ? ` en ${c.distrito.nombre}` : ""}. Documentos oficiales y propuestas con su fuente.`,
    openGraph: { title: `${c.name} — ${c.title}`, type: "profile", locale: "es_PE" },
  };
}

const fmtSize = (b: number | null) =>
  !b ? "" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.5 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.77.12V9.77a5.68 5.68 0 1 0 4.91 5.63V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.27 4.27 0 0 1-3.2-1.48Z" />
    </svg>
  );
}

export default async function CandidatoPage({ params }: Props) {
  const { slug } = await params;
  const c = await getCandidato(slug);
  if (!c) notFound();

  const accent = { color: "rgb(var(--brand-primary-rgb))" };
  // ?candidato= deja el chat acotado a los documentos de ESTE candidato.
  const chatParams = new URLSearchParams();
  if (DIRECTORY_TENANT) chatParams.set("tenant", DIRECTORY_TENANT);
  chatParams.set("candidato", c.slug);
  const chatHref = `/chat?${chatParams.toString()}`;
  const redes = [
    { label: "Facebook", url: c.facebook_url, icon: <Facebook size={16} aria-hidden /> },
    { label: "Instagram", url: c.instagram_url, icon: <Instagram size={16} aria-hidden /> },
    { label: "TikTok", url: c.tiktok_url, icon: <TikTokIcon /> },
  ].filter((r): r is { label: string; url: string; icon: React.ReactElement } => !!r.url);
  const regidores = c.regidores ?? [];

  return (
    <main className="min-h-screen bg-[#EDEDED] text-ink-800">
      <header style={{ background: "rgb(var(--brand-primary-rgb))" }}>
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Link href="/" aria-label="PoliticOS — inicio" className="font-condensed text-[28px] uppercase leading-none tracking-wide text-white">
            Politic<span className="text-white/70">OS</span>
          </Link>
          <Link href="/#directorio" className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold" style={accent}>
            <ArrowLeft size={14} aria-hidden /> Otros candidatos
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-5 py-10">
        {/* Identidad */}
        <section className="flex flex-col gap-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:flex-row sm:items-center sm:p-8">
          {c.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.photo_url} alt={`Foto de ${c.name}`} className="h-28 w-28 shrink-0 rounded-full object-cover ring-4 ring-black/5" />
          ) : (
            <span
              className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full font-condensed text-[40px] text-white"
              style={{ background: "rgb(var(--brand-primary-rgb))" }}
              aria-hidden
            >
              {c.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-[clamp(28px,4vw,40px)] font-bold leading-tight">{c.name}</h1>
            {c.perfil_completado && (
              <p
                className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold"
                style={{ background: "rgb(var(--brand-primary-rgb) / 0.1)", color: "rgb(var(--brand-primary-rgb))" }}
                title="El candidato aportó su foto, biografía y documentos de campaña. PEPA responde con las mismas reglas para todos los candidatos."
              >
                <BadgeCheck size={14} aria-hidden /> Perfil completado por el candidato
              </p>
            )}
            <p className="mt-1 text-[17px] text-ink-600">{c.title}</p>
            <p className="mt-1 text-[14px] text-ink-500">
              {c.party}{c.list_number ? ` · Lista N.º ${c.list_number}` : ""}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-500">
              <MapPin size={14} aria-hidden /> {c.location}
            </p>
            {c.tagline && <p className="mt-3 text-[15px] italic text-ink-600">“{c.tagline}”</p>}
            {redes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {redes.map((r) => (
                  <a
                    key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3.5 py-2 text-[13px] font-bold hover:bg-ink-200"
                    aria-label={`${r.label} de ${c.name}`}
                  >
                    {r.icon} {r.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

        {c.bio && (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <h2 className="text-[20px] font-bold">Sobre {c.name.split(" ")[0]}</h2>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-600">{c.bio}</p>
          </section>
        )}

        {/* Su lista: regidores (la HV nunca se enlaza: trae DNI y patrimonio) */}
        {regidores.length > 0 && (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8" aria-labelledby="regidores-title">
            <h2 id="regidores-title" className="flex items-center gap-2 text-[20px] font-bold">
              <Users size={20} style={accent} aria-hidden /> Su lista de regidores
            </h2>
            <p className="mt-1 text-[14px] text-ink-500">
              Quienes lo acompañan en la lista. Puedes preguntarle a PEPA por cada uno: responde con su hoja de vida declarada al JNE.
            </p>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {regidores.map((r) => (
                <li key={`${r.orden}-${r.nombre}`} className="flex items-center gap-3 rounded-2xl bg-ink-100/60 p-3">
                  {r.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.foto_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ background: "rgb(var(--brand-primary-rgb))" }}>
                      {r.orden}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-snug">{r.nombre}</p>
                    <p className="text-[12px] text-ink-500">
                      {r.cargo} {r.orden}
                      {r.hoja_de_vida && <> · <span className="font-semibold" style={accent}>Hoja de vida disponible</span></>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Base de conocimiento: PDF originales, sin resúmenes */}
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8" aria-labelledby="docs-title">
          <h2 id="docs-title" className="text-[20px] font-bold">Documentos</h2>
          <p className="mt-1 text-[14px] text-ink-500">Los documentos originales en los que se basa la información de esta ficha.</p>
          <ul className="mt-4 divide-y divide-black/5">
            {c.documentos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <FileText size={20} className="shrink-0 text-ink-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{d.title}</p>
                  <p className="text-[12px] text-ink-400">{[d.source_type?.toUpperCase(), fmtSize(d.file_size)].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex gap-2">
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-ink-100 px-3.5 py-2 text-[13px] font-bold hover:bg-ink-200">
                      Ver documento
                    </a>
                  )}
                  {d.source_url && d.source_url !== d.file_url && (
                    <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[13px] font-bold ring-1 ring-black/10 hover:bg-ink-100">
                      Fuente original <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6 text-white sm:p-8" style={{ background: "rgb(var(--brand-primary-rgb))" }}>
          <div className="max-w-md">
            <h2 className="text-[22px] font-bold leading-tight">¿Tienes preguntas sobre sus propuestas?</h2>
            <p className="mt-1 text-[14px] text-white/90">PEPA, nuestra IA neutral, responde con base en estos documentos y cita su fuente.</p>
          </div>
          <Link href={chatHref} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[14px] font-bold" style={accent}>
            <MessageCircle size={17} aria-hidden /> Preguntar sobre {c.name.split(" ")[0]}
          </Link>
        </section>


        <p className="text-center text-[12px] leading-relaxed text-ink-400">
          PoliticOS no respalda a ningún candidato. La información proviene de los documentos enlazados arriba.
        </p>
      </div>
    </main>
  );
}
