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
| `app/Services/JamesAIService.php` | ✅ Mayormente | — | — | ⚠️ Parcial | **Generalizar**: renombrar a `CivicAIService`, extraer `detectIdentityQuestion()` (usa nombre del candidato) a capa branding |
| `app/Services/EmbeddingsServiceInterface.php` | ✅ | — | — | — | **Mantener** — contrato limpio |
| `app/Services/QdrantEmbeddings.php` | ✅ | — | — | ⚠️ Nombre colección `politicos_{slug}_docs` | **Mantener** — colección es parametrizable |
| `app/Services/MySQLFulltextEmbeddings.php` | ✅ | — | — | — | **Mantener** — ya completamente genérico |
| `app/Services/IntelligenceService.php` | ✅ | ⚠️ Parcial | — | — | **Generalizar**: tiene referencias a `role='james'` implícitas; queries agnósticas de candidato |
| `app/Services/GeoIPService.php` | ✅ | — | — | — | **Mantener** — completamente neutral |

### Backend — Jobs

| Archivo | Núcleo | Electoral | Documental | Branding | Acción |
|---------|--------|-----------|------------|----------|--------|
| `app/Jobs/AnalyzeMessageJob.php` | ✅ | — | — | — | **Mantener** — clasificador agnóstico |
| `app/Jobs/GeolocateSessionJob.php` | ✅ | — | — | — | **Mantener** |
| `app/Jobs/GenerateAlertsJob.php` | ✅ | ⚠️ Umbral hardcodeado (10 ataques) | — | — | **Parametrizar** umbrales de alerta |
| `app/Jobs/ClusterTopQuestionsJob.php` | ✅ | — | — | — | **Mantener** |

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
| `app/Models/ChatSession.php` | ✅ | — | — | — | **Mantener** |
| `app/Models/ChatMessage.php` | ✅ | ⚠️ | — | — | **Parametrizar**: el valor `'james'` en `role` debe ser `'assistant'` o configurable |
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
| **Núcleo cívico** | EmbeddingsInterface, MySQLFulltext, Qdrant, GeoIP, IntelligenceService, todos los Jobs, ResolveTenant, ChatController, Admin CRUD, todos los modelos excepto ChatMessage role | JamesAIService (nombre + identity), classifier.py TARGET_CANDIDATES, GenerateAlertsJob umbrales |
| **Electoral temporal** | KeikoSeeder, RobertoSanchezSeeder | Mover a training-data/, agregar veda electoral middleware |
| **Conocimiento documental** | KnowledgeDocument, ExternalSignal, Topic, District, Proposal, Faq | Ninguno — ya genérico |
| **Branding** | CandidateProfile, AiSetting, HeroSetting, prompts via DB | politicos_v2_prompt.txt como default, `{{candidatos}}` en pepa_prompt |
