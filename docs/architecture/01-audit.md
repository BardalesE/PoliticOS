# 01 — Auditoría del repositorio PoliticOS

> Fecha: 2026-05-23 | Alcance: lectura total, sin modificaciones | Objetivo: base para pivote a PEPA

---

## 1. Árbol del repositorio

```
PoliticOS/
├── app/
│   ├── Http/
│   │   ├── Controllers/          # 22 controladores REST
│   │   └── Middleware/           # 4 middlewares
│   ├── Jobs/                     # 4 jobs de cola async
│   ├── Models/                   # 25 modelos Eloquent
│   ├── Providers/                # AppServiceProvider estándar
│   └── Services/                 # 6 servicios de dominio
├── database/
│   ├── migrations/               # 37 migraciones
│   └── seeders/                  # 17 seeders (2 de candidatos específicos)
├── ingest/                       # Servicio Python independiente (FastAPI + Celery)
│   ├── processors/               # classifier.py, embedder.py
│   └── workers/                  # rss_scraper.py, youtube_comments.py, twitter_listener.py
├── resources/
│   ├── js/                       # Frontend Next.js 15
│   ├── prompts/                  # pepa_prompt.txt, politicos_v2_prompt.txt
│   └── css/                      # Tailwind
├── routes/
│   └── api.php                   # Rutas API (≈ 60 endpoints)
├── training-data/                # Datasets locales (no revisado, carpeta exists)
├── politicos-v2-patch (1)/       # Patch sin integrar (carpeta extra, revisar)
└── CLAUDE.md                     # Documentación del proyecto
```

### Módulos críticos

| Módulo | Archivo principal | Propósito |
|--------|-------------------|-----------|
| AI Core | `app/Services/JamesAIService.php` | Orquestador RAG + multi-provider AI |
| RAG Qdrant | `app/Services/QdrantEmbeddings.php` | Vector store con OpenAI embeddings |
| RAG MySQL | `app/Services/MySQLFulltextEmbeddings.php` | Fallback FULLTEXT sin infra extra |
| Inteligencia | `app/Services/IntelligenceService.php` | Pulso ciudadano, ataques, clusters |
| Ingest | `ingest/app.py` | FastAPI + Celery: RSS, YouTube, Twitter |
| Clasificador | `ingest/processors/classifier.py` | Groq Llama-8B: sentiment/emotion/topic |
| Embedder | `ingest/processors/embedder.py` | OpenAI text-embedding-3-small + Qdrant |
| Multi-tenant | `app/Http/Middleware/ResolveTenant.php` | Switch de DB por subdominio/header |
| Prompts | `resources/prompts/` | 2 prompts activos (candidato + Pepa) |

---

## 2. Stack completo

### Backend
| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Laravel | 12 |
| Lenguaje | PHP | 8.2 |
| Auth | Laravel Sanctum | Bearer tokens |
| Queue | Laravel Queues (jobs) | Redis/DB |
| ORM | Eloquent | — |

### Frontend
| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 15 / React 19 |
| Lenguaje | TypeScript |
| CSS | Tailwind CSS 3.4 |
| Animaciones | Framer Motion |
| Gráficas | Recharts |

### Servicios externos / infra
| Servicio | Uso | Criticidad |
|----------|-----|-----------|
| Claude (Anthropic) | LLM principal para chat | Alta |
| OpenAI | Embeddings + fallback LLM | Alta |
| Groq (Llama-3.3-70b) | Segundo fallback LLM; clasificación en ingest | Alta |
| Qdrant | Vector store RAG (opcional; fallback a MySQL) | Media |
| Redis | Celery broker + backend; Laravel cache | Media |
| MySQL | Base de datos relacional (multi-tenant por DB) | Alta |

### Servicio Python (ingest)
| Componente | Stack |
|-----------|-------|
| API | FastAPI |
| Tareas async | Celery + celery-beat |
| Scraping RSS | feedparser |
| HTTP | httpx |
| Embeddings | openai SDK |
| Vector store | qdrant-client |

---

## 3. Hotspots hardcodeados

> **Leyenda de riesgo**: ALTO = bloquea generalización / viola neutralidad | MEDIO = requiere parametrizar | BAJO = cosmético / renombrar

| Archivo | Línea(s) | Tipo de acoplamiento | Descripción | Riesgo |
|---------|----------|---------------------|-------------|--------|
| `ingest/processors/classifier.py` | 25 | Candidato fijo | `TARGET_CANDIDATES = "james cueva,james,cueva"` en env default | ALTO |
| `ingest/processors/classifier.py` | 33 | Candidato fijo | `candidates_str` inyectado directo en prompt del clasificador | ALTO |
| `ingest/processors/classifier.py` | 68-69 | Candidato fijo | Fallback `_fallback_classify` filtra con `TARGET_CANDIDATES` hardcoded | ALTO |
| `ingest/workers/rss_scraper.py` | 26 | Candidato fijo | `TARGET_CANDIDATES` default `"james cueva,james,cueva"` | ALTO |
| `ingest/workers/rss_scraper.py` | 29-31 | Candidato fijo | `_mentions_candidate()` filtra artículos solo si mencionan esos candidatos | ALTO |
| `ingest/workers/twitter_listener.py` | (ver archivo) | Candidato fijo | Misma variable `TARGET_CANDIDATES` duplicada en worker | ALTO |
| `app/Services/JamesAIService.php` | 36 | Nombre hardcodeado | Nombre de clase `JamesAIService` acoplado a un candidato (funciona para todos pero el nombre es engañoso) | BAJO |
| `app/Services/JamesAIService.php` | 45 | Tenant fijo | `CandidateProfile::query()->firstOrFail()` asume single-candidate dentro del tenant | MEDIO |
| `app/Services/JamesAIService.php` | 186-192 | Prompt candidato | Respuesta de identidad genera texto con nombre del candidato (correcto si es single-tenant, pero acoplado al modo campaña) | MEDIO |
| `resources/prompts/politicos_v2_prompt.txt` | 1-3 | Prompt sesgado | "Hablas SIEMPRE en primera persona representando sus propuestas" — advocacy activo | ALTO |
| `resources/prompts/politicos_v2_prompt.txt` | 56-58 | Prompt sesgado | "Habla como dueño del plan" — propaganda de candidato | ALTO |
| `resources/prompts/politicos_v2_prompt.txt` | 67-71 | Prompt sesgado | "Comparte esta conversación" como cierre viral | ALTO |
| `resources/prompts/politicos_v2_prompt.txt` | 96 | Candidato fijo | `{{candidate_name}}` en respuesta a jailbreak — correcto en single-tenant pero depende del modo | BAJO |
| `database/seeders/KeikoSeeder.php` | 47-105 | Candidato fijo | Perfil completo de Keiko Fujimori hardcodeado (nombre, partido, biografía, frases, temas prohibidos) | ALTO |
| `database/seeders/KeikoSeeder.php` | 126-178 | Candidato fijo | 30 propuestas hardcodeadas del plan "Perú con Orden" de Keiko | ALTO |
| `database/seeders/KeikoSeeder.php` | 182-225 | Candidato fijo | 25 FAQs específicas de Keiko (respuestas en 1a persona de ella) | ALTO |
| `database/seeders/KeikoSeeder.php` | 229-380 | Candidato fijo | 15 plantillas de respuesta a ataques específicos de Keiko | ALTO |
| `database/seeders/RobertoSanchezSeeder.php` | (todo) | Candidato fijo | Mismo patrón para Roberto Sánchez / Juntos por el Perú | ALTO |
| `database/seeders/TenantSeeder.php` | 13-24 | Candidato fijo | `slug='james'` y `name='James Cueva'` como primer tenant | MEDIO |
| `database/seeders/CandidateProfileSeeder.php` | (ver) | Candidato fijo | Seeder original de James Cueva | ALTO |
| `app/Services/JamesAIService.php` | 348-370 | Prompt sesgado | `buildSystemPrompt()` inyecta `{{candidatos}}` con solo el nombre del candidato activo | MEDIO |
| `app/Models/ChatMessage.php` | (ver role) | Candidato fijo | Enum `role` incluye 'james' como nombre literal del candidato | MEDIO |

---

## 4. Inventario de prompts

| Archivo | Clasificación | Descripción | Acción para PEPA |
|---------|--------------|-------------|-----------------|
| `resources/prompts/pepa_prompt.txt` | **Ya neutral** | Asistente cívico comparativo, cita JNE, no defiende candidatos, output JSON estructurado con metadata_interna | **Mantener y extender** |
| `resources/prompts/politicos_v2_prompt.txt` | **Propagandístico** | Habla en primera persona por el candidato, usa sus frases, hace viral la conversación | **Deprecar para PEPA** (mantener para modo SaaS campaña) |

### Análisis del prompt Pepa (`pepa_prompt.txt`)

**Neutral ✅:**
- No defiende ningún candidato
- Prohíbe explícitamente decir por quién votar
- Exige citar fuentes (JNE / entrevistas enlazadas)
- Output JSON estructurado con `metadata_interna` que nunca ve el ciudadano

**Problemas a resolver:**
- `{{candidatos}}` line 10 → se inyecta solo el candidato del tenant activo; para PEPA multi-candidato debe venir del RAG
- Flujo de conversación hardcodeado en 5 turnos (líneas 32-40) → válido pero rígido para elecciones con 5+ candidatos
- "modo WOW" (líneas 43-46) asume dopamina afirmativa; podría generar falsos positivos

---

## 5. Endpoints, jobs y pipelines de ingest

### API REST (todos bajo `ResolveTenant` middleware)

| Grupo | Método | Ruta | Auth | Descripción |
|-------|--------|------|------|-------------|
| Auth | POST | `/api/auth/login` | — | Login admin |
| Auth | POST | `/api/auth/logout` | Sanctum | Logout |
| Auth | GET | `/api/auth/me` | Sanctum | Usuario actual |
| Chat | POST | `/api/chat` | — | Enviar mensaje |
| Chat | POST | `/api/chat/stream` | — | SSE streaming |
| Chat | GET | `/api/chat/session/{id}` | — | Historial |
| Chat | POST | `/api/chat/consent` | — | Consentimiento datos |
| Público | GET | `/api/candidate` | — | Perfil candidato |
| Público | GET | `/api/proposals` | — | Propuestas |
| Público | GET | `/api/videos` | — | Videos |
| Público | GET | `/api/gallery` | — | Galería |
| Público | GET | `/api/campaign-videos` | — | Videos de campaña |
| Público | GET | `/api/hero-settings` | — | Hero del landing |
| Público | GET | `/api/events` | — | Eventos |
| Público | GET | `/api/team-members` | — | Equipo |
| Público | GET | `/api/analytics/summary` | — | Métricas básicas |
| Admin | GET | `/api/admin/intelligence/pulse` | Admin | Pulso ciudadano |
| Admin | GET | `/api/admin/intelligence/attacks` | Admin | Feed de ataques |
| Admin | GET | `/api/admin/intelligence/segments` | Admin | Segmentos |
| Admin | GET | `/api/admin/intelligence/realtime` | Admin | Métricas en vivo |
| Admin | GET | `/api/admin/intelligence/geo` | Admin | Mapa de calor |
| Admin | GET | `/api/admin/intelligence/clusters` | Admin | Clusters de preguntas |
| Admin | GET | `/api/admin/intelligence/alerts` | Admin | Alertas |
| Admin | GET | `/api/admin/knowledge` | Admin | Base de conocimiento |
| Admin | POST | `/api/admin/knowledge/{id}/reindex` | Admin | Re-indexar en RAG |
| Admin | POST | `/api/admin/external-signals/ingest` | Admin | Recibir señales externas |
| SuperAdmin | GET/POST/PUT/DELETE | `/api/superadmin/tenants` | SuperAdmin | CRUD tenants |

### Jobs async (Laravel Queues)

| Job | Trigger | Descripción |
|-----|---------|-------------|
| `AnalyzeMessageJob` | Post-chat | Clasificación sentiment/emotion/intent de cada mensaje |
| `GeolocateSessionJob` | Nueva sesión | GeoIP → `geo_region`, `geo_city`, `geo_lat`, `geo_lng` |
| `GenerateAlertsJob` | Scheduler 5min | Detección de spikes, drops de sentimiento, topics virales |
| `ClusterTopQuestionsJob` | Scheduler diario | Agrupa preguntas similares en `QuestionCluster` |

### Pipeline de ingest (Python / Celery Beat)

```
Fuentes externas (RSS / YouTube / Twitter)
    ↓ cada 30-60 min
workers/ (rss_scraper, youtube_comments, twitter_listener)
    ↓ filtrado por TARGET_CANDIDATES  ⚠️ hardcoded
processors/classifier.py  (Groq Llama-8B)
    ↓ {sentiment, emotion, topic, is_attack, target_candidate}
POST /api/admin/external-signals/ingest  (Laravel)
    ↓
ExternalSignal model → IntelligenceService → alerts
```

### Pipeline de indexación de documentos

```
Admin sube PDF/texto → KnowledgeDocumentController::store()
    ↓
POST /api/admin/knowledge/{id}/reindex
    ↓
EmbeddingsServiceInterface::index()  ← driver: mysql_fulltext | qdrant
    ↓ (si qdrant)
POST ingest/qdrant/index  →  embedder.py  →  Qdrant
```

---

## Hallazgos adicionales (post primera lectura)

### `training-data/`
Contiene exactamente `KeikoSeeder.php` y `RobertoSanchezSeeder.php` — copias de los seeders de candidatos. Funciona como repositorio histórico de "paquetes de candidato". Bien ubicado; solo falta un `README.md` que explique cómo agregar uno nuevo.

### `politicos-v2-patch (1)/`
El patch **ya fue integrado** al repo principal. El directorio es un duplicado completo e innecesario. Contiene los mismos archivos de backend, frontend e ingest que ya viven en sus ubicaciones definitivas. Riesgo: un dev podría editar el archivo del patch creyendo que es el activo. **Acción: eliminar en Fase 0.**

También contiene `DEPLOYMENT.md`, `INSTALL.md`, `LEGAL_COMPLIANCE.md`, `SUPER_PROMPT.md` y `training-data/README.md` — documentación valiosa que **no existe en el repo raíz**. Antes de eliminar el directorio, mover esos `.md` a `docs/`.

### `LEGAL_COMPLIANCE.md` (dentro del patch)
Documento crítico: cubre Ley 29733 (datos personales), JNE (propaganda electoral), veda electoral del 7 jun 2026, y checklist de cumplimiento. **No está en el repo raíz** — solo en el directorio del patch. Mover a `docs/legal/` en Fase 0.

## Open Questions

1. `ChatMessage.role` tiene el valor `'james'` como literal — ¿hay lógica en el frontend que dependa de ese string específico para renderizar el nombre del asistente?
2. `CandidateProfile::query()->firstOrFail()` (línea 45 de JamesAIService) — en modo PEPA multi-candidato, ¿hay un solo perfil por tenant o varios? Respuesta esperada: uno por tenant; el candidato con `id=1` es el activo.
3. ¿El clasificador Python debe detectar CUALQUIER candidato o solo los del tenant? Para PEPA multi-candidato: cualquier político peruano mencionado, sin filtro previo por nombres hardcodeados.
