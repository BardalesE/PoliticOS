import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyRequestForm } from "@/components/privacy/PrivacyRequestForm";

export const metadata: Metadata = {
  title: "Privacidad y tus datos \u2014 PoliticOS",
  description: "Qu\u00e9 datos trata PoliticOS, para qu\u00e9, con qui\u00e9n, por cu\u00e1nto tiempo y c\u00f3mo ejercer tus derechos (Ley 29733).",
};

/**
 * Politica de privacidad (Ley 29733 y su reglamento, D.S. 016-2024-JUS) + canal ARCO.
 *
 * Lo que dice esta pagina DEBE coincidir con lo que hace el sistema:
 *  - retencion: PRIVACY_RETENTION_MONTHS (routes/console.php), 12 por defecto;
 *  - historial local del chat: 1 hora (app/chat/page.tsx);
 *  - no se infiere la intencion de voto (AnalyzeMessageJob);
 *  - resultados de la encuesta de apoyo: no se publican.
 * Si cambias el sistema, cambia esta pagina y la fecha ACTUALIZADO.
 * Completa TITULAR.ruc y TITULAR.domicilio: son obligatorios por ley.
 */
const TITULAR = {
  nombre: "HExisten Solutions",
  ruc: "",
  domicilio: "",
  correo: "privacidad@politicos.pe",
};
const RETENCION_MESES = 12;
const ACTUALIZADO = "27 de setiembre de 2026";

type Bloque = { p: string } | { ul: string[] };
type Seccion = { id: string; titulo: string; bloques: Bloque[] };

const titular =
  `**${TITULAR.nombre}**` +
  (TITULAR.ruc ? ` (RUC ${TITULAR.ruc})` : "") +
  (TITULAR.domicilio ? `, con domicilio en ${TITULAR.domicilio},` : "") +
  " es el responsable del tratamiento y titular del banco de datos de PoliticOS.";

const RESUMEN: string[] = [
  "Puedes usar PoliticOS **sin darnos tu nombre ni tu DNI**.",
  "Guardamos tus preguntas para responderte y para hacer **estad\u00edsticas que no muestran qui\u00e9n pregunt\u00f3**.",
  "**No vendemos tus datos** y **no adivinamos por qui\u00e9n vas a votar**.",
  `Todo se borra solo a los **${RETENCION_MESES} meses**, y puedes pedir que lo borremos antes, gratis.`,
];

const SECCIONES: Seccion[] = [
  {
    id: "responsable",
    titulo: "\u00bfQui\u00e9n es responsable de tus datos?",
    bloques: [
      { p: titular },
      { p: `Para cualquier consulta sobre tus datos escr\u00edbenos a **${TITULAR.correo}**.` },
      {
        p:
          "Si conversas en la **p\u00e1gina propia de un candidato** dentro de PoliticOS, ese candidato y su equipo de campa\u00f1a " +
          "tambi\u00e9n son responsables de los datos que se recogen en su p\u00e1gina, y PoliticOS los trata por encargo suyo. " +
          "En el **directorio p\u00fablico** de PoliticOS (donde se comparan todos los candidatos), el \u00fanico responsable es " +
          `${TITULAR.nombre} y ninguna campa\u00f1a ve tus conversaciones.`,
      },
    ],
  },
  {
    id: "datos",
    titulo: "\u00bfQu\u00e9 datos tratamos?",
    bloques: [
      {
        ul: [
          "**Lo que escribes o dictas en el chat** y las respuestas del asistente.",
          "**Un identificador aleatorio de tu navegador.** No es tu nombre ni tu DNI; sirve para mantener tu conversaci\u00f3n y limitar abusos.",
          "**La zona que eliges** (departamento, provincia y distrito) para mostrarte a tus candidatos.",
          "**Datos t\u00e9cnicos:** direcci\u00f3n IP, tipo de dispositivo y navegador, y una ubicaci\u00f3n aproximada (ciudad) calculada a partir de la IP.",
          "**Tu ubicaci\u00f3n precisa**, solo si la aceptas cuando tu navegador te lo pregunta.",
          "**Tu respuesta a \"\u00bfApoyas a este candidato?\"**, solo si decides responder. Es una opini\u00f3n pol\u00edtica, que la ley considera un dato sensible: es opcional, no se asocia a tu nombre y no publicamos sus resultados.",
          "**Datos que t\u00fa mismo menciones en el chat** (por ejemplo, tu edad o tu barrio), solo si aceptaste el aviso del chat.",
          "**Tu calificaci\u00f3n** de la plataforma (estrellas y comentario), si la dejas.",
          "**Nombre, WhatsApp y correo**, solo si decides registrarte para obtener m\u00e1s mensajes, y el c\u00f3digo de verificaci\u00f3n que te enviamos.",
        ],
      },
      { p: "**No** te pedimos tu DNI para usar el chat ni tomamos decisiones autom\u00e1ticas que tengan efectos legales sobre ti." },
    ],
  },
  {
    id: "voz",
    titulo: "Micr\u00f3fono y lectura en voz alta",
    bloques: [
      {
        p:
          "Si usas el **micr\u00f3fono**, tu voz la convierte en texto el reconocimiento de voz de tu propio navegador " +
          "(por ejemplo, Google en Chrome o Apple en Safari), seg\u00fan las pol\u00edticas de esa empresa. PoliticOS solo recibe el " +
          "texto resultante; **no grabamos ni guardamos tu voz**. La **lectura en voz alta** de las respuestas se hace " +
          "dentro de tu dispositivo y no env\u00eda nada a nuestros servidores.",
      },
    ],
  },
  {
    id: "finalidades",
    titulo: "\u00bfPara qu\u00e9 los usamos?",
    bloques: [
      {
        ul: [
          "Responder tus preguntas con informaci\u00f3n p\u00fablica y verificable de los candidatos.",
          "Mostrarte los candidatos de tu zona.",
          "Hacer **estad\u00edsticas agregadas**: clasificamos de forma autom\u00e1tica el tema y el tono de las preguntas (por ejemplo, \"agua\" o \"seguridad\") para saber qu\u00e9 preocupa en cada distrito. Esas estad\u00edsticas no identifican a nadie.",
          "Proteger la plataforma: limitar el n\u00famero de mensajes, frenar abusos y ataques.",
          "Si te registras: darte m\u00e1s mensajes y, si lo aceptaste en el formulario, contactarte por WhatsApp o correo con informaci\u00f3n relacionada con esta plataforma o con el candidato de la p\u00e1gina donde te registraste.",
        ],
      },
      {
        p:
          "Tratamos tus datos con tu **consentimiento**, que das al aceptar el aviso del chat, al responder la encuesta o al " +
          "marcar la casilla de registro. Puedes retirarlo cuando quieras, sin costo y sin tener que explicar por qu\u00e9.",
      },
      {
        p:
          "**Lo que no hacemos:** no vendemos ni alquilamos tus datos; no creamos perfiles para deducir tu intenci\u00f3n de voto; " +
          "no publicamos los resultados de la encuesta de apoyo; no usamos tus datos para publicidad de terceros.",
      },
    ],
  },
  {
    id: "compartir",
    titulo: "\u00bfCon qui\u00e9n los compartimos?",
    bloques: [
      {
        p:
          "Solo con proveedores que los tratan **por encargo nuestro** y bajo nuestras instrucciones, para que la plataforma funcione:",
      },
      {
        ul: [
          "**Inteligencia artificial** que redacta las respuestas: Groq y, como respaldo, Anthropic (Estados Unidos). Reciben tu pregunta y los fragmentos de documentos necesarios para responderla.",
          "**Alojamiento y base de datos:** Render y Vercel (Estados Unidos) y Aiven (nube).",
          "**Env\u00edo de c\u00f3digos de verificaci\u00f3n:** WhatsApp (Meta) y un servicio de correo electr\u00f3nico.",
        ],
      },
      {
        p:
          "Como varios proveedores est\u00e1n fuera del Per\u00fa, hay **transferencia internacional de datos**. La hacemos con " +
          "proveedores que ofrecen medidas de seguridad adecuadas, conforme a la Ley 29733 y su reglamento. Tambi\u00e9n " +
          "entregar\u00edamos datos a una autoridad si una ley o una orden judicial nos obliga.",
      },
      {
        p:
          "En la p\u00e1gina propia de un candidato, **su equipo de campa\u00f1a puede ver** las conversaciones de esa p\u00e1gina y los datos " +
          "de quienes se registraron all\u00ed.",
      },
    ],
  },
  {
    id: "almacenamiento",
    titulo: "Cookies y almacenamiento en tu navegador",
    bloques: [
      {
        p:
          "No usamos cookies de publicidad ni herramientas de rastreo de terceros. Guardamos en tu navegador solo lo necesario: " +
          "tu decisi\u00f3n sobre el aviso de privacidad, el identificador aleatorio, tu historial de conversaci\u00f3n de la \u00faltima hora " +
          "y preferencias como el modo voz. Puedes borrarlo desde la configuraci\u00f3n de tu navegador.",
      },
    ],
  },
  {
    id: "plazos",
    titulo: "\u00bfCu\u00e1nto tiempo los guardamos?",
    bloques: [
      {
        ul: [
          "**En tu dispositivo:** cada conversaci\u00f3n con un candidato se borra una hora despu\u00e9s de tu primera pregunta.",
          `**Conversaciones en nuestro servidor:** como m\u00e1ximo ${RETENCION_MESES} meses; luego se borran autom\u00e1ticamente.`,
          `**Registro (nombre, WhatsApp, correo), zona y respuesta a la encuesta:** hasta ${RETENCION_MESES} meses despu\u00e9s de tu \u00faltima actividad.`,
          "**C\u00f3digos de verificaci\u00f3n:** vencen en minutos.",
          "**Solicitudes de derechos:** el tiempo necesario para acreditar que las atendimos.",
        ],
      },
      { p: "Las estad\u00edsticas agregadas, que no identifican a nadie, pueden conservarse despu\u00e9s." },
    ],
  },
  {
    id: "derechos",
    titulo: "Tus derechos",
    bloques: [
      {
        p:
          "Puedes **acceder** a tus datos, **corregirlos**, **borrarlos**, **oponerte** a su uso y pedir una **copia** en un " +
          "formato de uso com\u00fan (derechos ARCO y portabilidad). Es gratis. Usa el formulario de abajo o escr\u00edbenos a " +
          `**${TITULAR.correo}**; te responderemos en los plazos que fija la ley. Para borrar datos ligados a tu registro, ` +
          "podemos pedirte que confirmes que eres t\u00fa.",
      },
      {
        p:
          "Si no quedas conforme con nuestra respuesta, puedes presentar un reclamo ante la **Autoridad Nacional de Protecci\u00f3n " +
          "de Datos Personales** del Ministerio de Justicia y Derechos Humanos.",
      },
    ],
  },
  {
    id: "menores",
    titulo: "Menores de edad",
    bloques: [
      {
        p:
          "PoliticOS est\u00e1 pensado para electores. Si tienes menos de 18 a\u00f1os, puedes leer y preguntar, pero no te registres ni " +
          "compartas tu nombre o tu tel\u00e9fono. Si detectamos datos de un menor de 14 a\u00f1os sin autorizaci\u00f3n de sus padres, los borramos.",
      },
    ],
  },
  {
    id: "seguridad",
    titulo: "Seguridad",
    bloques: [
      {
        p:
          "Usamos conexiones cifradas, accesos restringidos por rol, l\u00edmites contra el abuso y ocultamos autom\u00e1ticamente datos " +
          "sensibles de los documentos de los candidatos (como su DNI o su patrimonio declarado) en las respuestas. Si ocurriera un " +
          "incidente de seguridad que afecte tus datos, lo comunicaremos a la Autoridad y, cuando corresponda, a los afectados, " +
          "dentro de las 48 horas que exige el reglamento.",
      },
    ],
  },
  {
    id: "cambios",
    titulo: "Cambios en esta pol\u00edtica",
    bloques: [
      {
        p:
          "Si cambiamos c\u00f3mo tratamos tus datos, actualizaremos esta p\u00e1gina y su fecha. Si el cambio requiere un nuevo " +
          "consentimiento, te lo pediremos antes de aplicarlo.",
      },
    ],
  },
];

/** Convierte **texto** en negrita. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-ink-800">{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-[#F2F6EF] text-ink-800">
      <header style={{ background: "#14532D" }}>
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:h-16 sm:px-5">
          <Link href="/" className="font-condensed text-[24px] uppercase leading-none tracking-wide text-white sm:text-[26px]">
            Politic<span className="text-[#A3D9A5]">OS</span>
          </Link>
          <Link href="/" className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/20">
            Inicio
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8 text-[15px] leading-relaxed text-ink-600 sm:px-5 sm:py-10">
        <h1 className="text-[clamp(26px,4vw,38px)] font-bold leading-tight text-ink-800">{"Privacidad y tus datos"}</h1>
        <p className="mt-1 text-[13px] text-ink-400">{`\u00daltima actualizaci\u00f3n: ${ACTUALIZADO}`}</p>

        <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-[#2F7D4F]/15 sm:p-5">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#14532D]">{"En 30 segundos"}</p>
          <ul className="mt-2 space-y-1.5">
            {RESUMEN.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F7D4F]" />
                <span><Rich text={r} /></span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5">
          <Rich text={"Esta pol\u00edtica explica, sin letra chica, c\u00f3mo PoliticOS trata tus datos personales conforme a la **Ley N.\u00ba 29733**, Ley de Protecci\u00f3n de Datos Personales, y su reglamento (**D.S. N.\u00ba 016-2024-JUS**)."} />
        </p>

        <nav aria-label="Contenido" className="mt-5 flex flex-wrap gap-2">
          {SECCIONES.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#14532D] ring-1 ring-[#2F7D4F]/20 hover:bg-[#EAF3E6]">
              {s.titulo.replace(/^\u00bf|\?$/g, "")}
            </a>
          ))}
        </nav>

        {SECCIONES.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-6">
            <h2 className="mt-8 text-[19px] font-bold text-ink-800 sm:text-[20px]">{s.titulo}</h2>
            {s.bloques.map((b, i) =>
              "p" in b ? (
                <p key={i} className="mt-2"><Rich text={b.p} /></p>
              ) : (
                <ul key={i} className="mt-2 list-disc space-y-1.5 pl-5">
                  {b.ul.map((li) => <li key={li}><Rich text={li} /></li>)}
                </ul>
              )
            )}
            {s.id === "derechos" && (
              <div id="solicitud" className="mt-5 scroll-mt-6">
                <PrivacyRequestForm />
              </div>
            )}
          </section>
        ))}

        <p className="mt-10 text-[13px] text-ink-400">
          {"\u00bfDudas? Escr\u00edbenos a "}
          <a className="underline" href={`mailto:${TITULAR.correo}`}>{TITULAR.correo}</a>
          {". "}
          <Link className="underline" href="/terminos">{"T\u00e9rminos de uso"}</Link>
        </p>
      </article>
    </main>
  );
}
