/**
 * Símbolo del partido de un candidato (el que el votante reconoce en la cédula).
 * Fondo blanco y "contain": los logos traen bordes y colores propios; recortarlos
 * o teñirlos los haría irreconocibles.
 */
export function PartySymbol({
  src, party, size = 28, className = "",
}: {
  src?: string | null;
  party?: string | null;
  size?: number;
  className?: string;
}) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={party ? `Símbolo de ${party}` : "Símbolo del partido"}
      title={party ?? undefined}
      loading="lazy"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-md bg-white object-contain p-0.5 shadow-sm ring-1 ring-black/10 ${className}`}
    />
  );
}
