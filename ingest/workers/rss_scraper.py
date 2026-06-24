"""
Worker de scrapeo de RSS de medios peruanos.

Fuentes default (gratis):
  - RPP, El Comercio, La República, Gestión, Perú21

Cada feed cada 30 min (configurable en celery beat).
Filtra por menciones de los candidatos objetivo.
Clasifica con Groq y postea al backend Laravel.
"""

import os, logging, hashlib
from datetime import datetime, timedelta
import feedparser
import httpx
from celery import shared_task

from processors.classifier import classify

log = logging.getLogger(__name__)

LARAVEL_API = os.getenv("LARAVEL_API_URL", "http://localhost:8000/api")
INGEST_KEY = os.getenv("INGEST_KEY", "")
RSS_FEEDS = [u.strip() for u in os.getenv("RSS_FEEDS", "").split(",") if u.strip()]

# Instancia por candidato: UN solo tenant destino (config generada por
# `php artisan tenant:ingest-config <slug>`). TENANT_SLUGS (lista, legado)
# se acepta como fallback tomando el primer slug — el push ya no replica.
_legacy_slugs = [s.strip() for s in os.getenv("TENANT_SLUGS", "").split(",") if s.strip()]
TENANT_SLUG = os.getenv("TENANT_SLUG", "").strip() or (_legacy_slugs[0] if _legacy_slugs else "")
if len(_legacy_slugs) > 1:
    log.warning(
        "TENANT_SLUGS con múltiples slugs ya no se soporta — usando solo '%s'. "
        "Levanta una instancia de ingest por candidato.", TENANT_SLUG
    )

# Aliases del candidato de ESTA instancia. TARGET_CANDIDATES (legado) se
# acepta como fallback mientras existan .env viejos.
TARGET_ALIASES = [
    c.strip().lower()
    for c in (os.getenv("TARGET_ALIASES") or os.getenv("TARGET_CANDIDATES", "")).split(",")
    if c.strip()
]
if not TARGET_ALIASES:
    log.warning("TARGET_ALIASES env var not set — no candidate filter will be applied")

# Filtro: solo procesar items cuyo título/summary mencione al candidato
def _mentions_candidate(text: str) -> bool:
    text_low = text.lower()
    return any(c in text_low for c in TARGET_ALIASES)

@shared_task(name="workers.rss_scraper.scrape_all_feeds")
def scrape_all_feeds():
    if not RSS_FEEDS:
        log.warning("No RSS_FEEDS configured, skipping")
        return {"feeds_processed": 0, "signals_pushed": 0}
    if not TARGET_ALIASES:
        log.warning("TARGET_ALIASES not configured — all articles will be skipped")
        return {"feeds_processed": 0, "signals_pushed": 0}

    total_pushed = 0
    cutoff = datetime.now() - timedelta(hours=24)

    for feed_url in RSS_FEEDS:
        try:
            log.info(f"Fetching feed: {feed_url}")
            feed = feedparser.parse(feed_url)
            source_name = (feed.feed.get("title") or feed_url).strip()

            for entry in feed.entries[:50]:  # máx 50 por feed
                title = entry.get("title", "")
                summary = entry.get("summary", entry.get("description", ""))
                url = entry.get("link", "")

                # Filtrar: ¿menciona candidato objetivo?
                combined = f"{title} {summary}"
                if not _mentions_candidate(combined):
                    continue

                # Filtrar por fecha
                try:
                    published = datetime(*entry.published_parsed[:6])
                    if published < cutoff:
                        continue
                except Exception:
                    published = datetime.now()

                # Clasificar
                cls = classify(combined)
                if not cls.get("is_political"):
                    continue

                signal = {
                    "source": "news",
                    "source_url": url,
                    "source_name": source_name,
                    "author": entry.get("author"),
                    "title": title[:500],
                    "content": (summary or title)[:5000],
                    "mentions": cls.get("mentions", []),
                    "entities": cls.get("entities", []),
                    "sentiment": cls.get("sentiment"),
                    "emotion": cls.get("emotion"),
                    "topic": cls.get("topic"),
                    "is_attack": bool(cls.get("is_attack", False)),
                    "target_candidate": cls.get("target_candidate"),
                    "engagement": 0,
                    "captured_at": published.isoformat(),
                }

                pushed = _push_to_laravel([signal])
                total_pushed += pushed

        except Exception as e:
            log.exception(f"Failed processing feed {feed_url}: {e}")

    return {"feeds_processed": len(RSS_FEEDS), "signals_pushed": total_pushed}


def _push_to_laravel(signals: list) -> int:
    """POST al backend del tenant de esta instancia."""
    if not signals:
        return 0
    if not INGEST_KEY:
        log.warning("INGEST_KEY not set, skipping push")
        return 0

    headers = {
        "X-Ingest-Key": INGEST_KEY,
        "Content-Type": "application/json",
    }
    if TENANT_SLUG:
        headers["X-Tenant"] = TENANT_SLUG

    try:
        r = httpx.post(
            f"{LARAVEL_API}/admin/external-signals/ingest",
            json={"signals": signals},
            headers=headers,
            timeout=30,
        )
        if r.status_code in (200, 201):
            return r.json().get("ingested", 0)
        log.warning(f"Push failed [{TENANT_SLUG}]: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log.warning(f"Push exception [{TENANT_SLUG}]: {e}")

    return 0
