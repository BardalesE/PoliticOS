"""
Clasifica un texto político con Groq (Llama-8B).

El prompt es GENÉRICO: detecta cualquier político peruano mencionado, sin
lista de candidatos. La relativización ocurre después, en _normalize():
`mentions` conserva todos los políticos detectados (intel para el tenant) y
`is_attack` queda true solo si el atacado es el candidato de ESTA instancia
(matching contra TARGET_ALIASES, insensible a tildes y mayúsculas).

Devuelve dict con el shape del payload de señales:
  - sentiment: -1.0 a 1.0
  - emotion: miedo|enojo|esperanza|frustracion|alegria|neutral
  - topic: seguridad|economia|salud|educacion|...
  - mentions: ["keiko fujimori", "roberto sanchez", ...]  (cualquier político)
  - entities: [{type, slug, name}] — menciones canonicalizadas contra el
    diccionario JNE (Fase 6); permite agregar por rival/partido/región
  - is_attack: bool — ataque dirigido al candidato de esta instancia
  - target_candidate: str | None — político atacado (puede ser un rival)
  - is_political: bool
"""

import os, json, logging, unicodedata
from groq import Groq

from processors.entity_detector import get_detector

log = logging.getLogger(__name__)
_client = None

def get_client():
    global _client
    if _client is None and os.getenv("GROQ_API_KEY"):
        _client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _client

# Aliases del candidato de ESTA instancia (un proceso de ingest por candidato).
# TARGET_CANDIDATES (legado) se acepta como fallback mientras existan .env viejos.
# Ya no van al prompt — solo relativizan is_attack y alimentan el fallback heurístico.
TARGET_ALIASES = [
    c.strip().lower()
    for c in (os.getenv("TARGET_ALIASES") or os.getenv("TARGET_CANDIDATES", "")).split(",")
    if c.strip()
]
if not TARGET_ALIASES:
    log.warning("TARGET_ALIASES env var not set — is_attack nunca se marcará y el fallback no detectará menciones")

def _norm(s: str) -> str:
    """minúsculas + sin tildes, para comparar nombres de políticos."""
    s = unicodedata.normalize("NFKD", str(s).lower().strip())
    return "".join(c for c in s if not unicodedata.combining(c))

_NORM_ALIASES = [_norm(a) for a in TARGET_ALIASES]

def _is_own_candidate(name) -> bool:
    """¿`name` es el candidato de esta instancia? Substring en ambas direcciones:
    "keiko fujimori higuchi" matchea el alias "keiko fujimori" y viceversa."""
    if not name:
        return False
    n = _norm(name)
    return any(a in n or n in a for a in _NORM_ALIASES)

def classify(text: str) -> dict:
    """Clasificación rápida con Groq Llama-8B."""
    client = get_client()
    if not client:
        return _fallback_classify(text)

    prompt = f"""Analiza este texto sobre política peruana. Responde SOLO JSON válido.

Texto: "{text[:1500]}"

JSON:
{{
  "sentiment": float -1.0 a 1.0,
  "emotion": "miedo"|"enojo"|"esperanza"|"frustracion"|"alegria"|"neutral",
  "topic": "seguridad"|"economia"|"salud"|"educacion"|"corrupcion"|"transporte"|"agricultura"|"otro",
  "mentioned_politicians": ["políticos o partidos mencionados, con el nombre tal como aparece"],
  "is_attack": boolean (el texto ataca o critica a algún político),
  "target_politician": "nombre del político atacado" o null,
  "is_political": boolean
}}"""

    try:
        r = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        return _normalize(json.loads(r.choices[0].message.content), text)
    except Exception as e:
        log.warning(f"Groq classification failed: {e}")
        return _fallback_classify(text)

def _detect_entities(text: str, mentions: list) -> list:
    """Canonicaliza texto + menciones libres del LLM contra el diccionario JNE.
    "Keiko", "Fujimori" y "la lideresa de Fuerza Popular" colapsan al mismo
    slug si el diccionario los conoce."""
    try:
        combined = " . ".join([text or ""] + [str(m) for m in mentions if m])
        return get_detector().detect(combined)
    except Exception as e:
        log.warning(f"Entity detection failed: {e}")
        return []

def _normalize(data: dict, text: str = "") -> dict:
    """Adapta la salida genérica del LLM al shape del payload de señales
    (claves que Laravel valida) y relativiza is_attack a esta instancia."""
    target = data.get("target_politician") or data.get("target_candidate")
    mentions = data.get("mentioned_politicians") or data.get("mentions") or []
    if not isinstance(mentions, list):
        mentions = [mentions]
    mentions = [str(m).strip()[:80] for m in mentions if m][:20]

    return {
        "sentiment": data.get("sentiment"),
        "emotion": data.get("emotion"),
        "topic": data.get("topic"),
        "mentions": mentions,
        "entities": _detect_entities(text, mentions),
        # Solo cuenta como ataque si el blanco es NUESTRO candidato; un ataque
        # a un rival se guarda igual (mentions/target) pero no dispara alertas.
        "is_attack": bool(data.get("is_attack")) and _is_own_candidate(target),
        "target_candidate": str(target).strip()[:40] if target else None,  # max:40 en Laravel
        "is_political": bool(data.get("is_political")),
    }

def _fallback_classify(text: str) -> dict:
    """Fallback heurístico sin LLM (cuando Groq no responde). Detecta los
    aliases de la instancia + cualquier entidad del diccionario JNE; sin LLM
    no hay sentiment/emotion reales ni políticos fuera del diccionario."""
    text_low = text.lower()
    own_mentions = [c for c in TARGET_ALIASES if c in text_low]
    entities = _detect_entities(text, [])

    # mentions: aliases propios + nombres canónicos detectados (sin duplicar)
    mentions = list(own_mentions)
    for e in entities:
        if e["type"] in ("candidate", "party") and not any(_norm(e["name"]) == _norm(m) for m in mentions):
            mentions.append(e["name"])

    attack_keywords = ["corrupto", "ladrón", "mentiroso", "fracaso", "incompetente", "estafa"]
    # is_attack sigue relativizado al candidato propio (igual que con LLM)
    is_attack = any(k in text_low for k in attack_keywords) and bool(own_mentions)
    return {
        "sentiment": -0.3 if is_attack else 0.0,
        "emotion": "enojo" if is_attack else "neutral",
        "topic": "otro",
        "mentions": mentions[:20],
        "entities": entities,
        "is_attack": is_attack,
        "target_candidate": own_mentions[0] if own_mentions and is_attack else None,
        "is_political": bool(mentions),
    }
