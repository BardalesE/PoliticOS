# 06 — Módulos Reutilizables

> Módulos que ya pueden generalizarse hoy (o con cambios mínimos) para el núcleo PEPA.
> Todos pasan de "funciona para un candidato" a "funciona para cualquier candidato o ninguno".

---

## 1. `EmbeddingsServiceInterface` — Contrato RAG

**Estado**: ✅ Ya generalizado. Listo para producción.

```php
// app/Services/EmbeddingsServiceInterface.php
interface EmbeddingsServiceInterface {
    public function index(int $documentId, string $content, array $metadata = []): void;
    public function search(string $query, int $topK = 5, array $filter = []): array;
    public function delete(int $documentId): void;
}
```

**Interfaz pública propuesta (sin cambios):**

| Método | Input | Output | Notas |
|--------|-------|--------|-------|
| `index()` | `document_id`, texto, `metadata[]` | void | `metadata` acepta `candidate_id`, `topic`, `source_url` |
| `search()` | query, topK, `filter[]` | `[{document_id, title, excerpt, score, metadata}]` | `filter['candidate_id']` para aislar por candidato |
| `delete()` | `document_id` | void | Elimina todos los chunks del documento |

**Extensión recomendada para PEPA** (cambio mínimo):

```php
// Agregar parámetro candidate_id al search para comparación multi-candidato
public function search(string $query, int $topK = 5, array $filter = []): array;
// filter puede incluir:
//   ['topic' => 'seguridad']                  — ya soportado
//   ['candidate_id' => 'keiko']               — nueva extensión Fase 4
//   ['candidate_id' => ['keiko', 'jp']]       — multi-candidato Fase 4
```

---

## 2. `MySQLFulltextEmbeddings` — RAG sin infra

**Estado**: ✅ Ya generalizado. Sin referencias a candidatos. Listo.

**Fortalezas para PEPA:**
- No requiere Qdrant — funciona desde el día 1
- BM25-like ranking, tolera plurales y conjugaciones en español
- Fallback a LIKE si MySQL no tiene FULLTEXT (SQLite en CI)

**Extensión para Fase 4 (multi-candidato):**

```php
// Agregar WHERE clause cuando filter['candidate_id'] esté presente
if (!empty($filter['candidate_id'])) {
    $q->where('candidate_id', $filter['candidate_id']);
    // o IN si es array
}
```

Solo requiere que `knowledge_documents` tenga columna `candidate_id` (migración de Fase 4).

---

## 3. `QdrantEmbeddings` — RAG semántico

**Estado**: ✅ Generalizado. La colección ya usa `politicos_{slug}_docs` (aislamiento por tenant).

**Fortalezas para PEPA:**
- Búsqueda semántica real (cosine similarity)
- Filtra por `topic` en el payload del chunk
- Escala horizontalmente

**Extensión para Fase 4:**

```php
// En search(), agregar filtro por candidate_id al payload de Qdrant:
if (!empty($filter['candidate_id'])) {
    $body['filter']['must'][] = [
        'key' => 'candidate_id',
        'match' => ['value' => $filter['candidate_id']],
    ];
}
```

El `candidate_id` ya puede propagarse al payload del chunk en `index()` si se pasa en `$metadata`:

```php
$this->index($documentId, $content, ['candidate_id' => 'keiko', 'source_url' => '...']);
```

---

## 4. `AnalyzeMessageJob` — Clasificador async de mensajes

**Estado**: ✅ Completamente agnóstico de candidato. Listo para PEPA.

**Qué detecta hoy:**
- Sentiment (-1.0 a 1.0)
- Emotion (miedo, enojo, esperanza, frustración, alegría, neutral)
- Intent (pregunta, crítica, apoyo, ataque, duda, saludo, otro)
- Concerns (array de hasta 3: empleo, seguridad, educación...)
- voter_segment (joven, adulto, agricultor, empresario...)
- voter_intention (alta, media, baja, opositor, indeciso...)
- is_attack + attack_category

**Interfaz pública propuesta:**

```php
// app/Jobs/AnalyzeMessageJob.php
// Sin cambios de interfaz — ya es neutral.
// Dispatch desde cualquier tenant:
AnalyzeMessageJob::dispatch($message->id);
```

**Extensión opcional para PEPA:**
- Agregar `mentioned_politicians` al output JSON (lista de políticos mencionados en el mensaje)
- Requiere cambio en el prompt de análisis y una nueva columna en `chat_messages`

---

## 5. `IntelligenceService` — Pulso ciudadano

**Estado**: ⚠️ Mayormente generalizado. Un punto de acoplamiento: queries asumen `role` de mensajes del candidato como `'james'`.

**Método `segmentAnalysis()` línea 194:**
```php
// Problema: filtra 'james' implícitamente via role del join
$topicsBySegment = ChatMessage::where('chat_messages.role','james')  // ← acoplado
```

**Fix propuesto (mínimo):**
```php
// Reemplazar 'james' por el rol configurable del asistente
$assistantRole = config('ai.assistant_role', 'assistant');
->where('chat_messages.role', $assistantRole)
```

**Una vez corregido**, `IntelligenceService` es completamente reutilizable para cualquier tenant.

**Interfaz pública (sin cambios):**

| Método | Output | Cache |
|--------|--------|-------|
| `citizenPulse()` | Sentiment, emociones, intents, mapa por región | 60s |
| `attackFeed(limit)` | Feed interno + externo, categorías, velocidad | 120s |
| `segmentAnalysis()` | Concerns por segmento, funnel, topics | 300s |
| `realtimeMetrics()` | Sesiones activas, msg/min, alertas | Sin cache |
| `generateAlerts()` | IntelAlert[] | Sin cache (cron) |

---

## 6. `GeoIPService` — Geolocalización

**Estado**: ✅ Completamente neutral. Sin referencia a candidatos.

**Interfaz pública propuesta:**

```php
// app/Services/GeoIPService.php
public function locate(string $ip): array;
// Returns: {country, region, city, lat, lng}
```

Sin cambios requeridos.

---

## 7. `ResolveTenant` Middleware — Switch multi-tenant

**Estado**: ✅ Generalizado. Funciona para cualquier número de tenants.

**Fortalezas:**
- Resuelve tenant por subdominio (producción), header `X-Tenant` (desarrollo) o query param
- Aísla completamente la DB por tenant
- Disponible como `app('tenant')` en toda la request

**Gap para PEPA**: no valida que el tenant tenga un `CandidateProfile` (puede ser un tenant PEPA puro sin candidato). Hoy `JamesAIService` falla si no hay perfil. Solución: ver RT-02 en documento 05.

---

## 8. `pepa_prompt.txt` — Template neutro

**Estado**: ⚠️ Mayormente neutral. Dos problemas:

1. `{{candidatos}}` (línea 10) — asume single-candidate
2. Flujo de 5 turnos hardcodeado — rígido para multi-candidato

**Interfaz pública (los placeholders que consume):**

| Placeholder | Fuente actual | Fuente PEPA |
|-------------|--------------|-------------|
| `{{region}}` | `chat_sessions.geo_region` | Sin cambio |
| `{{distrito}}` | `visitor_profiles.inferred_district` | Sin cambio |
| `{{tema}}` | Detectado por `detectTopic()` | Sin cambio |
| `{{candidatos}}` | `CandidateProfile.name` (solo 1) | Lista de candidatos con docs indexados |
| `{{turno}}` | `chat_sessions.messages_count` | Sin cambio |
| `{{postura_inicial}}` | `chat_sessions.postura_inicial` | Sin cambio |

**Cambio mínimo para PEPA multi-candidato:**
- Reemplazar `{{candidatos}}` por `{{candidatos_con_docs}}` con formato:
  ```
  - Keiko Sofía Fujimori Higuchi (Fuerza Popular): 12 documentos verificados
  - Roberto Sánchez Palomino (Juntos por el Perú): 8 documentos verificados
  ```

---

## 9. `ingest/processors/embedder.py` — Motor de embeddings Python

**Estado**: ✅ Generalizado. Sin referencias a candidatos.

**Interfaz pública propuesta:**

```python
def index_document(collection: str, document_id: int, content: str, metadata: dict) -> int:
    """Retorna número de chunks indexados."""

def search_documents(collection: str, query: str, top_k: int, filter_dict: dict) -> list[dict]:
    """Retorna [{score, payload}]."""
```

**Extensión para multi-candidato:**
- `metadata` ya acepta `candidate_id` — solo hay que propagarlo
- `filter_dict` ya acepta cualquier campo del payload — `{'candidate_id': 'keiko'}` funciona sin cambios

---

## 10. Módulo sugerido a extraer: `PoliticalEntityDetector`

**Estado**: No existe. Sería nuevo.

**Por qué**: Hoy `detectTopic()` y `detectDistrict()` en `JamesAIService` son simples keyword-match contra la DB. Para PEPA multi-candidato necesitamos además detectar qué candidato menciona el usuario.

**Interfaz propuesta:**

```php
// app/Services/PoliticalEntityDetector.php
class PoliticalEntityDetector {
    public function detectTopic(string $message): ?string;
    public function detectDistrict(string $message): ?string;
    public function detectMentionedCandidates(string $message): array; // NUEVO
    // Retorna: ['keiko', 'jp'] — slugs de los candidatos mencionados
}
```

`detectMentionedCandidates()` consultaría `CandidateProfile` de todos los tenants activos (o una tabla de entidades conocidas) y haría string-match contra el mensaje.

**Origen**: extraer de `JamesAIService::detectTopic()` + `detectDistrict()` (líneas 214-233).

---

## Resumen de estado

| Módulo | Estado | Acción requerida | Fase |
|--------|--------|-----------------|------|
| `EmbeddingsServiceInterface` | ✅ Listo | Ninguna | — |
| `MySQLFulltextEmbeddings` | ✅ Listo | Agregar filtro `candidate_id` | Fase 4 |
| `QdrantEmbeddings` | ✅ Listo | Propagar `candidate_id` en payload | Fase 4 |
| `AnalyzeMessageJob` | ✅ Listo | Opcional: agregar `mentioned_politicians` | Fase 6 |
| `IntelligenceService` | ⚠️ Casi | Corregir `role='james'` por configurable | Fase 2 |
| `GeoIPService` | ✅ Listo | Ninguna | — |
| `ResolveTenant` | ✅ Listo | Ninguna | — |
| `pepa_prompt.txt` | ⚠️ Casi | `{{candidatos_con_docs}}` dinámico | Fase 3 |
| `embedder.py` | ✅ Listo | Propagar `candidate_id` en metadata | Fase 4 |
| `PoliticalEntityDetector` | ❌ No existe | Crear extrayendo de JamesAIService | Fase 2 |
