# 02 — Mapa de Separación de Capas

> Auditoría de dónde vive hoy cada módulo vs. dónde debería vivir en PEPA.

---

## Definición de capas

| Capa | Descripción |
|------|-------------|
| **Núcleo cívico** | Código que no cambia entre candidatos: motor RAG, clasificador, retriever, motor de embeddings, IntelligenceService, estructuras de datos |
| **Electoral temporal** | Código ligado al ciclo 2026: seeders de candidatos específicos, fechas de veda, configuraciones de campaña activa |
| **Conocimiento documental** | Datos cargados dinámicamente: propuestas, FAQs, KnowledgeDocuments, señales externas |
| **Branding / personalización** | Todo lo que cambia por tenant/candidato sin tocar lógica: prompts, perfiles, colores, slugs |

---

## Mapa por módulo/archivo

### Backend — Servicios

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `app/Services/CivicAIService.php` | ✅ | — | — | — | **Resuelto** — renombrado desde `JamesAIService`; `detectIdentityQuestion()` ya lee `$this->candidate->name` (branding), no hardcodea nombre |
| `app/Services/EmbeddingsServiceInterface.php` | ✅ | — | — | — | **Mantener** — contrato limpio |
| `app/Services/QdrantEmbeddings.php` | ✅ | — | — | ⚠️ Nombre colección `politicos_{slug}_docs` | **Mantener** — colección es parametrizable |
| `app/Services/MySQLFulltextEmbeddings.php` | ✅ | — | — | — | **Mantener** — ya completamente genérico. Fase 3 (QA chatbot): `extractExcerpt()` puntúa por relevancia real en vez de la primera coincidencia, stopwords en español, filtro de topic soft-retry |
| `app/Services/IntelligenceService.php` | ✅ | — | — | — | **Resuelto** — sin referencias a `role='james'`, queries 100% agnósticas de candidato. Fase 3 (QA analytics): `attackFeed.total_week` ahora SQL COUNT real (no `->count()` de PHP sobre colección truncada); `attack_spike_threshold` parametrizable vía `AiSetting` (antes fijo en 10, ver fila de `GenerateAlertsJob` abajo) |
| `app/Services/GeoIPService.php` | ✅ | — | — | — | **Mantener** — completamente neutral |

### Backend — Jobs

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `app/Jobs/AnalyzeMessageJob.php` | ✅ | — | — | — | **Resuelto** (Fase 3, QA analytics) — `detectDistrict()` tenía 19 distritos de UN candidato (San Miguel/Cajamarca) hardcodeados, no detectado por esta auditoría original. Ahora usa `District::activeKeywordsMap()` del tenant, igual que `CivicAIService`. `scoreSentiment`/`detectConcerns` con límite de palabra + negación básica |
| `app/Jobs/GeolocateSessionJob.php` | ✅ | — | — | — | **Mantener** |
| `app/Jobs/GenerateAlertsJob.php` | ✅ | — | — | — | **Resuelto** (Fase 3) — umbral movido a `AiSetting.attack_spike_threshold` (configurable por tenant, default 10). El baseline horario ya no asume 7 días completos de historia ni se autoincluye la última hora |
| `app/Jobs/ClusterTopQuestionsJob.php` | ✅ | — | — | — | **Mantener** — Fase 3 (QA analytics): corregido bug de ventana (leía 30 días, borraba solo "hoy", duplicaba conteos entre corridas); ahora procesa el día anterior completo, un `analyzed_date` = un snapshot limpio |

### Backend — Controladores

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `app/Http/Controllers/ChatController.php` | ✅ | — | — | — | **Mantener** |
| `app/Http/Controllers/IntelligenceController.php` | ✅ | — | — | — | **Mantener** |
| `app/Http/Controllers/KnowledgeDocumentController.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Http/Controllers/ExternalSignalController.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Http/Controllers/CandidateProfileController.php` | — | — | — | ✅ | **Mantener** — CRUD de perfil de candidato |
| `app/Http/Controllers/AiSettingController.php` | — | — | — | ✅ | **Mantener** |
| `app/Http/Controllers/ProposalController.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Http/Controllers/AdminController.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Http/Controllers/SuperAdminController.php` | ✅ | — | — | — | **Mantener** — CRUD tenants |
| `app/Http/Controllers/AttackResponseController.php` | ✅ | ⚠️ Keywords específicos de campaña | — | ✅ | **Mantener** — datos son del branding, CRUD es núcleo |
| Resto de controladores (Gallery, Events, etc.) | — | — | — | ✅ | **Mantener como branding** del tenant |

### Backend — Middleware

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `app/Http/Middleware/ResolveTenant.php` | ✅ | — | — | — | **Mantener** — fundamental para multi-tenant |
| `app/Http/Middleware/CaptureRequestContext.php` | ✅ | — | — | — | **Mantener** |
| `app/Http/Middleware/EnsureIsAdmin.php` | ✅ | — | — | — | **Mantener** |
| `app/Http/Middleware/EnsureSuperAdmin.php` | ✅ | — | — | — | **Mantener** |

### Backend — Modelos

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `app/Models/KnowledgeDocument.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Models/ChatSession.php` | ✅ | — | — | — | **Mantener** — Fase 3 (QA analytics): `$fillable` le faltaban `geo_province`/`geo_district` (mass-assignment las descartaba, `geoBreakdown()` por provincia/distrito siempre vacío). Ya agregadas |
| `app/Models/ChatMessage.php` | ✅ | — | — | — | **Resuelto** — `role` es `'user'`/`'assistant'` genérico (migración `rename_chat_message_role_james_to_assistant`). Fase 1 (QA chatbot): agregado `is_fallback` para excluir del historial que se manda al LLM las respuestas de "descanso" |
| `app/Models/Topic.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Models/District.php` | ✅ | — | ✅ | — | **Mantener** — cargable desde DB, no hardcoded |
| `app/Models/Proposal.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Models/Faq.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Models/AttackResponse.php` | ✅ | — | — | ✅ | **Mantener** |
| `app/Models/CandidateProfile.php` | — | — | — | ✅ | **Mantener** |
| `app/Models/AiSetting.php` | — | — | — | ✅ | **Mantener** |
| `app/Models/Tenant.php` | ✅ | — | — | — | **Mantener** |
| `app/Models/ExternalSignal.php` | ✅ | — | ✅ | — | **Mantener** |
| `app/Models/IntelAlert.php` | ✅ | — | — | — | **Mantener** |
| `app/Models/VisitorProfile.php` | ✅ | — | — | — | **Mantener** |
| `app/Models/CitizenData.php` | ✅ | — | — | — | **Mantener** |
| `app/Models/QuestionCluster.php` | ✅ | — | — | — | **Mantener** |
| `app/Models/HeroSetting.php` | — | — | — | ✅ | **Mantener** |
| `app/Models/Event.php` | — | ✅ | — | ✅ | **Mantener** |
| `app/Models/TeamMember.php` | — | — | — | ✅ | **Mantener** |
| `app/Models/Setting.php` | — | — | — | ✅ | **Mantener** |

### Prompts

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `resources/prompts/pepa_prompt.txt` | ✅ Mayormente | — | — | ⚠️ `{{candidatos}}` single-tenant | **Extender**: reemplazar `{{candidatos}}` con lista dinámica multi-candidato desde RAG |
| `resources/prompts/politicos_v2_prompt.txt` | — | ✅ | — | ✅ | **Deprecar para PEPA** — mantener disponible para modo SaaS-campaña |

### Seeders

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `database/seeders/DatabaseSeeder.php` | ✅ | — | — | — | **Mantener** — base |
| `database/seeders/DatabaseSeederV2.php` | ✅ | — | — | — | **Mantener** |
| `database/seeders/AdminUserSeeder.php` | ✅ | — | — | — | **Mantener** |
| `database/seeders/TenantSeeder.php` | ✅ | ⚠️ `slug='james'` default | — | — | **Parametrizar** slug desde env |
| `database/seeders/KeikoSeeder.php` | — | ✅ | ✅ | ✅ | **Mover a `/training-data/keiko/`** (ya está allí en patch) — deprecar como seeder activo |
| `database/seeders/RobertoSanchezSeeder.php` | — | ✅ | ✅ | ✅ | Igual |
| `database/seeders/CandidateProfileSeeder.php` | — | ✅ | — | ✅ | **Deprecar** — reemplazar por carga documental |
| `database/seeders/AttackResponseSeeder.php` | ✅ | — | — | — | **Mantener** — genérico |
| `database/seeders/TopicSeederV2.php` | ✅ | — | ✅ | — | **Mantener** |
| `database/seeders/AiSettingSeederV2.php` | ✅ | — | — | ✅ | **Mantener** |
| Resto de seeders (Hero, Events, FAQs, etc.) | — | ✅ | ✅ | ✅ | **Reemplazar por carga desde docs** cuando sea PEPA |

### Ingest (Python)

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `ingest/app.py` | ✅ | — | — | — | **Mantener** — endpoints limpios |
| `ingest/processors/embedder.py` | ✅ | — | — | — | **Mantener** |
| `ingest/processors/classifier.py` | ✅ lógica | ❌ `TARGET_CANDIDATES` hardcoded | — | — | **Generalizar**: `TARGET_CANDIDATES` debe venir de la DB de tenants, no de env default con "james cueva" |
| `ingest/workers/rss_scraper.py` | ✅ lógica | ❌ `TARGET_CANDIDATES` hardcoded | — | — | **Generalizar**: filtro de candidatos debe ser dinámico por tenant |
| `ingest/workers/youtube_comments.py` | ✅ lógica | ❌ mismo problema | — | — | Igual |
| `ingest/workers/twitter_listener.py` | ✅ lógica | ❌ mismo problema | — | — | Igual |

### Directorios especiales

| Directorio | Estado | Acción |
|-----------|--------|--------|
| `politicos-v2-patch (1)/` | ⚠️ Patch ya integrado — directorio duplicado | **Eliminar** tras verificar que nada difiere del main |
| `training-data/` | Seeders de candidatos (Keiko, Roberto) | **Mantener como repositorio** de training data de candidatos; agregar README de cómo añadir uno nuevo |

---

## Resumen ejecutivo por capa

| Capa | Módulos ya limpios | Módulos a limpiar |
|------|-------------------|-------------------|
| **Núcleo cívico** | EmbeddingsInterface, MySQLFulltext, Qdrant, GeoIP, IntelligenceService, CivicAIService (renombrado, ya generalizado), AnalyzeMessageJob (distrito generalizado a `District`), GenerateAlertsJob (umbral parametrizado), ChatMessage (role genérico), todos los Jobs, ResolveTenant, ChatController, Admin CRUD | classifier.py `TARGET_CANDIDATES` (pipeline Python, fuera del alcance de las Fases 1-3 de Laravel/Next.js) |
| **Electoral temporal** | KeikoSeeder, RobertoSanchezSeeder | Mover a training-data/, agregar veda electoral middleware |
| **Conocimiento documental** | KnowledgeDocument, ExternalSignal, Topic, District, Proposal, Faq | Ninguno — ya genérico |
| **Branding** | CandidateProfile, AiSetting, HeroSetting, prompts via DB | politicos_v2_prompt.txt como default, `{{candidatos}}` en pepa_prompt |
