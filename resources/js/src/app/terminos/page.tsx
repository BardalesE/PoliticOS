import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos de uso — PoliticOS",
  description: "Condiciones para usar PoliticOS y su asistente de inteligencia artificial.",
};

/** ⚠ Borrador: revisar con asesoría legal antes de publicar. */
const ACTUALIZADO = "24 de setiembre de 2026";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-[20px] font-bold text-ink-800">{children}</h2>;
}

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-[#F2F6EF] text-ink-800">
      <header style={{ background: "#14532D" }}>
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="font-condensed text-[26px] uppercase leading-none tracking-wide text-white">
            Politic<span className="text-[#A3D9A5]">OS</span>
          </Link>
          <Link href="/" className="text-[13px] font-semibold text-white/90 hover:text-white">Inicio</Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed text-ink-600">
        <h1 className="text-[clamp(28px,4vw,38px)] font-bold leading-tight text-ink-800">Términos de uso</h1>
        <p className="mt-1 text-[13px] text-ink-400">Última actualización: {ACTUALIZADO}</p>

        <H2>Qué es PoliticOS</H2>
        <p className="mt-2">
          Una plataforma independiente que resume información pública de candidatos (planes de gobierno, hojas de
          vida) con ayuda de inteligencia artificial. No es un sitio oficial del JNE ni de ningún organismo electoral,
          ni pertenece a ningún partido o candidato.
        </p>

        <H2>El asistente puede equivocarse</H2>
        <p className="mt-2">
          Las respuestas se generan automáticamente a partir de documentos públicos y muestran su fuente. Aun así,
          pueden contener errores u omisiones. Antes de decidir tu voto, revisa la fuente original en Voto Informado
          del JNE (votoinformado.jne.gob.pe).
        </p>

        <H2>Uso correcto</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>No uses el chat para insultar, amenazar, difundir datos de terceros ni intentar manipular al asistente.</li>
          <li>No automatices consultas ni intentes saturar el servicio. Hay límites de mensajes por conversación.</li>
          <li>Podemos bloquear el acceso a quien incumpla estas reglas.</li>
        </ul>

        <H2>Neutralidad</H2>
        <p className="mt-2">
          Tratamos a todos los candidatos con las mismas reglas y las mismas preguntas sugeridas. La encuesta
          &quot;¿Apoyas a…?&quot; es anónima e informal: no es una encuesta científica ni un resultado oficial.
        </p>

        <H2>Tus datos</H2>
        <p className="mt-2">
          Cómo tratamos tu información está en <Link className="font-semibold text-[#14532D] underline" href="/privacidad">Privacidad y tus datos</Link>,
          donde también puedes borrar tus datos o presentar un reclamo.
        </p>
      </article>
    </main>
  );
}
