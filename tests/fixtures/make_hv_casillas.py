"""Genera un PDF mínimo con el formato de casillas del JNE (sin datos reales)."""
import sys
try:
    import pymupdf as fitz
except ImportError:
    import fitz

doc = fitz.open()
page = doc.new_page(width=595, height=842)
page.insert_text((40, 60), "FORMATO UNICO DE DECLARACION JURADA DE HOJA DE VIDA", fontname="hebo", fontsize=12)
page.insert_text((40, 100), "CARGO AL QUE POSTULA", fontname="hebo", fontsize=9)

def casilla(x, y, marcada, etiqueta):
    for r in (fitz.Rect(x, y, x + 8, y + 0.5), fitz.Rect(x, y + 8, x + 8, y + 8.5),
              fitz.Rect(x, y, x + 0.5, y + 8.5), fitz.Rect(x + 7.5, y, x + 8, y + 8.5)):
        page.draw_rect(r, color=None, fill=(0, 0, 0))
    if marcada:
        page.draw_polyline([(x + 1.5, y + 4), (x + 3.5, y + 6.5), (x + 6.8, y + 1.5)], color=(0, 0, 0), width=1.6)
    page.insert_text((x + 11, y + 7), etiqueta, fontname="helv", fontsize=7)

casilla(40, 115, False, "GOBERNADOR REGIONAL")
casilla(200, 115, True, "ALCALDE DISTRITAL")
casilla(40, 130, False, "REGIDOR DISTRITAL")
doc.save(sys.argv[1])
