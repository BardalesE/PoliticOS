"""
Tests offline del detector de entidades (sin LLM, sin Redis, sin red).

Criterio de done de Fase 6: el detector reconoce >=80% de los candidatos
presidenciales del dataset en titulares de prensa realistas.

Correr desde ingest/:  python -m pytest tests/ -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from processors.entity_detector import EntityDetector, load_bundled

DATASET = load_bundled()
DETECTOR = EntityDetector(DATASET)

# Un titular realista por candidato del dataset, escrito como lo haría la
# prensa peruana (apellidos, tildes, mayúsculas de titular).
HEADLINES = {
    "keiko-fujimori":     "Keiko Fujimori presentó su plan de gobierno en Arequipa",
    "rafael-lopez-aliaga": "López Aliaga arremete contra el JNE por la exclusión de candidatos",
    "cesar-acuna":        "César Acuña promete agua potable para todas las regiones",
    "mario-vizcarra":     "Mario Vizcarra lidera mitin de Perú Primero en Tacna",
    "carlos-alvarez":     "Carlos Álvarez propone pena de muerte para corruptos",
    "phillip-butters":    "Phillip Butters confirma alianza con gremios de transportistas",
    "alfonso-lopez-chau": "López Chau plantea una nueva constitución económica",
    "roberto-sanchez":    "Roberto Sánchez defiende su gestión en el Mincetur",
    "vladimir-cerron":    "Vladimir Cerrón reaparece en acto de Perú Libre pese a orden de captura",
    "rafael-belaunde":    "Rafael Belaunde Llosa sufre atentado durante gira por Cañete",
    "george-forsyth":     "George Forsyth recorre mercados de Villa El Salvador",
    "jose-luna-galvez":   "José Luna Gálvez inscribe su fórmula presidencial con Podemos Perú",
    "hernando-de-soto":   "Hernando de Soto anuncia su equipo técnico",
    "yonhy-lescano":      "Yonhy Lescano critica al Congreso por blindar a fiscal cuestionado",
    "fiorella-molinelli": "Fiorella Molinelli presenta propuesta de reforma de pensiones",
    "marisol-perez-tello": "Marisol Pérez Tello pide reforma total del sistema de justicia",
}


def _slugs(text, etype=None):
    return {e["slug"] for e in DETECTOR.detect(text) if etype is None or e["type"] == etype}


# ─── Criterio de done: >=80% de candidatos detectados ───────────────

def test_detects_at_least_80_percent_of_candidates():
    candidates = {c["slug"] for c in DATASET["candidates"]}
    assert candidates == set(HEADLINES), "el corpus debe cubrir todos los candidatos del dataset"

    detected = sum(1 for slug, headline in HEADLINES.items() if slug in _slugs(headline, "candidate"))
    ratio = detected / len(HEADLINES)
    assert ratio >= 0.80, f"solo {detected}/{len(HEADLINES)} candidatos detectados ({ratio:.0%})"


# ─── Matching básico ─────────────────────────────────────────────────

def test_accent_and_case_insensitive():
    assert "cesar-acuna" in _slugs("CESAR ACUÑA visitó Trujillo")
    assert "cesar-acuna" in _slugs("cesar acuna visitó Trujillo")


def test_word_boundary_no_substring_match():
    # "keikollanos" no es "keiko"
    assert "keiko-fujimori" not in _slugs("El congresista Keikollanos votó en contra")


def test_alias_matches_canonical_slug():
    assert "rafael-lopez-aliaga" in _slugs("Porky promete trenes para Lima")


def test_no_duplicates_on_repeated_mentions():
    entities = DETECTOR.detect("Keiko Fujimori dijo que Keiko Fujimori no se retira")
    assert len([e for e in entities if e["slug"] == "keiko-fujimori"]) == 1


def test_returns_type_slug_name_shape():
    e = DETECTOR.detect("Keiko Fujimori en Cusco")[0]
    assert set(e) == {"type", "slug", "name"}


# ─── Partidos ────────────────────────────────────────────────────────

def test_detects_party_by_name():
    assert "fuerza-popular" in _slugs("Fuerza Popular rechaza el informe de la comisión", "party")

def test_acronym_requires_uppercase():
    assert "alianza-para-el-progreso" in _slugs("APP presentó su lista al Congreso", "party")
    assert "alianza-para-el-progreso" not in _slugs("descargó una app para pedir taxi", "party")

def test_apra_titlecase_and_uppercase():
    assert "partido-aprista" in _slugs("El Apra anuncia candidato propio", "party")
    assert "partido-aprista" in _slugs("EL APRA VUELVE AL RUEDO", "party")


# ─── Circunscripciones ───────────────────────────────────────────────

def test_detects_district_with_accents():
    assert "ancash" in _slugs("Áncash registra nuevo conflicto minero", "district")

def test_la_libertad_requires_titlecase():
    assert "la-libertad" in _slugs("La Libertad registra aumento de extorsiones", "district")
    assert "la-libertad" not in _slugs("dijo que la libertad de expresión está en riesgo", "district")

def test_lima_requires_capitalized():
    assert "lima-metropolitana" in _slugs("Anuncian obras viales en Lima", "district")
    assert "lima-metropolitana" not in _slugs("compró una lima para metales", "district")

def test_dataset_has_27_districts():
    assert len(DATASET["districts"]) == 27


# ─── Texto combinado (titular real con varias entidades) ────────────

def test_mixed_headline():
    slugs = _slugs("Keiko Fujimori y López Aliaga se enfrentan por el voto de Puno")
    assert {"keiko-fujimori", "rafael-lopez-aliaga", "puno"} <= slugs

def test_empty_and_irrelevant_text():
    assert DETECTOR.detect("") == []
    assert DETECTOR.detect("El precio del pollo subió en los mercados") == []
