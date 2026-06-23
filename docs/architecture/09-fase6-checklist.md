# Fase 6 — Detección canónica de entidades JNE · Checklist de verificación

Estado: ✅ implementada (2026-06-12). Push→pull invertido respecto al roadmap
original (ver `04-roadmap.md`, sección Fase 6).

## Qué hace
Las menciones del LLM son strings libres ("Keiko", "la lideresa de Fuerza
Popular"). Esta fase las canonicaliza a slugs JNE estables para que la
inteligencia electoral agregue por rival/partido/región.

```
Laravel  GET /api/ingest/entities  (diccionario global, X-Ingest-Key)
   │
   ▼  beat diario 04:30 + worker_ready (boot)
workers.entities_sync.sync_entities  →  Redis de la instancia (politicos:entities)
   │
   ▼  processors.entity_detector.get_detector()  (Redis > bundled fallback)
classifier.classify()  →  payload.entities = [{type, slug, name}]
   │
   ▼  workers.* push  →  Laravel POST /api/admin/external-signals/ingest
external_signals.entities  (columna JSON nullable)
```

## Criterio de "done"
- [x] ≥80% de candidatos presidenciales 2026 detectados sin `TARGET_CANDIDATES`.
      Medido hoy: **16/16 = 100%** en titulares de prensa realistas.
      `ingest/tests/test_entity_detector.py::test_detects_at_least_80_percent_of_candidates`

## Tests (35 en total)
```bash
# Python (24) — desde ingest/
pip install -r requirements-dev.txt
python -m pytest tests/ -v

# Laravel (11) — desde la raíz
php artisan test --filter="IngestEntityTest|ExternalSignalEntitiesTest"
```
- `test_entity_detector.py` (15): matching sin tildes/case/word-boundary, aliases-sigla, criterio 80%, partidos, 27 distritos.
- `test_classifier_entities.py` (5): fallback sin LLM canonicaliza rivales; `is_attack` sigue relativo al candidato propio.
- `test_entities_sync_integration.py` (4): flujo pull completo con fakeredis (sync→Redis→detector), preferencia Redis>bundled, skips.
- `IngestEntityTest.php` (3): endpoint + auth `ingest_key`.
- `ExternalSignalEntitiesTest.php` (6): validación de `entities` + cast + retrocompat.

## Verificación en la instancia camilo
La instancia ya tiene todo lo necesario en `ingest/instances/camilo.env`
(no hay env vars nuevas): `INGEST_KEY`, `LARAVEL_API_URL`, `REDIS_URL`.

Con Docker (cuando esté disponible en el host):
```bash
cd ingest && docker compose -f docker-compose.instance.yml --env-file instances/camilo.env up
# Al boot, worker_ready dispara sync_entities → revisar logs:
#   "Entity dataset synced (version N, M candidatos, K partidos)"
# Forzar sync manual:
docker compose ... exec worker celery -A app.celery_app call workers.entities_sync.sync_entities
```

Sin Docker (Python local con el .env de la instancia):
```bash
cd ingest
# 1) Laravel sirviendo en localhost:8000 con INGEST_KEY igual al del .env
# 2) Redis local en localhost:6379
celery -A app.celery_app worker --beat --loglevel=info
```

## Pendiente / deuda
- [ ] **Validar `database/data/jne_entities_2026.json` contra el padrón oficial
      JNE/Infogob** antes de producción. La lista nace de conocimiento general
      (cutoff ene-2026); regenerar la copia bundled tras editarla:
      `cp database/data/jne_entities_2026.json ingest/data/jne_entities_2026.json`
- [ ] Cola larga municipal/regional (4-oct-2026) no seedeada — queda al LLM.
- [ ] Bug latente pre-existente (no de Fase 6): `CheckPlanFeature` hace
      `app('tenant')`, que lanza con binding `null` en vez de devolver null.
      No afecta prod (siempre resuelve tenant real). Si algún día una ruta con
      `plan_feature` corre sin tenant, fallará con 500.
- [ ] Explotar `entities` en `IntelligenceService` (agregación por rival/
      partido/región) — fuera del alcance de Fase 6, habilitado por ella.
