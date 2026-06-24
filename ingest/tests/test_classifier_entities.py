"""
Tests offline de la integración classifier + entity_detector (Fase 6, bloque 4).

No requieren GROQ_API_KEY ni Redis: ejercitan _fallback_classify y _normalize
directamente. TARGET_ALIASES se fija antes de importar el módulo (se lee a
nivel de módulo).
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ["TARGET_ALIASES"] = "césar acuña,acuña"

from processors import classifier


def test_fallback_detects_rival_entities():
    cls = classifier._fallback_classify(
        "Keiko Fujimori critica a César Acuña por sus promesas en Piura"
    )
    slugs = {e["slug"] for e in cls["entities"]}
    assert {"keiko-fujimori", "cesar-acuna", "piura"} <= slugs


def test_fallback_mentions_include_canonical_names_without_duplicates():
    cls = classifier._fallback_classify("Keiko Fujimori se reunió con César Acuña")
    assert "Keiko Fujimori" in cls["mentions"]
    # el alias propio "césar acuña" ya está; el nombre canónico no se duplica
    normalized = [classifier._norm(m) for m in cls["mentions"]]
    assert normalized.count("cesar acuna") == 1


def test_fallback_is_attack_still_relative_to_own_candidate():
    # Ataque a un rival: se registra la entidad pero is_attack queda False
    cls = classifier._fallback_classify("Keiko Fujimori es una corrupta, dice colectivo")
    assert cls["is_attack"] is False
    assert "keiko-fujimori" in {e["slug"] for e in cls["entities"]}

    # Ataque al candidato propio: sí dispara
    cls = classifier._fallback_classify("César Acuña es un corrupto, afirman")
    assert cls["is_attack"] is True


def test_normalize_canonicalizes_free_llm_mentions():
    # El LLM devolvió "Keiko" como string libre y el texto no la nombra completa:
    # la canonicalización debe resolverla igual vía mentions.
    out = classifier._normalize(
        {
            "sentiment": -0.5,
            "emotion": "enojo",
            "topic": "corrupcion",
            "mentioned_politicians": ["Keiko"],
            "is_attack": True,
            "target_politician": "Keiko",
            "is_political": True,
        },
        text="La lideresa naranja respondió a las críticas",
    )
    assert "keiko-fujimori" in {e["slug"] for e in out["entities"]}
    assert out["is_attack"] is False  # el blanco no es el candidato propio


def test_payload_shape_has_entities_key():
    cls = classifier._fallback_classify("texto sin política")
    assert "entities" in cls
    assert cls["entities"] == []
