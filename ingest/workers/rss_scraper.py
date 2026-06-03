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
LARAVEL_TOKEN = os.getenv("LARAVEL_ADMIN_TOKEN", "")
TENANT_SLUGS = [s.strip() for s in os.getenv("TENANT_SLUGS", "").split(",") if s.strip()]
RSS_FEEDS = [u.strip() for u in os.getenv("RSS_FEEDS", "").split(",") if u.strip()]
TARGET_CANDIDATES = [c.strip().lower() for c in os.getenv("TARGET_CANDIDATES", "").split(",") if c.strip()]
if not TARGET_CANDIDATES:
    log.warning("TARGET_CANDIDATES env var not set — no candidate filter will be applied")

# Filtro: solo procesar items cuyo título/summary mencione algún candidato
def _mentions_candidate(text: str) -> bool:
    text_low = text.lower()
    return any(c in text_low for c in TARGET_CANDIDATES)

@shared_task(name="workers.rss_scraper.scrape_all_feeds")
def scrape_all_feeds():
    if not RSS_FEEDS:
        log.warning("No RSS_FEEDS configured, skipping")
        return {"feeds_processed": 0, "signals_pushed": 0}
    if not TARGET_CANDIDATES:
        log.warning("TARGET_CANDIDATES not configured — all articles will be skipped")
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
    """POST al backend. Si hay multi-tenant, replica a cada slug."""
    if not signals:
        return 0
    if not LARAVEL_TOKEN:
        log.warning("LARAVEL_ADMIN_TOKEN not set, skipping push")
        return 0

    total = 0
    targets = TENANT_SLUGS if TENANT_SLUGS else [None]

    for slug in targets:
        try:
            headers = {
                "Authorization": f"Bearer {LARAVEL_TOKEN}",
                "Content-Type": "application/json",
            }
            if slug:
                headers["X-Tenant"] = slug

            r = httpx.post(
                f"{LARAVEL_API}/admin/external-signals/ingest",
                json={"signals": signals},
                headers=headers,
                timeout=30,
            )
            if r.status_code in (200, 201):
                total += r.json().get("ingested", 0)
            else:
                log.warning(f"Push failed [{slug}]: {r.status_code} {r.text[:200]}")
        except Exception as e:
            log.warning(f"Push exception [{slug}]: {e}")

    return total
