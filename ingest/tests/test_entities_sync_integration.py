"""
Integración del flujo pull (Fase 6, bloque 3+6) sin Redis ni Laravel reales:

  GET /api/ingest/entities (mock httpx)
    → workers.entities_sync.sync_entities escribe en Redis (fakeredis)
    → processors.entity_detector lee de Redis y canonicaliza

Simula lo que hace la instancia camilo al arrancar (worker_ready → sync) y al
clasificar después. Verifica además la preferencia Redis > bundled y el
fallback cuando Redis está vacío.
"""

import json
import sys
from pathlib import Path
from unittest import mock

import fakeredis

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from processors import entity_detector
from processors.entity_detector import REDIS_ENTITIES_KEY, load_bundled


def _patch_redis(monkeypatch_targets, server):
    """Hace que redis.Redis.from_url(...) devuelva siempre el mismo fake."""
    fake = fakeredis.FakeStrictRedis(server=server, decode_responses=False)
    return mock.patch("redis.Redis.from_url", return_value=fake)


def _reset_detector_cache():
    entity_detector._cached = None


def test_sync_then_detect_from_redis():
    server = fakeredis.FakeServer()
    bundled = load_bundled()

    # El "Laravel" devuelve un dataset con una versión distinta a la bundled,
    # para probar que el detector realmente usó el de Redis.
    served = json.loads(json.dumps(bundled))
    served["version"] = 999

    fake_resp = mock.Mock(status_code=200)
    fake_resp.json.return_value = served

    with _patch_redis(None, server):
        with mock.patch("httpx.get", return_value=fake_resp) as httpx_get:
            # entities_sync importa httpx y redis a nivel de módulo; lo recargamos
            # bajo los patches activos.
            import importlib
            from workers import entities_sync
            importlib.reload(entities_sync)
            entities_sync.INGEST_KEY = "test-key"

            result = entities_sync.sync_entities()
            assert result == {"synced": True, "version": 999}
            httpx_get.assert_called_once()

        # Ahora el detector debe leer de Redis (versión 999), no del bundled.
        _reset_detector_cache()
        detector = entity_detector.get_detector()
        assert detector.version == 999

        slugs = {e["slug"] for e in detector.detect("Keiko Fujimori en Arequipa")}
        assert "keiko-fujimori" in slugs
        assert "arequipa" in slugs

    _reset_detector_cache()


def test_detector_falls_back_to_bundled_when_redis_empty():
    server = fakeredis.FakeServer()  # vacío, nunca se hace sync
    with _patch_redis(None, server):
        _reset_detector_cache()
        detector = entity_detector.get_detector()
        # Cae al bundled (versión real del dataset, no 999)
        assert detector.version == load_bundled()["version"]
        assert "keiko-fujimori" in {e["slug"] for e in detector.detect("Keiko Fujimori")}
    _reset_detector_cache()


def test_sync_skips_when_no_ingest_key():
    import importlib
    from workers import entities_sync
    importlib.reload(entities_sync)
    entities_sync.INGEST_KEY = ""
    result = entities_sync.sync_entities()
    assert result["synced"] is False
    assert result["reason"] == "no_ingest_key"


def test_sync_preserves_cache_on_empty_payload():
    server = fakeredis.FakeServer()
    fake_resp = mock.Mock(status_code=200)
    fake_resp.json.return_value = {"version": 5, "candidates": []}  # sin candidatos

    with _patch_redis(None, server):
        import importlib
        from workers import entities_sync
        importlib.reload(entities_sync)
        entities_sync.INGEST_KEY = "test-key"
        with mock.patch("httpx.get", return_value=fake_resp):
            result = entities_sync.sync_entities()
    assert result["synced"] is False
    assert result["reason"] == "empty_payload"
