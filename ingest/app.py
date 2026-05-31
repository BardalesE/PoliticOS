"""
PoliticOS Ingest Service — FastAPI

Servicio Python que:
  1. Scrapea fuentes externas (RSS, YouTube, Twitter) en jobs periódicos.
  2. Clasifica con Groq (sentiment, emotion, is_attack, target_candidate).
  3. Envía los resultados al backend Laravel via /api/admin/external-signals/ingest.
  4. Indexa documentos largos en Qdrant para RAG (cuando Laravel use driver=qdrant).

Endpoints:
  GET  /health
  POST /ingest/now        → dispara todos los workers de inmediato
  POST /qdrant/index      → indexa un texto en Qdrant
  POST /qdrant/search     → búsqueda semántica (testing)

Workers programados (celery beat):
  - rss_scraper           cada 30 min
  - youtube_comments      cada 1 hora
  - twitter_listener      cada 30 min
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from celery import Celery
from celery.schedules import crontab
import os, logging
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# ─── Celery app ────────────────────────────────────────────────────
celery_app = Celery(
    "politicos_ingest",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "workers.rss_scraper",
        "workers.youtube_comments",
        "workers.twitter_listener",
    ],
)

celery_app.conf.update(
    timezone="America/Lima",
    enable_utc=False,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "rss-scrape-30min": {
            "task": "workers.rss_scraper.scrape_all_feeds",
            "schedule": crontab(minute="*/30"),
        },
        "youtube-comments-1h": {
            "task": "workers.youtube_comments.fetch_all_channels",
            "schedule": crontab(minute=15),
        },
        "twitter-listener-30min": {
            "task": "workers.twitter_listener.search_recent",
            "schedule": crontab(minute="*/30"),
        },
    },
)

# ─── FastAPI ───────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("PoliticOS Ingest Service starting...")
    yield
    log.info("Shutting down.")

app = FastAPI(title="PoliticOS Ingest", version="2.0", lifespan=lifespan)

@app.get("/health")
def health():
    return {"status": "ok", "service": "politicos-ingest"}

class IngestRequest(BaseModel):
    sources: list[str] = ["rss", "youtube", "twitter"]

@app.post("/ingest/now")
def ingest_now(req: IngestRequest):
    """Dispara workers manualmente (útil para testing y carga inicial)."""
    triggered = []
    if "rss" in req.sources:
        celery_app.send_task("workers.rss_scraper.scrape_all_feeds")
        triggered.append("rss")
    if "youtube" in req.sources:
        celery_app.send_task("workers.youtube_comments.fetch_all_channels")
        triggered.append("youtube")
    if "twitter" in req.sources:
        celery_app.send_task("workers.twitter_listener.search_recent")
        triggered.append("twitter")
    return {"triggered": triggered}

class QdrantIndexReq(BaseModel):
    collection: str
    document_id: int
    content: str
    metadata: dict = {}

@app.post("/qdrant/index")
def qdrant_index(req: QdrantIndexReq):
    from processors.embedder import index_document
    try:
        n = index_document(req.collection, req.document_id, req.content, req.metadata)
        return {"chunks_indexed": n}
    except Exception as e:
        raise HTTPException(500, str(e))

class QdrantSearchReq(BaseModel):
    collection: str
    query: str
    top_k: int = 5
    filter: dict = {}

@app.post("/qdrant/search")
def qdrant_search(req: QdrantSearchReq):
    from processors.embedder import search_documents
    try:
        results = search_documents(req.collection, req.query, req.top_k, req.filter)
        return {"results": results}
    except Exception as e:
        raise HTTPException(500, str(e))
