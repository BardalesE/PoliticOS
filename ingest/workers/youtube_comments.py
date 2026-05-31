"""
Worker de YouTube comments via Data API v3.

Cuota: 10,000 unidades/día gratis. Cada video.commentThreads.list = 1 unidad.
Si YOUTUBE_CHANNELS está vacío, busca por keywords de los candidatos.
"""

import os, logging
from datetime import datetime, timezone, timedelta
from googleapiclient.discovery import build
from celery import shared_task

from processors.classifier import classify
from .rss_scraper import _push_to_laravel, _mentions_candidate

log = logging.getLogger(__name__)

API_KEY = os.getenv("YOUTUBE_API_KEY")
CHANNELS = [c.strip() for c in os.getenv("YOUTUBE_CHANNELS", "").split(",") if c.strip()]
SEARCH_KEYWORDS = os.getenv("TWITTER_KEYWORDS", "")  # reusa lista

@shared_task(name="workers.youtube_comments.fetch_all_channels")
def fetch_all_channels():
    if not API_KEY:
        log.warning("YOUTUBE_API_KEY not set")
        return {"comments_pushed": 0}

    try:
        yt = build("youtube", "v3", developerKey=API_KEY)
    except Exception as e:
        log.error(f"YouTube client init failed: {e}")
        return {"comments_pushed": 0}

    pushed = 0

    # Si hay canales específicos: traer sus videos recientes
    video_ids = []
    if CHANNELS:
        for ch_id in CHANNELS:
            try:
                r = yt.search().list(
                    part="id", channelId=ch_id, type="video",
                    order="date", maxResults=5
                ).execute()
                video_ids.extend([item["id"]["videoId"] for item in r.get("items", [])])
            except Exception as e:
                log.warning(f"Channel {ch_id} fetch failed: {e}")
    else:
        # Búsqueda por keywords
        keywords = SEARCH_KEYWORDS.split(",")[0] if SEARCH_KEYWORDS else "elecciones peru 2026"
        try:
            r = yt.search().list(
                part="id", q=keywords, type="video",
                order="date", maxResults=10,
                publishedAfter=(datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
            ).execute()
            video_ids = [item["id"]["videoId"] for item in r.get("items", [])]
        except Exception as e:
            log.warning(f"YT search failed: {e}")

    log.info(f"Got {len(video_ids)} videos to scan for comments")

    signals_batch = []
    for vid in video_ids[:20]:
        try:
            comments_r = yt.commentThreads().list(
                part="snippet", videoId=vid, maxResults=30, order="relevance"
            ).execute()
        except Exception as e:
            log.warning(f"Comments fetch for {vid} failed: {e}")
            continue

        for item in comments_r.get("items", []):
            snippet = item["snippet"]["topLevelComment"]["snippet"]
            text = snippet.get("textDisplay", "")
            author = snippet.get("authorDisplayName", "")
            likes = int(snippet.get("likeCount", 0))
            published = snippet.get("publishedAt")

            if not _mentions_candidate(text):
                continue

            cls = classify(text)
            signals_batch.append({
                "source": "youtube_comment",
                "source_url": f"https://www.youtube.com/watch?v={vid}",
                "source_name": "YouTube",
                "author": author,
                "title": None,
                "content": text[:5000],
                "mentions": cls.get("mentions", []),
                "sentiment": cls.get("sentiment"),
                "emotion": cls.get("emotion"),
                "topic": cls.get("topic"),
                "is_attack": bool(cls.get("is_attack", False)),
                "target_candidate": cls.get("target_candidate"),
                "engagement": likes,
                "captured_at": published or datetime.now(timezone.utc).isoformat(),
            })

            if len(signals_batch) >= 30:
                pushed += _push_to_laravel(signals_batch)
                signals_batch = []

    if signals_batch:
        pushed += _push_to_laravel(signals_batch)

    return {"videos_scanned": len(video_ids), "comments_pushed": pushed}
