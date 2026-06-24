/**
 * generate-fixtures.mjs
 * Genera los assets de prueba para el QA agent de PoliticOS.
 * NO modifica código fuente — solo escribe binarios en tests/fixtures/.
 *
 * Uso:  node tests/generate-fixtures.mjs
 */
import sharp from "sharp";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, createWriteStream, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "fixtures");
mkdirSync(OUT, { recursive: true });

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Imagen PNG/JPG con texto centrado sobre fondo de color. */
async function makeImage({ file, w, h, bg, fg, title, subtitle, format }) {
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="${shade(bg)}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="46%" font-family="Arial, sans-serif" font-size="${Math.round(
      w / 14
    )}" font-weight="bold" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${esc(
    title
  )}</text>
    ${
      subtitle
        ? `<text x="50%" y="60%" font-family="Arial, sans-serif" font-size="${Math.round(
            w / 28
          )}" fill="${fg}" text-anchor="middle" dominant-baseline="middle" opacity="0.85">${esc(
            subtitle
          )}</text>`
        : ""
    }
  </svg>`;
  const buf = Buffer.from(svg);
  let img = sharp(buf);
  if (format === "jpeg") img = img.jpeg({ quality: 82 });
  else img = img.png();
  await img.toFile(join(OUT, file));
  console.log("  ✓", file, `(${w}x${h})`);
}

function shade(hex) {
  // oscurece ~25% para el gradiente
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 50);
  const g = Math.max(0, ((n >> 8) & 255) - 50);
  const b = Math.max(0, (n & 255) - 50);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** PDF multipágina. pages = [{ heading, paragraphs[] }] */
function makePdf({ file, titleMeta, pages }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: titleMeta } });
    const stream = createWriteStream(join(OUT, file));
    doc.pipe(stream);

    pages.forEach((p, i) => {
      if (i > 0) doc.addPage();
      doc.fillColor("#0f172a").fontSize(22).font("Helvetica-Bold").text(p.heading, { align: "left" });
      doc.moveDown(0.6);
      doc.fillColor("#334155").fontSize(12).font("Helvetica");
      for (const para of p.paragraphs) {
        doc.text(para, { align: "justify" });
        doc.moveDown(0.6);
      }
      doc.fontSize(9).fillColor("#94a3b8").text(`PoliticOS — documento de prueba QA — pág. ${i + 1}/${pages.length}`, 56, 770, {
        align: "center",
      });
    });

    doc.end();
    stream.on("finish", () => {
      console.log("  ✓", file, `(${pages.length} pág.)`);
      resolve();
    });
    stream.on("error", reject);
  });
}

async function main() {
  console.log("Generando fixtures en", OUT);

  // ── Imágenes ──────────────────────────────────────────────────────────
  await makeImage({
    file: "foto-candidato.jpg", w: 400, h: 400, bg: "#1d4ed8", fg: "#ffffff",
    title: "Roberto Sánchez", subtitle: "Candidato — foto de prueba", format: "jpeg",
  });
  await makeImage({
    file: "logo-partido.png", w: 200, h: 200, bg: "#047857", fg: "#ffffff",
    title: "Futuro Perú", subtitle: "Logo", format: "png",
  });
  await makeImage({
    file: "evento-foto.jpg", w: 800, h: 600, bg: "#b45309", fg: "#ffffff",
    title: "Evento de Campaña", subtitle: "Plaza Mayor · placeholder QA", format: "jpeg",
  });

  // ── PDFs ──────────────────────────────────────────────────────────────
  await makePdf({
    file: "plan-gobierno.pdf",
    titleMeta: "Plan de Gobierno — Roberto Sánchez (ficticio)",
    pages: [
      {
        heading: "Plan de Gobierno 2026 — Futuro Perú",
        paragraphs: [
          "Este documento es material ficticio generado exclusivamente para pruebas de control de calidad de la plataforma PoliticOS. Ninguna de las propuestas aquí descritas representa posiciones reales.",
          "EJE 1 — Seguridad ciudadana: instalación de 500 cámaras de videovigilancia con inteligencia artificial, creación de serenazgo integrado entre distritos y patrullaje mixto policía-serenazgo las 24 horas.",
          "EJE 2 — Economía local: ventanilla única digital para formalizar negocios en 48 horas, exoneración tributaria para nuevas micro y pequeñas empresas durante el primer año.",
        ],
      },
      {
        heading: "EJE 3 — Educación y juventud",
        paragraphs: [
          "Programa de becas municipales para los 200 mejores estudiantes de colegios públicos, ampliación de bibliotecas comunales con acceso gratuito a internet.",
          "Creación de tres centros de innovación tecnológica para capacitación en programación, oficios técnicos y emprendimiento digital dirigidos a jóvenes de 16 a 29 años.",
          "Convenios con universidades para prácticas profesionales remuneradas en proyectos municipales.",
        ],
      },
      {
        heading: "EJE 4 — Salud y medio ambiente",
        paragraphs: [
          "Postas médicas con atención de 12 horas y telemedicina para zonas alejadas. Campañas trimestrales de despistaje gratuito.",
          "Plan de arborización con 10 000 árboles, recuperación de áreas verdes y sistema de reciclaje con incentivos económicos para los vecinos.",
          "Compromiso de transparencia: presupuesto participativo publicado en línea y rendición de cuentas trimestral abierta a la ciudadanía.",
        ],
      },
    ],
  });

  await makePdf({
    file: "biografia.pdf",
    titleMeta: "Biografía — Roberto Sánchez (ficticio)",
    pages: [
      {
        heading: "Biografía de Roberto Sánchez",
        paragraphs: [
          "Documento ficticio para pruebas QA de PoliticOS.",
          "Roberto Sánchez (n. 1978) es un personaje ficticio creado para validar la carga de documentos de conocimiento. Según esta biografía de prueba, estudió Ingeniería Industrial y una maestría en Gestión Pública.",
          "Inició su trayectoria en organizaciones vecinales, impulsando proyectos de seguridad y espacios públicos. Posteriormente trabajó en gestión municipal coordinando programas sociales.",
          "Su lema de campaña ficticio es «Futuro Perú: orden, trabajo y oportunidades». Está casado y tiene dos hijos. Aficionado al fútbol y a la lectura.",
        ],
      },
    ],
  });

  await makePdf({
    file: "propuesta-seguridad.pdf",
    titleMeta: "Propuesta de Seguridad — Roberto Sánchez (ficticio)",
    pages: [
      {
        heading: "Propuesta integral de seguridad ciudadana",
        paragraphs: [
          "Material ficticio para pruebas QA.",
          "1. Central de monitoreo 24/7 con 500 cámaras dotadas de reconocimiento de placas y botón de pánico vecinal conectado en tiempo real.",
          "2. Serenazgo sin fronteras: acuerdo intermunicipal para que las unidades persigan delitos cruzando límites distritales.",
          "3. Alarmas comunitarias en 1 000 cuadras y app ciudadana para reportar incidentes con geolocalización.",
          "4. Recuperación de espacios públicos con iluminación LED y programas de prevención para jóvenes en riesgo.",
        ],
      },
    ],
  });

  console.log("\nFixtures generadas correctamente.");
}

main().catch((e) => {
  console.error("Error generando fixtures:", e);
  process.exit(1);
});
