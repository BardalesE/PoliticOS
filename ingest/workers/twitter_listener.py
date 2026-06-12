"""
Worker de Twitter/X via API v2.

REQUIERE plan Basic ($200/mes mínimo desde 2023).
Si no tienes presupuesto, comenta esta tarea en app.py y usa solo RSS + YouTube.

Alternativa gratis (no oficial): Nitter scraping con Playwright.
Esa ruta vive en un módulo separado por si la quieres activar después.
"""

import os, logging
from datetime import datetime, timezone, timedelta
import tweepy
from celery import shared_task

from processors.classifier import classify
from .rss_scraper import _push_to_laravel, _mentions_candidate

log = logging.getLogger(__name__)

BEARER = os.getenv("TWITTER_BEARER_TOKEN")
# TARGET_KEYWORDS (por instancia) con fallback al nombre legado TWITTER_KEYWORDS
KEYWORDS = [
    k.strip()
    for k in (os.getenv("TARGET_KEYWORDS") or os.getenv("TWITTER_KEYWORDS", "")).split(",")
    if k.strip()
]

@shared_task(name="workers.twitter_listener.search_recent")
def search_recent():
    if not BEARER or not KEYWORDS:
        log.info("Twitter not configured, skipping")
        return {"tweets_pushed": 0}

    try:
        client = tweepy.Client(bearer_token=BEARER)
    except Exception as e:
        log.error(f"Tweepy init failed: {e}")
        return {"tweets_pushed": 0}

    pushed = 0

    for kw in KEYWORDS:
        query = f"({kw}) -is:retweet lang:es"
        try:
            r = client.search_recent_tweets(
                query=query,
                max_results=50,
                tweet_fields=["created_at","public_metrics","author_id","lang"],
                start_time=datetime.now(timezone.utc) - timedelta(hours=2),
            )
        except Exception as e:
            log.warning(f"Twitter search '{kw}' failed: {e}")
            continue

        if not r.data:
            continue

        signals_batch = []
        for tw in r.data:
            if not _mentions_candidate(tw.text):
                continue

            cls = classify(tw.text)
            metrics = tw.public_metrics or {}
            engagement = metrics.get("like_count", 0) + metrics.get("retweet_count", 0) * 2 + metrics.get("reply_count", 0)

            signals_batch.append({
                "source": "twitter",
                "source_url": f"https://twitter.com/i/web/status/{tw.id}",
                "source_name": "X / Twitter",
                "author": str(tw.author_id),
                "title": None,
                "content": tw.text[:5000],
                "mentions": cls.get("mentions", []),
                "sentiment": cls.get("sentiment"),
                "emotion": cls.get("emotion"),
                "topic": cls.get("topic"),
                "is_attack": bool(cls.get("is_attack", False)),
                "target_candidate": cls.get("target_candidate"),
                "engagement": engagement,
                "captured_at": tw.created_at.isoformat() if tw.created_at else datetime.now(timezone.utc).isoformat(),
            })

            if len(signals_batch) >= 50:
                pushed += _push_to_laravel(signals_batch)
                signals_batch = []

        if signals_batch:
            pushed += _push_to_laravel(signals_batch)

    return {"tweets_pushed": pushed}
