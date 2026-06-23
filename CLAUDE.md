# PoliticOS / PEPA — Documentación técnica

Plataforma SaaS **multi-tenant** de campaña política e inteligencia electoral.
Cada candidato es un **tenant** con su propia base de datos MySQL. La plataforma:

- Sirve un chat con un AI que habla como el candidato (modo **campaña**) o que
  compara propuestas de varios candidatos citando fuentes JNE (modo **PEPA neutro**).
- Da a cada campaña un panel admin para gestionar todo el contenido sin tocar código.
- Ingiere señales externas (RSS, YouTube, Twitter) vía un pipeline Python/Celery
  y produce **inteligencia electoral** (pulso ciudadano, ataques, alertas, clusters).

> El primer tenant en producción fue James Cueva (alcaldía de San Miguel, Perú).
> Hoy el código **no hardcodea ningún candidato**: la identidad vive en la BD del
> tenant (`CandidateProfile`, `AiSetting`, documentos en RAG). El diseño completo
> está en `docs/architecture/` (audit → mapa de separación → arquitectura objetivo
> → roadmap de 6 fases). Léelo antes de cambios estructurales.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Laravel 12 / PHP 8.2 — API REST pura |
| Frontend | Next.js 15 / React 19 / TypeScript |
| Base de datos | MySQL — una BD por tenant + BD `central` (tenants, planes) |
| Cache / colas | Redis (cache, sesiones, queue, broker Celery) |
| Auth | Laravel Sanctum (Bearer tokens) por tenant; SuperAdmin por key |
| AI (chat) | Claude (Anthropic) — fallback OpenAI. Configurable por tenant |
| AI (ingest) | Groq Llama-8B (clasificador) + OpenAI/BGE-M3 (embeddings) |
| RAG | `EmbeddingsServiceInterface`: Qdrant (semántico) o MySQL FULLTEXT (fallback) |
| Ingest | Python 3 / FastAPI / Celery / Redis (carpeta `ingest/`) |
| CSS | Tailwind CSS 3.4 + Framer Motion + Recharts |

---

## Cómo correr el proyecto

### Backend (Laravel)
```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed       # BD del tenant por defecto (APP_TENANT_SLUG)
php artisan serve                # http://localhost:8000
```

### Frontend (Next.js)
```bash
cd resources/js
npm install
npm run dev                      # http://localhost:3000
```

### Ingest (opcional — inteligencia electoral)
```bash
cd ingest
pip install -r requirements.txt
# Con Docker:
docker compose -f docker-compose.instance.yml --env-file instances/<slug>.env up
# Sin Docker (Redis local + Laravel sirviendo):
celery -A app.celery_app worker --beat --loglevel=info
```

### Credenciales de admin por defecto
```
Email:    admin@politicos.pe
Password: Admin2024!
```
Acceso admin del tenant: http://localhost:3000/admin/login
Acceso SuperAdmin: http://localhost:3000/superadmin/login (usa `SUPER_ADMIN_KEY`)

---

## Multi-tenancy (lo más importante de entender)

- **BD `central`** (conexión `central` en `config/database.php`): tabla `tenants`
  (slug, db_name, credenciales, `plan`, `custom_features`) y `plan_features`.
  El modelo `Tenant` declara `protected $connection = 'central'`.
- **BD por tenant**: todo el contenido del candidato (proposals, faqs, knowledge,
  chat, intelligence, etc.). Se resuelve en runtime.
- **`ResolveTenant` middleware** (`bootstrap/app.php`): detecta el tenant por
  subdominio (prod) o `APP_TENANT_SLUG` (local), reconfigura la conexión MySQL
  por defecto y la apunta a la BD del tenant. **Corre antes de `auth:sanctum`**
  (por eso usa `prependToPriorityList` sobre `AuthenticatesRequests`): los tokens
  Sanctum viven en la BD del tenant, así que la BD debe cambiar antes del lookup.
- **`TenantContext`** (`app/Services/TenantContext.php`): API para correr código
  fuera del request en el contexto de un tenant.
  - `TenantContext::run($slug, fn)` — ejecuta el callback con la BD del tenant.
  - `TenantContext::forEachTenant(fn)` — itera todos los tenants activos.
  - `TenantContext::currentSlug()` / `cacheKey($key)` — cache namespaced por tenant.
- **Jobs y scheduler son tenant-aware** (`routes/console.php`): cada job lleva el
  `slug` y reconecta vía `TenantContext::run`. Nunca asumas la BD por defecto en
  un job o comando.
- **Provisioning de un tenant nuevo**: SuperAdmin → `POST /api/superadmin/tenants/provision`
  (Artisan command por debajo) crea la BD, migra y siembra. Ver
  `docs/architecture/03-target-architecture.md` §4.

---

## Modos de operación (PEPA)

| Modo | Prompt | Perfil | RAG | Descripción |
|------|--------|--------|-----|-------------|
| **Campaña (SaaS)** | `resources/prompts/politicos_v2_prompt.txt` | `CandidateProfile` activo | Single-candidato | Habla en primera persona por el candidato |
| **PEPA neutro** | `resources/prompts/pepa_prompt.txt` | — | Multi-candidato (todos los docs del tenant) | Compara propuestas, cita JNE, no defiende |
| **Híbrido** | `pepa_prompt.txt` + candidato | candidato | docs del candidato | PEPA que conoce a un candidato sin defenderlo |

El modo se selecciona en `AiSetting` (campo `mode` + `system_prompt`).
**El núcleo (`CivicAIService`) no sabe quién es el candidato**: recibe el contexto
inyectado (perfil + documentos RAG). No hardcodear identidad en código.

---

## Arquitectura — Backend (`app/`)

```
Http/
  Controllers/                  (27 controllers)
    AuthController              → login / logout / me (Sanctum)
    ChatController              → send / stream / session / consent (chat público)
    Civic / contenido público  → Proposal, Video, CampaignVideo, Gallery, Event,
                                  TeamMember, HeroSetting, Setting, District, Topic,
                                  SuggestedQuestion, CandidateProfile (show), LiveStream
    AdminController             → CRUD: Proposals, Videos, FAQs, Users, ChatSessions
    AnalyticsController         → summary (público) + adminSummary (admin)
    IntelligenceController      → pulse, attacks, segments, realtime, geo, clusters,
                                  alerts, districts, map  (inteligencia electoral)
    AttackResponseController    → CRUD plantillas de respuesta a ataques
    ExternalSignalController    → ingest (key) + index (admin)  señales externas
    IngestEntityController      → diccionario de entidades JNE para el pipeline Python
    KnowledgeDocumentController → CRUD docs + reindex en RAG
    CandidateProfileController  → perfil + presets de candidato (branding/personalidad)
    AiSettingController         → prompt, provider, modelo, temperatura, modo + test
    CitizenController           → registro ciudadano + export
    OnboardingController        → wizard de primer uso del tenant
    PlanController              → plan del tenant + (superadmin) gestión de planes
    SuperAdminController        → CRUD tenants, provision, credenciales, stats

  Middleware/
    ResolveTenant              → resuelve y conmuta la BD del tenant (ver arriba)
    EnsureIsAdmin (alias admin)→ valida role === 'admin'
    EnsureSuperAdmin           → valida SUPER_ADMIN_KEY (rutas /superadmin)
    CheckPlanFeature (plan_feature) → gate por feature de plan, matchea por path
    EnsureIngestKey (ingest_key)    → valida INGEST_KEY del servicio Python
    CaptureRequestContext      → IP, user-agent, geo, device en el chat
    SecurityHeaders            → headers de seguridad globales

Models/  (31)
  central:  Tenant, PlanFeatures
  identidad/branding: CandidateProfile (presets, personalidad, slogan, forbidden_topics…),
                      AiSetting, HeroSetting, Setting
  conocimiento: Proposal, Faq, KnowledgeDocument (source_url/type, candidate_id),
                Topic, District, AttackResponse, SuggestedQuestion
  chat: ChatSession, ChatMessage (role user|assistant)
  inteligencia: ExternalSignal (entities JSON), IntelAlert, QuestionCluster,
                CitizenProfile, CitizenData, CitizenPoint, VisitorProfile
  contenido: Video, CampaignVideo, CampaignPhoto, Event, TeamMember,
             LiveStream, LiveStreamViewer, LiveStreamComment
  User (role admin|editor)

Services/
  CivicAIService              → orquestación del chat: sanitización → detección →
                                RAG → prompt → LLM → parse (reply, topic, media,
                                pepa_metadata, attack_*). NÚCLEO, no hardcodea candidato.
  EmbeddingsServiceInterface  → contrato RAG abstracto
  QdrantEmbeddings            → RAG semántico vía vector store (colección por tenant)
  MySQLFulltextEmbeddings     → RAG FULLTEXT, fallback sin infra
  IntelligenceService         → pulso, ataques, alertas, segmentos (consulta DB)
  TenantContext               → contexto de tenant para jobs/scheduler/cache
  PlanService                 → features habilitadas por plan
  GeoIPService                → geolocalización por IP

Jobs/  (tenant-aware, ver routes/console.php)
  GenerateAlertsJob, ClusterTopQuestionsJob, AnalyzeMessageJob, GeolocateSessionJob
```

### Rutas API — `routes/api.php`

Toda la API pasa por el grupo global `api` (que incluye `ResolveTenant`).

- **Público** (sin auth, con throttle): `/auth/login`, `/chat/*`, `/citizen/*`,
  `/candidate`, `/proposals`, `/videos`, `/analytics/summary`, `/livestreams/*`,
  `/gallery`, `/campaign-videos`, `/hero-settings`, `/events`, `/team-members`,
  `/home-settings`.
- **Ingest** (key dedicada `ingest_key`, no Sanctum):
  `POST /admin/external-signals/ingest` (+`plan_feature`), `GET /ingest/entities`.
- **Admin** (`['auth:sanctum','admin','plan_feature']`, prefix `/admin`): analytics,
  `intelligence/*`, `attack-responses`, `external-signals`, `plan`, `citizens`,
  `candidate-profile` + presets, `ai-settings`, `districts`, `topics`,
  `suggested-questions`, `proposals`, `videos`, `faqs`, `users`, `chat-sessions`,
  `gallery`, `campaign-videos`, `hero-settings`, `events`, `team-members`,
  `settings`, `livestreams`, `onboarding`, `knowledge` (+reindex).
- **SuperAdmin** (`EnsureSuperAdmin`, prefix `/superadmin`, **sin tenant**):
  CRUD `tenants`, `provision`, `stats`, `plans`, credenciales, reset-password.

---

## Arquitectura — Frontend (`resources/js/src/`)

```
app/
  page.tsx                      → Landing pública
  chat/ propuestas/ videos/ distritos/ galeria/ en-vivo/[key]/
  bienvenida/ registro/         → flujo ciudadano
  admin/                        → 24 páginas de panel:
    page (dashboard), login, proposals, videos, faqs, users, chat-sessions,
    intelligence, external-signals, attack-responses, knowledge, candidate-profile,
    ai-settings, districts, topics, suggested-questions, citizens, events, team,
    gallery, campaign-videos, hero-settings, home-settings, livestream, onboarding
  superadmin/                   → login + dashboard de tenants/planes

components/
  ui/ chat/ landing/
  admin/                        → Sidebar, Modal, ConfirmDialog, FormField,
                                  Pagination, Badge, PageHeader, charts/
context/  AuthContext.tsx       → token en localStorage (key admin_token), useAuth
lib/      api.ts                → api (público) + adminApi (protegido)
hooks/    useChat.ts
```

---

## Pipeline de ingesta — `ingest/` (Python)

```
app.py                          → FastAPI + Celery app (celery_app)
workers/
  rss_scraper.py                → scraping de medios vía RSS
  youtube_comments.py           → comentarios de YouTube
  twitter_listener.py           → tweets/menciones
  entities_sync.py              → pull del diccionario JNE desde Laravel → Redis
processors/
  classifier.py                → Groq Llama-8B: sentiment, is_attack, topic, entities
  entity_detector.py           → canonicaliza menciones libres → slugs JNE (Fase 6)
  embedder.py                  → embeddings → Qdrant
tests/                          → pytest (entity_detector, classifier, sync integration)
instances/<slug>.env            → config por tenant (INGEST_KEY, LARAVEL_API_URL, REDIS_URL)
```

Flujo: workers → `classifier.classify()` (adjunta `entities`) → push a Laravel
`POST /api/admin/external-signals/ingest` (header `X-Ingest-Key`). El diccionario
de entidades se pullea de `GET /api/ingest/entities` y se cachea en el Redis del
servicio. Detalle en `docs/architecture/09-fase6-checklist.md`.

---

## Convenciones

### Backend
- Validación **siempre en el controller** con `$request->validate([...])`. Nunca confiar en el frontend.
- Respuestas siempre `JsonResponse`.
- Rutas admin: triple middleware `['auth:sanctum', 'admin', 'plan_feature']`.
- **No modificar `CivicAIService` ni los prompts** (`resources/prompts/*.txt`) sin
  probar contra el flujo completo; el parseo del JSON de respuesta es frágil
  (ver `tests/Unit/PepaResponseParsingTest.php` — fuga de `metadata_interna` y
  truncamiento). El núcleo no debe importar `CandidateProfile` directamente.
- Cualquier código fuera del request (job, comando, scheduler) debe envolverse en
  `TenantContext::run($slug, …)`. Nunca asumir la BD por defecto.

### Frontend
- Todos los componentes de cliente llevan `"use client"`.
- `cn()` de `lib/utils` para clases condicionales.
- Llamadas admin usan `adminApi` con el `token` del hook `useAuth()`.
- `FormField`: `as="input"` (default) | `as="textarea"` | `as="select"`.

### Base de datos
- Correr `php artisan migrate` tras cualquier migración nueva. Hay **dos BDs**:
  la `central` (tenants/planes) y la del tenant.
- Seeders idempotentes (`firstOrCreate`), seguros de re-ejecutar.

---

## Variables de entorno

### Laravel (`.env`) — claves relevantes
```env
DB_CONNECTION=mysql            # + conexión 'central' en config/database.php
DB_DATABASE=...                # BD del tenant por defecto en local
APP_TENANT_SLUG=...            # tenant activo en local (en prod: subdominio)
SUPER_ADMIN_KEY=...            # acceso a /api/superadmin/*
INGEST_KEY=...                 # auth del servicio Python de ingest

AI_PROVIDER=claude             # claude | openai
ANTHROPIC_API_KEY=... / CLAUDE_MODEL=...
OPENAI_API_KEY=... / OPENAI_MODEL=...
GROQ_API_KEY=... / GROQ_MODEL=...   # clasificador del ingest
AI_MAX_TOKENS=...

REDIS_HOST/PORT/PASSWORD=...   # cache, sesiones, queue, broker
QUEUE_CONNECTION=...
MEDIA_DISK=...                 # swap a S3 en prod sin tocar código (ver docs)
SANCTUM_STATEFUL_DOMAINS=... / FRONTEND_URL=...
```

### Next.js (`resources/js/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_USE_MOCK=false
```

---

## Despliegue — `deploy/`

`deploy.sh`, `setup-vps.sh`, `backup.sh`, `nginx.conf`, `supervisor.conf`
(workers de cola + scheduler). Detección de tenant por subdominio. `MEDIA_DISK`
permite migrar storage a S3 sin tocar código. Ver `.env.production.example` y
`docs/architecture/05-risks-and-dependencies.md`.

---

## Reglas importantes

- **No hardcodear identidad de candidato en código.** Vive en la BD del tenant
  (`CandidateProfile`, `AiSetting`, documentos RAG). Es la invariante del diseño.
- **No modificar `CivicAIService` ni los prompts** sin validar el flujo completo
  y los tests de parseo (`PepaResponseParsingTest`).
- **Todo job/comando/scheduler corre por tenant** vía `TenantContext`. No asumir la BD por defecto.
- `ResolveTenant` debe seguir corriendo antes de `auth:sanctum` (no tocar el orden
  en `bootstrap/app.php`).
- No eliminar la migración de `role` en `users` — `EnsureIsAdmin` depende del campo.
- Token Sanctum en `localStorage`, key `admin_token`. Un usuario no puede eliminarse a sí mismo.
- Validar `database/data/jne_entities_2026.json` contra el padrón oficial JNE/Infogob
  antes de producción (deuda conocida, ver `09-fase6-checklist.md`).

---

## Tests

```bash
# Laravel
php artisan test
php artisan test --filter="IngestEntityTest|ExternalSignalEntitiesTest|PepaResponseParsing"

# Ingest (Python) — desde ingest/
pip install -r requirements-dev.txt
python -m pytest tests/ -v

# Frontend (Playwright) — desde resources/js
npx playwright test
```
