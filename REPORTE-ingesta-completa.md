# REPORTE — Ingesta completa de documentos (Fases 1-3)

Rama: `feat/ingesta-completa-documentos` (sin merge a `main`, sin push).
18 commits, 60 archivos, ~4800 líneas. Resuelve el problema original: **un
plan de gobierno de 200+ páginas se analizaba en ~13%** porque
`PdfPageExtractor::MAX_CHARS=80000` truncaba el bucle de páginas y el RAG
solo veía 4 fragmentos de 1200 caracteres por turno.

---

## 1. Qué cambió, por fase

### Fase 1 — Ingesta completa (pipeline en cola, una vez por documento)

| Antes | Ahora |
|---|---|
| `MAX_CHARS=80000` cortaba la extracción a ~26 páginas | Extrae **todas** las páginas; tope de seguridad configurable (3M chars) |
| `QUEUE_CONNECTION=sync` — el job corría dentro del request HTTP | `QUEUE_CONNECTION=database` + worker real en `supervisord` |
| Sin chunking real (solo FULLTEXT de MySQL) | `DocumentChunker`: por sección (EJE/CAPÍTULO/mayúsculas) + fallback por tokens, cobertura total probada (ni una palabra de ninguna página se pierde) |
| Sin resumen ni FAQs | MAP (Groq `gpt-oss-20b`, 1 llamada/chunk) → REDUCE jerárquico (Groq `gpt-oss-120b`): índice, resumen ejecutivo, propuestas por eje/región (normalizadas contra ubigeo), 30-50 FAQs con página de origen obligatoria |
| Sin embeddings reales | `TextEmbedder`/`GeminiTextEmbedder` (`gemini-embedding-001`, dim. configurable, verificado contra la doc oficial de Google) — BLOB float32, similitud coseno en PHP, sin Qdrant |
| Documento "listo" en cuanto se extraía el texto | `is_public=true` / `analysis_status=listo` solo cuando MAP+REDUCE+embeddings terminan; reintento (`retry-analysis`) retoma sin re-pagar lo ya mapeado |

Tablas nuevas (tenant): `document_sections`, `document_analysis`,
`document_faqs`. Campos nuevos en `knowledge_documents`: `analysis_status`,
`analysis_progress`, `analysis_error`, `is_public` — **separados** de
`status`/`content` (que siguen gobernando el FULLTEXT de siempre; los dos
pipelines son independientes a propósito, para no bloquear el chat mientras
el análisis profundo corre en segundo plano).

Admin: barra de progreso + botón "Reprocesar" en `/admin/knowledge`.
Comando `php artisan knowledge:reingest` para los documentos ya truncados.

### Fase 2 — Consulta

- **Clasificador de intención** (`DeepAnalysisQueryService` +
  `VagueQuestionDetector`), solo cuando el candidato tiene documentos con
  `is_public=true`:
  - **vaga** ("resume el plan") → menú (resumen + índice), **sin LLM**.
  - **FAQ cercana** (coseno ≥ 0.85) → respuesta cacheada, **sin LLM**.
  - **específica** → `document_sections` por similitud + RAG léxico existente
    + `propuestas_por_region` si menciona una región, con presupuesto de
    **tokens** (no de conteo fijo).
- `MySQLFulltextEmbeddings`: `MAX_EXCERPTS`/`PAGES_PER_DOC`/`EXCERPT_CHARS`
  ahora leen de `config/ingest.php` (mismo default — cero cambio de
  comportamiento del RAG léxico de siempre).
- `CivicAIService::buildDocumentationSection`: tope de excerpt configurable
  (6000, antes 1200 fijo); se eliminó el recorte redundante en
  `formatDocsWithAttribution` que el audit marcó en la línea 1125 (y que de
  paso re-cortaba la hoja de vida a 1200 en modo PEPA).
- Integración en `CivicAIService` **aditiva**: si el candidato no tiene
  análisis profundo, el comportamiento es idéntico al de antes de la Fase 2
  (verificado contra `PepaResponseParsingTest`, `CitasPorPaginaTest`,
  `ChatBlindajeTest`, `ChatLimiteMensajesTest`). No se tocaron los prompts.
- `chat_messages.response_type` (`menu`/`faq`/`rag`) persistido y visible en
  `/admin/chat-sessions`.

### Fase 3 — Pruebas

- PDF sintético de 220 páginas con 11 ejes y 3 regiones, pasado por el
  pipeline **real** (sin mocks de extracción): cero truncamiento, cero
  huecos de página, ninguna palabra perdida.
- 429 de Groq → `release()` con el backoff real (no una excepción que tire
  el batch), con y sin header `Retry-After`; JSON inválido reintenta;
  agotar los reintentos se rinde vía `fail()`.
- Reintento parcial (2 de 3 chunks ya mapeados) solo re-despacha el pendiente.
- Aislamiento multi-tenant verificado a nivel de *query* (Fase 1) y de *job*
  (Fase 3): el mismo `document_id` en dos BDs de tenant nunca se mezcla.
- `php artisan knowledge:qa {document}`: corre 3 preguntas vagas + 4 FAQ
  reales + 3 específicas por región contra un documento ya analizado,
  imprime tipo/páginas citadas/si llamaría al LLM — gratis, no gasta tokens.

---

## 2. Tests

**91 tests nuevos** (unit + feature; Groq y Gemini mockeados con
`Http::fake()` en todos salvo el comando de QA, que no llama a ningún
proveedor). Suite completa del proyecto: **354 passed, 9 failed, 1 skipped**.

Los 9 que fallan son **exactamente los mismos que ya fallaban en `main` sin
ninguno de estos cambios** (verificado con `git checkout main` + re-run):
`SiteVisitTest` (7, piden una tabla `site_counters` en la BD `central` que
el test no crea), `AiProviderFailoverTest::test_401...` (depende de una
`ANTHROPIC_API_KEY` real que no existe en este entorno local) y un caso de
`CitasPorPaginaTest` sobre el fallback LIKE en SQLite. Ninguno tiene relación
con la ingesta de documentos.

---

## 3. Variables de entorno nuevas

Todas con default seguro (nada rompe si no se definen). **No pude editar
`.env.example`** (bloqueado por permisos del entorno de desarrollo) —
agregar esto a mano:

```env
# Cola (ya no sync)
QUEUE_CONNECTION=database

# Extracción / chunking (Fase 1)
INGEST_MAX_CHARS=3000000
INGEST_CHUNK_FALLBACK_TOKENS=1500
INGEST_CHUNK_OVERLAP_TOKENS=200
INGEST_CHARS_PER_TOKEN=4

# MAP (Groq, modelo chico)
INGEST_MAP_MODEL=openai/gpt-oss-20b
INGEST_MAP_RPM=25
INGEST_MAP_TPM=18000
INGEST_MAP_MAX_RETRIES=5

# REDUCE (Groq, modelo grande)
INGEST_REDUCE_MODEL=openai/gpt-oss-120b
INGEST_REDUCE_MIN_FAQS=30
INGEST_REDUCE_MAX_FAQS=50

# Embeddings (Gemini — GEMINI_API_KEY ya existía)
INGEST_EMBEDDINGS_DRIVER=gemini
INGEST_EMBEDDINGS_MODEL=gemini-embedding-001
INGEST_EMBEDDINGS_DIM=768
INGEST_EMBEDDINGS_BATCH_SIZE=10
INGEST_EMBEDDINGS_MAX_RETRIES=5

# Consulta (Fase 2)
INGEST_QUERY_MAX_EXCERPTS=4
INGEST_QUERY_PAGES_PER_DOC=2
INGEST_QUERY_EXCERPT_CHARS=1200
INGEST_QUERY_EXCERPT_CHAR_CAP=6000
INGEST_QUERY_HV_EXCERPT_CHAR_CAP=3600
INGEST_QUERY_CONTEXT_TOKENS=6000
INGEST_FAQ_SIMILARITY_THRESHOLD=0.85
INGEST_RAG_TOP_K=6
```

---

## 4. Despliegue en Render

1. **`render.yaml` y `deploy/render/supervisord.conf` ya están actualizados**
   en esta rama (`QUEUE_CONNECTION=database` + proceso `queue-worker`). Un
   deploy normal de esta rama/PR ya lo aplica — no hay paso manual.
2. **Migraciones**: el `entrypoint.sh` ya corre `migrate --force` +
   `tenant:migrate --force` en cada arranque (sin cambios aquí) — las tablas
   nuevas (`document_sections`, `document_analysis`, `document_faqs`,
   `chat_messages.response_type`, campos `analysis_*`/`is_public`) se aplican
   solas a `central` + a cada tenant registrado.
3. **`GEMINI_API_KEY`**: ya existe como variable declarada en `render.yaml`
   (`sync: false`) — confirmar que tiene un valor real pegado en el
   dashboard de Render (si no, los embeddings fallan silenciosamente y el
   RAG cae a solo-léxico, degradado pero no roto).
4. **Documentos ya subidos (truncados a 80k)**: variable de entorno nueva en
   el entrypoint, mismo patrón que `PAGES_BACKFILL_TENANTS`:
   ```
   REINGEST_TENANTS=<slug>        # re-encola los que parecen truncados
   REINGEST_ALL=true              # opcional: fuerza TODOS los PDF activos
   ```
   Solo encola — el trabajo real lo hace el `queue-worker`. Borrar
   `REINGEST_TENANTS` después del primer deploy que la use.
5. **Recomendado antes de activar para todos los tenants**: correr
   `knowledge:reingest` contra **un solo documento de prueba** primero
   (`--limit=1` o apuntando el `--min-chars` a ese documento específico) para
   confirmar que las keys de Groq/Gemini funcionan en producción antes de
   soltarlo sobre toda la base de documentos — nada de esto se probó contra
   las APIs reales, solo contra mocks (`Http::fake()`).

---

## 5. Tiempo y tokens estimados — plan de 200 páginas

Estimación, no medición real (sin cuenta de Groq/Gemini a mano en esta
sesión). Con texto denso típico de un plan de gobierno peruano (~1800-2500
caracteres/página):

| Etapa | Llamadas | Tokens aprox. | Tiempo aprox. |
|---|---|---|---|
| Extracción + chunking | 0 (sin LLM) | — | segundos |
| **MAP** (Groq `gpt-oss-20b`) | ~150-250 chunks | ~400k-500k tokens | **20-30 min** — acotado por el throttle de 18k TPM/25 RPM del tier gratis, no por la latencia de red |
| **REDUCE** (Groq `gpt-oss-120b`) | ~10-15 llamadas (por eje + global) | ~40k-50k tokens | 1-3 min |
| **Embeddings** (Gemini) | ~25 lotes (chunks + FAQs, batch=10) | — (no se cobra como "tokens" de chat) | 1-3 min, más si el tier gratis devuelve 429 (reportado por Google como errático incluso bajo cuota — mitigado con backoff, nunca bloquea indefinidamente) |
| **Total** | | | **~25-35 minutos** por documento, $0 en los tiers gratis (solo tiempo, no costo) |

El cuello de botella es `INGEST_MAP_TPM=18000` (conservador a propósito para
no agotar el tier gratis de Groq). Si se paga un tier superior, subir
`INGEST_MAP_RPM`/`INGEST_MAP_TPM` reduce el tiempo de MAP casi
proporcionalmente (es el 80-90% del tiempo total).

---

## 6. Problemas conocidos / deuda

- **Nada de esto corrió contra las APIs reales de Groq/Gemini** — toda la
  suite usa `Http::fake()`. Antes de confiar el pipeline a producción,
  correr `knowledge:reingest` contra un documento de prueba y revisar
  `storage/logs/laravel.log` (los warnings de `GroqRateLimitException`/
  `DeepAnalysisQueryService: embed falló` son esperables bajo el tier
  gratis, pero deberían ser la excepción, no la norma).
- **`GroqThrottler` usa el `CACHE_STORE` configurado** como ventana
  deslizante compartida entre jobs del mismo worker. Con `CACHE_STORE=file`
  (como en `render.yaml`) y un solo proceso `queue-worker` (configuración
  actual) esto es correcto; si en el futuro se escalan varios workers en
  paralelo, hay que mover el throttle a un store realmente compartido
  (Redis) — con `file` en varios procesos del mismo filesystem también
  funciona, pero no se probó esa combinación.
- **Latencia nueva por mensaje de chat**: cuando un candidato tiene análisis
  profundo, cada mensaje no-vago llama a Gemini para embeber la pregunta
  (FAQ + RAG semántico) antes de construir el prompt — un round-trip de red
  adicional que antes no existía. Degrada con gracia si Gemini falla (sigue
  con el RAG léxico de siempre), pero añade latencia real en el camino feliz.
- **Detección de región** (`propuestas_por_region`) es un `str_contains`
  sobre texto sin tildes/mayúsculas — puede dar falsos positivos/negativos
  con nombres de lugar parecidos o ambiguos (p. ej. un distrito y una
  provincia con el mismo nombre). Suficiente para el caso de uso, no es NLU real.
- **Una hoja de vida también puede quedar `is_public=true`** (Phase 1 no
  distingue tipo de documento al decidir qué analizar en profundidad). El
  menú de la Fase 2 la filtra explícitamente (no tiene sentido un "resumen
  ejecutivo" de un CV), pero sus FAQs sí pueden aparecer si matchean por
  coseno — es intencional y de bajo riesgo (pasan por `SensitiveData::redact`
  igual que cualquier otro texto), pero vale la pena saberlo.
- **Deuda ya existente, sin relación con este trabajo** (mencionada en
  CLAUDE.md): validar `database/data/jne_entities_2026.json` contra el
  padrón oficial JNE/Infogob antes de producción.
- **Archivos pre-existentes sin tocar**, listados por el usuario como
  propios: `PLAN_MVP_MUNICIPAL.md`, `prompt-pepa-v4.md`, `tenantSlug` — no
  se movieron ni se incluyeron en ningún commit.
