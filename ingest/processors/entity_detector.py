"""
Detección canónica de entidades JNE (candidatos, partidos, circunscripciones).

Complementa al clasificador LLM: las menciones del LLM son strings libres
("Keiko", "la lideresa de Fuerza Popular"), así que la inteligencia electoral
no puede agregar por rival. Este detector matchea el texto contra un
diccionario de entidades y devuelve slugs canónicos.

Matching:
  - Por diccionario: sin tildes, case-insensitive, word-boundary.
  - Alias cortos tipo sigla ("app", "apra", "lima") exigen mayúsculas en el
    texto original (APP / Apra / Lima) para no matchear sustantivos comunes.
  - Frases ambiguas ("la libertad") exigen title-case ("La Libertad").

Fuente del diccionario, en orden:
  1. Redis de la instancia (key politicos:entities, poblada por
     workers.entities_sync con GET /api/ingest/entities de Laravel).
  2. Copia bundled en ingest/data/jne_entities_2026.json (fallback offline).
"""

import json
import logging
import os
import re
import time
import unicodedata
from pathlib import Path

log = logging.getLogger(__name__)

BUNDLED_PATH = Path(__file__).resolve().parent.parent / "data" / "jne_entities_2026.json"
REDIS_ENTITIES_KEY = "politicos:entities"

# Frases que también son sustantivo común: solo cuentan en title-case.
_TITLECASE_ONLY = {"la libertad"}


def _norm(s: str) -> str:
    """minúsculas + sin tildes (mismo criterio que classifier._norm)."""
    s = unicodedata.normalize("NFKD", str(s).lower().strip())
    return "".join(c for c in s if not unicodedata.combining(c))


def _strip_accents(s: str) -> str:
    """sin tildes pero preservando mayúsculas (para matching estricto)."""
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in s if not unicodedata.combining(c))


class EntityDetector:
    def __init__(self, dataset: dict):
        self.version = dataset.get("version")
        # [(regex sobre texto normalizado, regex estricto sobre texto original
        #   sin tildes o None, entity)]
        self._entries = []

        for etype, key in (("candidate", "candidates"),
                           ("party", "parties"),
                           ("district", "districts")):
            for e in dataset.get(key, []):
                entity = {"type": etype, "slug": e["slug"], "name": e["name"]}
                plain, strict = [], []

                for term, is_alias in [(e["name"], False)] + [(a, True) for a in e.get("aliases", [])]:
                    t = _norm(term)
                    if not t:
                        continue
                    if t in _TITLECASE_ONLY:
                        strict.append(t.title())            # "La Libertad"
                    elif is_alias and len(t) <= 4 and " " not in t:
                        strict.append(t.upper())            # "APP", "LIMA"
                        if len(t) == 4:
                            strict.append(t.capitalize())   # "Apra", "Lima"
                    else:
                        plain.append(t)

                plain_re = None
                if plain:
                    alt = "|".join(re.escape(t) for t in sorted(plain, key=len, reverse=True))
                    plain_re = re.compile(rf"\b(?:{alt})\b")
                strict_re = None
                if strict:
                    alt = "|".join(re.escape(t) for t in sorted(strict, key=len, reverse=True))
                    strict_re = re.compile(rf"\b(?:{alt})\b")

                self._entries.append((plain_re, strict_re, entity))

    def detect(self, text: str) -> list:
        """Entidades presentes en `text` → [{type, slug, name}], sin duplicados."""
        if not text:
            return []
        ntext = _norm(text)
        stext = _strip_accents(text)
        found = []
        for plain_re, strict_re, entity in self._entries:
            if (plain_re and plain_re.search(ntext)) or (strict_re and strict_re.search(stext)):
                found.append(dict(entity))
        return found


def load_bundled() -> dict:
    with open(BUNDLED_PATH, encoding="utf-8") as f:
        return json.load(f)


def _load_from_redis():
    """Diccionario cacheado por workers.entities_sync, o None si no hay."""
    try:
        import redis
        r = redis.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"),
                                 socket_connect_timeout=2)
        raw = r.get(REDIS_ENTITIES_KEY)
        if raw:
            return json.loads(raw)
    except Exception as e:
        log.debug(f"Entities not available from Redis: {e}")
    return None


_cached = None        # (detector, loaded_at)
_CACHE_TTL = 3600     # re-mira Redis cada hora; el sync de beat es diario


def get_detector() -> EntityDetector:
    """Detector con el diccionario más fresco disponible (Redis > bundled)."""
    global _cached
    now = time.monotonic()
    if _cached and now - _cached[1] < _CACHE_TTL:
        return _cached[0]

    dataset = _load_from_redis()
    if dataset is None:
        dataset = load_bundled()
        log.info("Entity dataset: bundled fallback (version %s)", dataset.get("version"))
    else:
        log.info("Entity dataset: Redis (version %s)", dataset.get("version"))

    _cached = (EntityDetector(dataset), now)
    return _cached[0]
