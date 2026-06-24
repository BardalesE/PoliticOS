"""
Sync pull del diccionario de entidades JNE (Fase 6).

El roadmap original planteaba un POST /entities/sync hacia el ingest, pero
tras 1B las instancias por candidato corren solo redis + worker + beat (sin
FastAPI), así que nadie escucharía ese POST. En su lugar: esta task pullea
GET /api/ingest/entities de Laravel (misma X-Ingest-Key que el push de
señales) y cachea el JSON en el Redis propio de la instancia, de donde lo
lee processors.entity_detector (con fallback a la copia bundled).

Programación: diaria via beat + una vez al arranque del worker.
"""

import json
import logging
import os

import httpx
import redis
from celery import shared_task
from celery.signals import worker_ready

from processors.entity_detector import REDIS_ENTITIES_KEY

log = logging.getLogger(__name__)

LARAVEL_API = os.getenv("LARAVEL_API_URL", "http://localhost:8000/api")
INGEST_KEY = os.getenv("INGEST_KEY", "")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


@shared_task(name="workers.entities_sync.sync_entities")
def sync_entities():
    if not INGEST_KEY:
        log.warning("INGEST_KEY not set — entity sync skipped (detector usará el bundled)")
        return {"synced": False, "reason": "no_ingest_key"}

    try:
        r = httpx.get(
            f"{LARAVEL_API}/ingest/entities",
            headers={"X-Ingest-Key": INGEST_KEY},
            timeout=30,
        )
    except Exception as e:
        log.warning(f"Entity sync failed (network): {e}")
        return {"synced": False, "reason": "network"}

    if r.status_code != 200:
        log.warning(f"Entity sync failed: {r.status_code} {r.text[:200]}")
        return {"synced": False, "reason": f"http_{r.status_code}"}

    data = r.json()
    # Sanity: no pisar el cache con una respuesta vacía o con otro shape.
    if not isinstance(data, dict) or not data.get("candidates"):
        log.warning("Entity sync: respuesta sin candidates — se conserva el cache anterior")
        return {"synced": False, "reason": "empty_payload"}

    redis.Redis.from_url(REDIS_URL).set(
        REDIS_ENTITIES_KEY, json.dumps(data, ensure_ascii=False)
    )
    log.info("Entity dataset synced (version %s, %d candidatos, %d partidos)",
             data.get("version"), len(data.get("candidates", [])), len(data.get("parties", [])))
    return {"synced": True, "version": data.get("version")}


@worker_ready.connect
def _sync_on_boot(sender, **kwargs):
    """Al arrancar el worker: sync inmediato para no esperar al beat diario."""
    sender.app.send_task("workers.entities_sync.sync_entities")
