#!/usr/bin/env python3
"""
Casillas MARCADAS de un Formato Único de Hoja de Vida del JNE.

pdftotext pierde las marcas (son trazos vectoriales, no texto): en el texto
quedan TODAS las opciones ("ALCALDE DISTRITAL REGIDOR DISTRITAL…") y la IA
elegía cualquiera (bug 2026-09-30: dijo "candidato a regidor" de un candidato
a alcalde). Este script:

  1. arma los cuadraditos a partir de sus bordes (líneas horizontales ~7-9 pt),
  2. rasteriza la página y mide cuánta tinta hay DENTRO de cada cuadro,
  3. para cada cuadro marcado devuelve: sección (último título en negrita
     arriba), pregunta (texto a la izquierda o en la fila de arriba) y opción
     (texto a la derecha).

Uso:   python3 hv_casillas.py archivo.pdf
Salida (stdout, JSON): {"pages": [["SECCIÓN — pregunta: OPCIÓN", ...], ...]}
Si algo falla, sale con código != 0 y el llamador sigue sin casillas.
"""
import json
import sys

import re
import warnings

warnings.filterwarnings("ignore")
try:                      # PyMuPDF reciente: el alias `fitz` imprime un aviso en stdout
    import pymupdf as fitz
except ImportError:       # Debian bookworm (python3-fitz) solo trae `fitz`
    import fitz

ZOOM = 3
INK_THRESHOLD = 0.15   # fracción de píxeles oscuros dentro del cuadro para "marcado"


def boxes(page):
    hs = [d["rect"] for d in page.get_drawings() if 6 < d["rect"].width < 9.5 and d["rect"].height < 1]
    found = []
    for a in hs:
        for b in hs:
            if abs(a.x0 - b.x0) < 0.6 and 6 < (b.y0 - a.y0) < 9.5:
                r = fitz.Rect(a.x0, a.y0, a.x1, b.y1)
                if not any(abs(r.x0 - o.x0) < 1 and abs(r.y0 - o.y0) < 1 for o in found):
                    found.append(r)
    return sorted(found, key=lambda r: (round(r.y0), r.x0))


def ink(pix, r):
    x0, y0, x1, y1 = (int(v * ZOOM) for v in (r.x0 + 1.8, r.y0 + 1.8, r.x1 - 1.8, r.y1 - 1.8))
    dark = total = 0
    for y in range(max(0, y0), min(pix.height, y1)):
        for x in range(max(0, x0), min(pix.width, x1)):
            total += 1
            if sum(pix.pixel(x, y)[:3]) < 380:
                dark += 1
    return dark / total if total else 0.0


def main(path):
    doc = fitz.open(path)
    out = []
    for page in doc:
        words = page.get_text("words")          # x0, y0, x1, y1, text, block, line, n
        # Títulos de sección: líneas en negrita. En un título de varias líneas
        # ("VI. RELACIÓN DE SENTENCIAS, QUE…") se usa su primera línea.
        bold_lines = []
        for b in page.get_text("dict")["blocks"]:
            primera = None
            for line in b.get("lines", []):
                spans = [s for s in line["spans"] if "Negrita" in s["font"] or "Bold" in s["font"]]
                text = re.sub(r"\s+", " ", " ".join(s["text"].strip() for s in spans)).strip()
                if len(text) <= 3:
                    primera = None
                    continue
                primera = primera or text
                bold_lines.append((line["bbox"][1], primera[:90]))

        bxs = boxes(page)
        pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
        marcadas = []
        for i, r in enumerate(bxs):
            if ink(pix, r) < INK_THRESHOLD:
                continue
            ymid = (r.y0 + r.y1) / 2
            same_row = [w for w in words if abs((w[1] + w[3]) / 2 - ymid) < 5]
            # opción: a la derecha, hasta el siguiente cuadro de la misma fila
            next_x = min([o.x0 for o in bxs if o is not r and abs((o.y0 + o.y1) / 2 - ymid) < 3 and o.x0 > r.x1] + [r.x1 + 110])
            opcion = " ".join(w[4] for w in sorted(same_row, key=lambda w: w[0]) if r.x1 - 0.5 < w[0] < next_x)
            # pregunta: texto a la izquierda en la fila, solo si NO hay otra casilla a la
            # izquierda (en las grillas de cargos ese texto es otra opción) y parece pregunta.
            otras_izq = [o for o in bxs if o is not r and abs((o.y0 + o.y1) / 2 - ymid) < 3 and o.x1 < r.x0]
            pregunta = ""
            # Etiqueta pegada a la casilla ("CONCLUIDOS:" en medio de una fila de SÍ/NO).
            cerca = [w[4] for w in sorted(same_row, key=lambda w: w[0])
                     if r.x0 - 70 < w[0] < r.x0 and w[4] not in ("SÍ", "NO", "TENGO")]
            if otras_izq and cerca and cerca[-1].endswith(":"):
                pregunta = cerca[-1]
            elif not otras_izq:
                izq = " ".join(w[4] for w in sorted(same_row, key=lambda w: w[0]) if w[0] < r.x0 and w[4] not in ("SÍ", "NO", "TENGO"))
                if "?" in izq or izq.endswith(":"):
                    pregunta = izq
            if not pregunta:
                arriba = [w for w in words if 3 < ymid - (w[1] + w[3]) / 2 < 14 and r.x0 - 40 < w[0] < r.x0 + 200]
                txt = " ".join(w[4] for w in sorted(arriba, key=lambda w: (round(w[1]), w[0])))
                if "?" in txt:
                    pregunta = txt
            seccion = next((t for y, t in sorted(bold_lines, reverse=True) if y < r.y0 - 1), "")
            pregunta = pregunta.rstrip(":").strip()
            if re.match(r"^CARGO \d+\.?$", seccion):      # sección IV, página 2
                seccion = "CARGOS DE ELECCIÓN POPULAR — " + seccion.rstrip(".")
            if seccion and pregunta.startswith(seccion):
                pregunta = pregunta[len(seccion):].strip()
            partes = [p for p in (seccion, pregunta) if p]
            marcadas.append(f"{' — '.join(partes)}: {opcion}".strip(": "))
        out.append(marcadas)
    print(json.dumps({"pages": out}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
