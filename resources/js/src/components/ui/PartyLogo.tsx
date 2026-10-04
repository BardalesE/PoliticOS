/**
 * Imagen principal del candidato = símbolo de su partido (decisión 2026-10-04):
 * es lo que el votante reconoce en la cédula y es fácil de conseguir; la foto
 * del candidato ya no se usa. Sin logo cargado, las iniciales del PARTIDO.
 */
export function partyInitials(party?: string | null, fallback = "?"): string {
  const words = (party ?? "").split(/\s+/).filter((w) => w.length > 2 && !/^(del|las|los|por|para)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || fallback[0] || "?").toUpperCase();
}

export function PartyLogo({
  src, party, name, size = 64, className = "",
}: {
  src?: string | null;
  party?: string | null;
  /** nombre del candidato: solo para las iniciales si tampoco hay partido */
  name?: string;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={party ? `Símbolo de ${party}` : "Símbolo del partido"}
        title={party ?? undefined}
        loading="lazy"
        style={box}
        className={`shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-sm ring-1 ring-black/10 ${className}`}
      />
    );
  }
  return (
    <span
      style={{ ...box, fontSize: Math.round(size * 0.34) }}
      title={party ?? undefined}
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-[#EAF3E6] font-bold text-[#14532D] ring-1 ring-[#2F7D4F]/20 ${className}`}
      aria-hidden
    >
      {partyInitials(party, name)}
    </span>
  );
}
