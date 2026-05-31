/**
 * lib/mockResponses.ts
 * Respuestas pre-cargadas para que el chat funcione INSTANTÁNEAMENTE
 * incluso sin backend. Útil para:
 *  - Demo al candidato sin levantar Laravel
 *  - Fallback si el API falla
 *  - Vercel preview sin backend conectado
 */

import type { MediaAttachment } from "@/types/chat";

type MockResponse = {
  match: RegExp[];
  reply: string;
  topic?: string;
  media?: MediaAttachment[];
};

const responses: MockResponse[] = [
  {
    match: [/agua/i, /potable/i, /saneamiento/i],
    topic: "agua",
    reply: "Hola compadre. El agua en San Miguel es mi prioridad uno. Tengo proyectos concretos: ampliar la red en Niepos para 600 familias, llevar agua a los caseríos altos de Calquis, y reparar las tuberías viejas de Pallaques. En total cerca de 625 mil soles del presupuesto participativo en el primer año. ¿Quieres que te cuente más de algún distrito en específico?",
    media: [
      { type: "pdf", url: "#", title: "Plan de Agua y Saneamiento" },
      { type: "video", url: "https://www.tiktok.com/@james.cueva6", title: "Video: Recorrido por Niepos" },
    ],
  },
  {
    match: [/niepos/i],
    topic: "agua",
    reply: "Niepos lo conozco bien, vecino. He caminado Huayrapongo y La Laguna. La red de agua se queda corta y las familias cargan agua del río. Mi proyecto: ampliar la red por 280 mil soles, beneficiando a más de 600 familias. Empezamos el primer trimestre del 2027 si me das tu voto en octubre.",
    media: [{ type: "map", url: "#", title: "Ver mapa del proyecto" }],
  },
  {
    match: [/agricultura/i, /campo/i, /cultivo/i, /agricultor/i],
    topic: "agricultura",
    reply: "El campesino sangmiguelino vende barato y compra caro. Eso se acaba. Mi propuesta principal es un centro de acopio agrícola — 420 mil soles — donde el productor venda directo, sin intermediarios. Además capacitación técnica con SENASA y 4 reservorios para riego en Llapa. El campo es nuestra economía, hay que defenderlo.",
    media: [{ type: "pdf", url: "#", title: "Propuesta Agrícola Completa" }],
  },
  {
    match: [/quien (eres|es james)/i, /quien soy/i, /quien es james/i, /presenta/i],
    reply: "Soy James Cueva, hijo de San Miguel. Crecí en estos cerros, conozco cada distrito porque los he caminado. No vengo de la política limeña, vengo del pueblo. Mi compromiso es trabajar de la mano con la gente, no desde un escritorio. ¿Qué quieres saber sobre mi propuesta?",
  },
  {
    match: [/por qu[eé] (quieres|quiere) ser alcalde/i, /por qu[eé] postul/i],
    reply: "Porque San Miguel merece más. He visto cómo nuestros caseríos siguen sin agua, sin pistas, sin oportunidades para los jóvenes. No quiero hacer política para enriquecerme, quiero gestionar la provincia como se gestiona una familia: con orden, transparencia y mirando siempre por los que menos tienen.",
  },
  {
    match: [/por qu[eé] no ganaste/i, /perdiste/i, /eleccion 2022/i, /elección 2022/i],
    reply: "Esa elección la perdí, no te voy a mentir. El partido que ganó tenía más estructura y el arrastre del gobernador regional. Pero esa derrota me sirvió para aprender. Hoy vuelvo mejor preparado, con propuestas concretas por distrito y un equipo que conoce el terreno. La política se aprende caminando, no leyendo libros.",
  },
  {
    match: [/carretera/i, /pista/i, /trocha/i, /v[ií]a/i, /asfalt/i, /camino/i],
    topic: "vias",
    reply: "Tres obras grandes en los primeros 18 meses: la trocha San Miguel-Calquis (14 km de afirmado), el asfaltado del jirón principal de Pallaques (1.2 km) y el puente vehicular de El Prado. En total más de 2 millones de soles en infraestructura vial. Vamos a conectar a los caseríos que hoy quedan aislados en invierno.",
    media: [{ type: "pdf", url: "#", title: "Plan Vial 2027-2030" }],
  },
  {
    match: [/salud/i, /posta/i, /m[eé]dic/i, /hospital/i],
    topic: "salud",
    reply: "Voy a equipar las postas de 6 distritos con lo básico: balanzas, camillas, medicamentos. Y conseguir una ambulancia 4x4 para emergencias rurales. La salud no puede esperar a que el paciente baje a Pallaques 3 horas en moto. Total: 620 mil soles entre equipamiento y ambulancia.",
  },
  {
    match: [/educaci[oó]n/i, /colegio/i, /escuela/i, /estudiante/i],
    topic: "educacion",
    reply: "Dos propuestas concretas: llevar internet a 20 colegios rurales (290 mil soles) y crear un programa de becas para que los chicos que ingresen a universidad nacional no se queden por falta de plata. 30 becas anuales para empezar. La educación es lo único que nos saca adelante como provincia.",
  },
  {
    match: [/seguridad/i, /rondas/i, /rondero/i, /delincuencia/i],
    topic: "seguridad",
    reply: "Fortalecer a las rondas campesinas, que son nuestros guardianes de toda la vida. Apoyo con linternas, radios, ponchos. Coordinación estrecha con la PNP. Y en Pallaques, 12 cámaras de seguridad en puntos críticos con monitoreo desde la municipalidad. La seguridad no se compra, se construye con la gente.",
  },
  {
    match: [/corrupci[oó]n/i, /transparencia/i, /robo/i],
    reply: "Con transparencia total, compadre. Cada sol que entre a la municipalidad estará publicado en la web — esta misma plataforma. Cada obra con su presupuesto, su avance, su responsable y sus fotos en tiempo real. Si el vecino ve algo raro, lo denuncia y se investiga. Sin protección a nadie. Esa es la diferencia.",
  },
  {
    match: [/calquis/i],
    topic: "agua",
    reply: "En Calquis tengo dos proyectos: el sistema de agua para los caseríos altos (195 mil soles) con tanques elevados, y el mejoramiento de la trocha San Miguel-Calquis (14 km de afirmado por 680 mil soles). Calquis necesita conexión y agua segura. Ambas obras en los primeros 18 meses de gestión.",
  },
];

const fallback: MockResponse = {
  match: [],
  reply: "Esa es una buena pregunta, compadre. Estoy preparando una respuesta más completa con mi equipo. Mientras tanto, ¿quieres preguntarme sobre agua, agricultura, carreteras, salud, educación o seguridad? Esos son los ejes principales de mi plan.",
};

export function findMockResponse(message: string): MockResponse {
  const found = responses.find(r => r.match.some(re => re.test(message)));
  return found ?? fallback;
}
