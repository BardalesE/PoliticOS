"""
Clasifica un texto político con Groq (Llama-8B).

Devuelve dict con:
  - sentiment: -1.0 a 1.0
  - emotion: miedo|enojo|esperanza|frustracion|alegria|neutral
  - topic: seguridad|economia|salud|educacion|...
  - mentions: ["james cueva","james"]
  - is_attack: bool
  - target_candidate: str | None
"""

import os, json, logging
from groq import Groq

log = logging.getLogger(__name__)
_client = None

def get_client():
    global _client
    if _client is None and os.getenv("GROQ_API_KEY"):
        _client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _client

# Aliases del candidato de ESTA instancia (un proceso de ingest por candidato).
# TARGET_CANDIDATES (legado) se acepta como fallback mientras existan .env viejos.
TARGET_ALIASES = [
    c.strip().lower()
    for c in (os.getenv("TARGET_ALIASES") or os.getenv("TARGET_CANDIDATES", "")).split(",")
    if c.strip()
]
if not TARGET_ALIASES:
    log.warning("TARGET_ALIASES env var not set — classification will match no candidates")

def classify(text: str) -> dict:
    """Clasificación rápida con Groq Llama-8B."""
    client = get_client()
    if not client:
        return _fallback_classify(text)

    candidates_str = ", ".join(TARGET_ALIASES)
    prompt = f"""Analiza este texto sobre política peruana. Responde SOLO JSON válido.

Texto: "{text[:1500]}"

Candidatos objetivo: {candidates_str}

JSON:
{{
  "sentiment": float -1.0 a 1.0,
  "emotion": "miedo"|"enojo"|"esperanza"|"frustracion"|"alegria"|"neutral",
  "topic": "seguridad"|"economia"|"salud"|"educacion"|"corrupcion"|"transporte"|"agricultura"|"otro",
  "mentions": ["nombres mencionados de la lista de candidatos"],
  "is_attack": boolean (si el texto ataca/critica a algún candidato),
  "target_candidate": "nombre del candidato atacado" o null,
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
        data = json.loads(r.choices[0].message.content)
        return data
    except Exception as e:
        log.warning(f"Groq classification failed: {e}")
        return _fallback_classify(text)

def _fallback_classify(text: str) -> dict:
    """Fallback heurístico sin LLM (cuando Groq no responde)."""
    text_low = text.lower()
    mentions = [c for c in TARGET_ALIASES if c in text_low]
    attack_keywords = ["corrupto", "ladrón", "mentiroso", "fracaso", "incompetente", "estafa"]
    is_attack = any(k in text_low for k in attack_keywords) and bool(mentions)
    return {
        "sentiment": -0.3 if is_attack else 0.0,
        "emotion": "enojo" if is_attack else "neutral",
        "topic": "otro",
        "mentions": mentions,
        "is_attack": is_attack,
        "target_candidate": mentions[0] if mentions and is_attack else None,
        "is_political": bool(mentions),
    }
