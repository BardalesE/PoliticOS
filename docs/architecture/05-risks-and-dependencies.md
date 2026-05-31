# 05 — Riesgos y Dependencias

---

## 1. Riesgos técnicos

### RT-01 — `TARGET_CANDIDATES` hardcodeado en ingest Python
**Severidad**: ALTA | **Probabilidad**: Certeza (ya existe)

El valor default `"james cueva,james,cueva"` en `ingest/processors/classifier.py:25` y `ingest/workers/rss_scraper.py:26` hace que el clasificador **ignore artículos sobre Keiko, Roberto Sánchez o cualquier otro candidato** si `TARGET_CANDIDATES` no está configurado en `.env`.

En producción con un tenant Keiko o JP, el pipeline de inteligencia electoral estaría ciego a las noticias de ese candidato a menos que alguien configure manualmente el env del servicio Python.

**Mitigación**: Fase 1 del roadmap — eliminar `TARGET_CANDIDATES` del prompt y del filtro; detectar cualquier contenido político.

---

### RT-02 — `CandidateProfile::query()->firstOrFail()` en JamesAIService
**Severidad**: ALTA | **Probabilidad**: Se activa si el tenant no tiene ningún perfil

`app/Services/JamesAIService.php:45` asume que siempre existe exactamente un `CandidateProfile` en la DB del tenant. Si:
- El tenant es PEPA puro (sin candidato específico), `firstOrFail()` lanza 500.
- El tenant tiene múltiples perfiles (futuro multi-candidato), toma el primero arbitrariamente.

**Mitigación**: Fase 2 — cambiar por inyección de dependencia o un `CandidateProfile|null` con fallback a modo PEPA genérico.

---

### RT-03 — Colección Qdrant no aislada por tenant en Python
**Severidad**: MEDIA | **Probabilidad**: Baja (solo si se usa Qdrant desde Python)

`ingest/processors/embedder.py` usa la colección recibida en el request (`req.collection`). Si dos tenants llaman a `POST /qdrant/index` con la misma `collection`, sus vectores se mezclan.

El driver PHP `QdrantEmbeddings` ya aísla con `politicos_{slug}_docs`, pero el servicio Python no valida que la colección venga prefijada con el slug del tenant.

**Mitigación**: Validar en `ingest/app.py:104` que `req.collection` empieza con `politicos_` + algún slug conocido. O ignorar `req.collection` y forzar el nombre desde `X-Tenant` header.

---

### RT-04 — Switch de DB en ResolveTenant corre en cada request
**Severidad**: MEDIA | **Probabilidad**: Baja bajo carga normal, visible bajo carga alta

`app/Http/Middleware/ResolveTenant.php:28-35` hace `DB::purge('mysql') + DB::reconnect('mysql')` en cada request. Esto rompe el connection pooling de MySQL. Con alta concurrencia (>50 req/s), esto genera latencia de conexión acumulada.

**Mitigación** (no es Fase 0): Usar `DB::connection('tenant')` con un config dinámico por request sin purgar la conexión global; o usar PgBouncer/ProxySQL para pooling.

---

### RT-05 — `chatMessage.role = 'james'` en datos históricos
**Severidad**: BAJA | **Probabilidad**: Certeza (existe en prod)

Si en la Fase 2 se renombra `'james'` a `'assistant'`, los registros históricos en `chat_messages` quedarán inconsistentes. Las queries que filtran por `role = 'james'` (si las hay) romperían.

**Mitigación**: Migración no-destructiva que hace `UPDATE chat_messages SET role='assistant' WHERE role='james'` + agregar la columna `role_label` si se quiere el nombre del candidato visible en el panel.

---

### RT-06 — Streaming SSE bufferiza todo antes de parsear JSON
**Severidad**: BAJA | **Probabilidad**: Visible con respuestas largas

`JamesAIService::respondStream()` líneas 113-119 acumula toda la respuesta en `$rawBuffer` antes de parsearla y luego simula el streaming cortando en chunks de 30 caracteres. El usuario no recibe nada hasta que el LLM termina de generar.

El streaming real (chunk-by-chunk al usuario) no está implementado porque el JSON de `pepa_prompt.txt` no puede parsearse parcialmente.

**Mitigación**: Opción A — separar el prompt PEPA en dos respuestas (primero el texto al usuario, luego metadata en segundo request). Opción B — usar streaming solo con el prompt `politicos_v2_prompt.txt` que devuelve texto plano.

---

### RT-07 — Directorio `politicos-v2-patch (1)` con código duplicado
**Severidad**: BAJA | **Probabilidad**: Confusión en desarrollo

El patch ya está integrado en el main repo. El directorio duplicado puede confundir a un dev que edite el archivo del patch creyendo que es el activo.

**Mitigación**: Eliminar el directorio en Fase 0.

---

## 2. Riesgos de producto

### RP-01 — Veda electoral no implementada (6-8 jun 2026)
**Severidad**: ALTA LEGAL | **Plazo**: 6 jun 2026 00:00 ART

El `LEGAL_COMPLIANCE.md` documenta la necesidad del middleware de veda pero lo marca como `NO implementado`. Si el chat sigue disponible durante las 24h de veda preelectoral, expone al operador a sanciones del JNE.

**Mitigación**: Implementar en Fase 0. Ver snippet exacto en `LEGAL_COMPLIANCE.md:119-139`.

---

### RP-02 — `pepa_prompt.txt` supone turno 1, 2, 3... secuencial
**Severidad**: MEDIA | **Probabilidad**: Alta (usuarios no siguen el flujo)

El prompt define un flujo rígido de 5 turnos (líneas 32-40). En la práctica, los usuarios preguntan de forma no lineal y el modelo puede intentar forzar el flujo aunque no encaje.

**Mitigación**: Reemplazar el flujo fijo por instrucciones de comportamiento (qué hacer según el contexto, no según el turno N). Ver Fase 3.

---

### RP-03 — `{{candidatos}}` en pepa_prompt solo inyecta el candidato del tenant
**Severidad**: ALTA para PEPA multi-candidato | **Probabilidad**: Certeza si se activa PEPA sin modificar

Si se activa `pepa_prompt.txt` en un tenant de Keiko, `{{candidatos}}` se resolverá a "Keiko Sofía Fujimori Higuchi" (el `CandidateProfile` del tenant). PEPA entonces solo "conoce" un candidato — no es neutral.

**Mitigación**: Fase 3 — cambiar `{{candidatos}}` por `{{candidatos_con_docs}}` dinámico desde `KnowledgeDocument`.

---

### RP-04 — Modo "WOW" en pepa_prompt puede producir falsos positivos
**Severidad**: BAJA | **Probabilidad**: Media

La regla "si las últimas 2 respuestas son cortas con emojis, lanza pregunta de quiebre" (líneas 43-46 de `pepa_prompt.txt`) puede dispararse cuando el usuario simplemente está de acuerdo con lo que PEPA explicó, no necesariamente en "modo dopamina".

**Riesgo de producto**: PEPA interrumpe una conversación fluida con una pregunta de quiebre que el usuario percibe como fuera de lugar.

**Mitigación**: Logging de cuántas veces se activa; ajustar umbral a 3 respuestas cortas consecutivas.

---

### RP-05 — Datos de intención de voto = dato sensible Ley 29733
**Severidad**: ALTA LEGAL | **Probabilidad**: Ya existe en `CitizenData`

`citizen_data` almacena `field_name='intencion_voto'`. La Ley 29733 clasifica la intención de voto como **dato sensible** (categoría de "pensamiento político"). Requiere consentimiento explícito, finalidad declarada y derecho ARCO operativo.

**El consentimiento ya está implementado** (`ConsentModal` + `consent_data_capture`). El riesgo es que:
- El modal no mencione explícitamente "intención de voto" como dato a recolectar.
- El email `privacidad@politicos.pe` no esté operativo.

**Mitigación**: Revisar el texto del modal y confirmar que el email de ARCO funciona antes del lanzamiento.

---

## 3. Dependencias bloqueantes

| Dependencia | Tipo | Bloquea | Alternativa si falla |
|-------------|------|---------|---------------------|
| Groq API (clasificador async) | Servicio externo pago | `AnalyzeMessageJob`, dashboard de inteligencia | Fallback a OpenAI GPT-4o-mini (ya implementado en línea 65 del job) |
| Anthropic Claude API | Servicio externo pago | Chat principal | Fallback a OpenAI → Groq (ya implementado en `callProvider`) |
| OpenAI API | Servicio externo pago | Embeddings Qdrant | Alternativa: BGE-M3 self-hosted via Ollama (documentado en `embedder.py:7`) |
| Qdrant | Infra propia (Docker) | RAG semántico | Fallback a MySQL FULLTEXT (ya implementado y activo por defecto) |
| Redis | Infra propia | Cola de jobs Celery + Laravel Queues | Sin Redis: jobs sincrónicos (degradación de latencia, no fallo total) |
| MySQL | Infra propia | Todo | Sin alternativa |

---

## 4. Dependencias frágiles

### DF-01 — `KnowledgeDocument` sin `source_url`
Para que PEPA pueda citar fuentes verificables con URL (como exige `pepa_prompt.txt:1,16`), el documento necesita una URL de origen. Hoy el modelo solo tiene `file_url` (donde está almacenado el PDF) pero no la URL pública original (ej. `jne.gob.pe/plan-de-gobierno/keiko`).

### DF-02 — `CandidateProfile::firstOrFail()` como singleton implícito
El sistema asume single-candidate-per-tenant. Si a futuro se permite multi-candidate en un solo tenant, hay que cambiar esta llamada en al menos 3 lugares.

### DF-03 — Celery beat schedule hardcodeado en `ingest/app.py`
Los intervalos de scraping (30min RSS, 1h YouTube) están fijos en el código. Cambiarlos requiere redeploy del servicio Python. Deberían ser configurables desde `.env` o una tabla de configuración.

### DF-04 — `politicos-v2-patch (1)` no eliminado
Crea riesgo de editar el archivo equivocado en desarrollo.

---

## 5. Mitigación por riesgo — resumen

| ID | Riesgo | Mitigación | Fase |
|----|--------|-----------|------|
| RT-01 | TARGET_CANDIDATES hardcoded | Eliminar del classifier/workers | Fase 1 |
| RT-02 | firstOrFail sin perfil | Inyección con fallback null | Fase 2 |
| RT-03 | Qdrant sin aislamiento por tenant en Python | Validar colección desde X-Tenant | Fase 1 |
| RT-04 | DB::purge en cada request | ProxySQL / connection config dinámico | Fase 5 |
| RT-05 | role='james' en histórico | Migración UPDATE + role_label | Fase 2 |
| RT-06 | Streaming fake | Separar texto/metadata en 2 responses | Fase 3 |
| RT-07 | Directorio patch duplicado | Eliminar | Fase 0 |
| RP-01 | Veda electoral faltante | Middleware temporal | Fase 0 |
| RP-02 | Flujo rígido de turnos | Reescribir instrucciones por contexto | Fase 3 |
| RP-03 | `{{candidatos}}` single-tenant | `{{candidatos_con_docs}}` dinámico | Fase 3 |
| RP-04 | Modo WOW falsos positivos | Ajustar umbral | Fase 3 |
| RP-05 | Intención de voto sin consentimiento explícito | Revisar modal + email ARCO | Fase 0 |
