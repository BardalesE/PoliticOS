import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyRequestForm } from "@/components/privacy/PrivacyRequestForm";

export const metadata: Metadata = {
  title: "Privacidad y tus datos — PoliticOS",
  description: "Qué datos guarda PoliticOS, para qué, por cuánto tiempo y cómo borrarlos (Ley 29733).",
};

/**
 * Política de privacidad (Ley 29733) + canal ARCO.
 *
 * ⚠ ANTES DE PUBLICAR: completa TITULAR con los datos reales (razón social, RUC,
 * domicilio) y haz revisar el texto por un abogado. Lo que dice esta página debe
 * coincidir con lo que hace el sistema (retención: PRIVACY_RETENTION_MONTHS en
 * el backend; historial local: 1 hora en app/chat/page.tsx).
 */
const TITULAR = {
  nombre:    "HExisten Solutions",
  ruc:       "[RUC POR COMPLETAR]",
  domicilio: "[DOMICILIO POR COMPLETAR]",
  correo:    "privacidad@politicos.pe",
};
const RETENCION_MESES = 12;
const ACTUALIZADO = "24 de setiembre de 2026";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-[20px] font-bold text-ink-800">{children}</h2>;
}

export default function PrivacidadPage() {
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
        <h1 className="text-[clamp(28px,4vw,38px)] font-bold leading-tight text-ink-800">Privacidad y tus datos</h1>
        <p className="mt-1 text-[13px] text-ink-400">Última actualización: {ACTUALIZADO}</p>

        <p className="mt-5">
          PoliticOS te ayuda a conocer a tus candidatos con información verificable. Aquí te contamos, sin letra
          chica, qué datos guardamos, para qué y cómo puedes borrarlos. Aplicamos la Ley N.º 29733, Ley de
          Protección de Datos Personales, y su reglamento.
        </p>

        <H2>¿Quién es responsable?</H2>
        <p className="mt-2">
          {TITULAR.nombre} (RUC {TITULAR.ruc}), con domicilio en {TITULAR.domicilio}, es el titular del banco de
          datos. Contacto: <a className="font-semibold text-[#14532D] underline" href={`mailto:${TITULAR.correo}`}>{TITULAR.correo}</a>.
        </p>

        <H2>¿Qué datos guardamos?</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><strong>Lo que escribes en el chat</strong> y las respuestas del asistente.</li>
          <li><strong>Un identificador anónimo</strong> de tu navegador (no es tu nombre ni tu DNI).</li>
          <li><strong>La zona que eliges</strong> (departamento, provincia, distrito) y, si respondes, tu apoyo o no a un candidato (encuesta anónima).</li>
          <li><strong>Datos técnicos</strong>: dirección IP y tipo de dispositivo, para seguridad y para limitar abusos.</li>
          <li><strong>Tu ubicación</strong>, solo si aceptas compartirla.</li>
          <li><strong>Nombre, WhatsApp y correo</strong>, solo si decides registrarte para tener más mensajes.</li>
        </ul>
        <p className="mt-2">No te pedimos tu DNI para usar el chat.</p>

        <H2>¿Para qué los usamos?</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Responder tus preguntas y mostrarte los candidatos de tu zona.</li>
          <li>Hacer <strong>estadísticas agregadas</strong> (por ejemplo, qué temas preocupan más en un distrito). Estas estadísticas no muestran quién preguntó.</li>
          <li>Prevenir abusos y ataques a la plataforma.</li>
        </ul>
        <p className="mt-2">
          Si conversas en el chat <strong>de un candidato específico</strong> (su propia página dentro de PoliticOS), su
          equipo de campaña puede leer esas conversaciones para conocer las inquietudes de los vecinos. En el
          directorio público de PoliticOS, las conversaciones solo las ve el equipo de PoliticOS.
        </p>

        <H2>¿Con quién los compartimos?</H2>
        <p className="mt-2">
          No vendemos tus datos. Para funcionar usamos proveedores que los procesan por encargo nuestro: servicios de
          inteligencia artificial que generan las respuestas y servicios de alojamiento en la nube. Algunos están fuera
          del Perú (por ejemplo, en Estados Unidos), por lo que hay transferencia internacional de datos, con las
          medidas de seguridad que exige la ley.
        </p>

        <H2>¿Cuánto tiempo los guardamos?</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><strong>En tu dispositivo:</strong> cada conversación con un candidato se borra a la hora de tu primera pregunta.</li>
          <li><strong>En nuestro servidor:</strong> las conversaciones se guardan como máximo {RETENCION_MESES} meses y luego se borran automáticamente.</li>
          <li>Puedes pedir que las borremos antes, en cualquier momento (abajo).</li>
        </ul>

        <H2>Tus derechos</H2>
        <p className="mt-2">
          Puedes <strong>acceder</strong> a tus datos, <strong>corregirlos</strong>, <strong>borrarlos</strong> u
          <strong> oponerte</strong> a su uso (derechos ARCO). Es gratis. Si no quedas conforme con nuestra respuesta,
          puedes acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos
          Humanos.
        </p>

        <section id="solicitud" aria-labelledby="solicitud-title" className="mt-6 scroll-mt-6">
          <h2 id="solicitud-title" className="sr-only">Ejercer tus derechos</h2>
          <PrivacyRequestForm />
        </section>

        <H2>Seguridad</H2>
        <p className="mt-2">
          Usamos conexiones cifradas, accesos restringidos y ocultamos automáticamente datos sensibles de los
          documentos de los candidatos (como su DNI o su patrimonio declarado) en las respuestas del asistente.
        </p>

        <p className="mt-10 text-[13px] text-ink-400">
          ¿Dudas? Escríbenos a <a className="underline" href={`mailto:${TITULAR.correo}`}>{TITULAR.correo}</a>.{" "}
          <Link className="underline" href="/terminos">Términos de uso</Link>
        </p>
      </article>
    </main>
  );
}
