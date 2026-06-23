# 04 — Roadmap de Migración a PEPA

> Cada fase es mergeable a producción sin romper funcionalidad existente.
> Tiempo estimado: conservador, asume 1 dev a tiempo parcial.
> **⚠️ URGENTE**: elecciones el 7 jun 2026 — la Fase 0 es bloqueante para el ciclo actual.

---

## Fase 0 — Higiene urgente (antes del 7 jun 2026)
**Tiempo estimado**: 1-2 días | **Prioridad**: CRÍTICA

### Objetivo
Limpiar deuda técnica inmediata y asegurar el ciclo electoral 2026 sin romper nada.

### Archivos tocados
| Archivo | Cambio |
|---------|--------|
| `politicos-v2-patch (1)/` | Eliminar directorio (es duplicado del código ya integrado) |
| `ingest/.env.example` | Documentar `TARGET_CANDIDATES` como obligatorio, quitar default "james cueva" |
| `ingest/workers/rss_scraper.py` | Comentar que `TARGET_CANDIDATES` default es inseguro para multi-candidato |
| `routes/api.php` | Agregar middleware de veda electoral (6-8 jun 2026) — ver snippet en LEGAL_COMPLIANCE.md |
| `database/seeders/TenantSeeder.php` | Leer slug desde `env('APP_TENANT_SLUG')` sin default hardcodeado |
| `training-data/README.md` | Documentar cómo agregar un candidato nuevo |

### Tests requeridos
- [ ] Chat responde durante campaña normal
- [ ] Chat devuelve mensaje de veda el 6 jun 00:00 Lima
- [ ] Chat vuelve a funcionar el 9 jun

### Criterio de "done"
- Directorio patch eliminado
- `TARGET_CANDIDATES` sin default "james cueva" en env.example
- Veda electoral activa en `routes/api.php`
- LARAVEL_ADMIN_TOKEN documentado como requerido en ingest/.env.example

---

## Fase 1 — Generalizar el clasificador de ingest
**Tiempo estimado**: 2-3 días | **Prioridad**: ALTA

### Objetivo
El clasificador Python deja de filtrar por candidatos hardcodeados. Detecta cualquier candidato peruano mencionado en el texto.

### Archivos tocados
| Archivo | Cambio |
|---------|--------|
| `ingest/processors/classifier.py` | Eliminar `TARGET_CANDIDATES` del prompt. Nuevo comportamiento: detectar CUALQUIER nombre político mencionado + inferir si es candidato. |
| `ingest/workers/rss_scraper.py` | Cambiar `_mentions_candidate()` por `_is_political_content()`: filtrar por contenido político, no por candidato específico |
| `ingest/workers/youtube_comments.py` | Igual |
| `ingest/workers/twitter_listener.py` | Igual |
| `ingest/.env.example` | Agregar `TENANT_SLUGS` (lista de slugs activos para push multi-tenant) |

### Diseño del nuevo clasificador

```python
# Nuevo prompt (sin candidatos hardcodeados):
prompt = """Analiza este texto sobre política peruana.
Texto: "{text}"

JSON:
{
  "sentiment": float -1.0 a 1.0,
  "emotion": "miedo"|"enojo"|"esperanza"|"frustracion"|"alegria"|"neutral",
  "topic": "seguridad"|"economia"|"salud"|"educacion"|"corrupcion"|"transporte"|"agricultura"|"otro",
  "mentioned_politicians": ["nombres de políticos o partidos mencionados"],
  "is_attack": boolean,
  "target_politician": "nombre del político atacado" | null,
  "is_political": boolean
}"""
```

### Tests requeridos
- [ ] Un artículo sobre Keiko se clasifica y `mentioned_politicians` incluye "Keiko"
- [ ] Un artículo sobre Roberto Sánchez funciona igual
- [ ] Un artículo sin política tiene `is_political: false` y no se pushea
- [ ] Multi-tenant push: si `TENANT_SLUGS=keiko,jp`, el mismo artículo llega a ambas DBs

### Criterio de "done"
- `TARGET_CANDIDATES` eliminado de todos los workers
- Tests de clasificación pasan con ≥3 candidatos distintos
- Push multi-tenant documentado y probado

---

## Fase 2 — Renombrar JamesAIService y extraer identidad
**Tiempo estimado**: 1 día | **Prioridad**: ALTA

### Objetivo
El servicio AI deja de tener nombre de candidato. La respuesta de identidad es parametrizable.

### Archivos tocados
| Archivo | Cambio |
|---------|--------|
| `app/Services/JamesAIService.php` | Renombrar clase a `CivicAIService`. Actualizar namespace. |
| `app/Http/Controllers/ChatController.php` | Actualizar referencia a `CivicAIService` |
| `app/Providers/AppServiceProvider.php` | Actualizar binding en IoC container |
| `app/Models/ChatMessage.php` | Cambiar enum `role` de `'james'` a `'assistant'` (o configurable vía `AiSetting.assistant_role_label`) |
| `database/migrations/` | Migración para cambiar valor `role='james'` existente a `role='assistant'` en prod |

### Tests requeridos
- [ ] El chat sigue respondiendo después del rename
- [ ] La respuesta de identidad usa el nombre del candidato del tenant, no "James"
- [ ] Los registros históricos con `role='james'` no se pierden (migración non-destructiva)

### Criterio de "done"
- No existe ningún literal "james" en código de producción (excepto datos históricos en DB)
- `grep -r "JamesAIService\|role.*james" app/` retorna cero resultados

---

## Fase 3 — PEPA como modo de operación estable
**Tiempo estimado**: 3-5 días | **Prioridad**: ALTA post-elecciones

### Objetivo
`pepa_prompt.txt` pasa a ser el prompt por defecto para tenants nuevos. El modo campaña es opt-in.

### Archivos tocados
| Archivo | Cambio |
|---------|--------|
| `resources/prompts/pepa_prompt.txt` | Extender `{{candidatos}}` para recibir lista multi-candidato desde RAG |
| `app/Services/CivicAIService.php` | En `buildSystemPrompt()`: si el prompt es "pepa mode", inyectar lista de candidatos detectados en los documentos indexados, no solo el candidato del perfil |
| `database/seeders/AiSettingSeederV2.php` | Cambiar prompt default a `pepa_prompt.txt` para tenants nuevos |
| `resources/js/src/` | Frontend: badge "PEPA — Asistente Cívico Neutral" visible cuando `mode=pepa` |
| `app/Http/Controllers/ChatController.php` | Propagar `pepa_metadata` al response del frontend |

### Diseño del placeholder multi-candidato

```
# En pepa_prompt.txt línea 10:
# ANTES:  - Candidatos activos en esta sesión: {{candidatos}}
# DESPUÉS: - Candidatos con documentación verificada en esta consulta: {{candidatos_con_docs}}
#          Formato: "Nombre (Partido): N documentos indexados"
```

`CivicAIService::buildSystemPrompt()` genera `{{candidatos_con_docs}}` consultando:
```php
KnowledgeDocument::where('is_active', true)
  ->select('candidate_id', DB::raw('COUNT(*) as docs'))
  ->groupBy('candidate_id')
  ->get()
```
→ Requiere agregar `candidate_id` a `KnowledgeDocument` (nueva migración).

### Tests requeridos
- [ ] Con 3 candidatos indexados, PEPA menciona los 3 en su primera respuesta
- [ ] PEPA no dice por quién votar en ningún escenario
- [ ] PEPA cita fuente verificada cuando existe un documento relevante
- [ ] Modo campaña (`politicos_v2_prompt.txt`) sigue disponible para tenants que lo usen

### Criterio de "done"
- Tenants nuevos usan `pepa_prompt.txt` por defecto
- `pepa_metadata` llega al frontend y se muestra en la UI de chat
- `{{candidatos_con_docs}}` funciona con datos reales

---

## Fase 4 — RAG multi-candidato con atribución de fuente
**Tiempo estimado**: 5-7 días | **Prioridad**: MEDIA

### Objetivo
Cada fragmento de conocimiento está etiquetado con su candidato/partido. PEPA puede comparar propuestas con evidencia documental.

### Archivos tocados
| Archivo | Cambio |
|---------|--------|
| `database/migrations/` | Agregar `candidate_id` (nullable) a `knowledge_documents` |
| `app/Models/KnowledgeDocument.php` | Agregar `candidate_id`, `source_url`, `source_type` (pdf/interview/debate/news) |
| `app/Http/Controllers/KnowledgeDocumentController.php` | CRUD acepta `candidate_id` y `source_url` |
| `app/Services/QdrantEmbeddings.php` | Propagar `candidate_id` y `source_url` al payload del chunk |
| `app/Services/MySQLFulltextEmbeddings.php` | Filtrar por `candidate_id` cuando se pase en `filter[]` |
| `app/Services/CivicAIService.php` | `buildContext()` agrupa docs por candidato antes de inyectar al prompt |
| `resources/prompts/pepa_prompt.txt` | Actualizar instrucción de citado: "Cuando cites una propuesta, incluye: [Candidato] — [Fuente: URL]" |
| `resources/js/src/components/chat/` | Renderizar fuentes citadas como chips con link en la UI |

### Tests requeridos
- [ ] Subir plan de gobierno de Keiko etiquetado `candidate_id=keiko`
- [ ] Subir plan de gobierno de Roberto etiquetado `candidate_id=jp`
- [ ] PEPA compara ambos en la misma respuesta cuando la pregunta lo amerita
- [ ] Cada cita incluye URL verificable
- [ ] Si solo hay docs de un candidato, PEPA lo dice explícitamente

### Criterio de "done"
- `KnowledgeDocument` tiene `candidate_id` y `source_url`
- RAG retorna atribución por candidato
- Frontend muestra fuentes con links

---

## Fase 5 — Super Admin multi-tenant + onboarding de candidatos
**Tiempo estimado**: 3-5 días | **Prioridad**: MEDIA

### Objetivo
El flujo completo de "añadir un candidato nuevo" es self-service desde el super admin.

### Archivos tocados
| Archivo | Cambio |
|---------|--------|
| `app/Http/Controllers/SuperAdminController.php` | Endpoint `POST /superadmin/tenants/{id}/provision` que crea DB + corre migrations + seeder base |
| `app/Console/Commands/ProvisionTenant.php` | Nuevo command artisan para provisioning |
| `resources/js/src/app/admin/` | Wizard de onboarding: paso 1 perfil candidato → paso 2 subir documentos → paso 3 preview del chat |

### Criterio de "done"
- En <10 minutos se puede tener un tenant nuevo con documentos indexados y chat funcionando
- Sin tocar código PHP ni Python

---

## Fase 6 — Detección automática de entidades en ingest  ✅ IMPLEMENTADA (2026-06-12)
**Tiempo estimado**: 5-7 días | **Prioridad**: BAJA (post-elecciones 2026)

### Objetivo
El clasificador Python canonicaliza candidatos/partidos/regiones a slugs JNE,
para que la inteligencia electoral pueda agregar por rival/partido/región
(las `mentions` del LLM son strings libres: "Keiko", "Fujimori" y "la lideresa
de Fuerza Popular" llegaban como tres strings distintos).

### Cambios de diseño respecto al plan original
- **NER ya existía desde Fase 1**: `classifier.py` detecta cualquier político
  vía Groq (`mentioned_politicians`). La Fase 6 NO agrega NER; agrega la capa
  de **canonicalización** contra un diccionario JNE.
- **`POST /entities/sync` → invertido a pull (`GET /api/ingest/entities`)**:
  tras la Fase 1B las instancias por candidato corren solo redis + worker +
  beat (sin FastAPI), así que un endpoint HTTP en el ingest no tendría quién lo
  escuche. En su lugar, una task de beat (diaria + al boot) pullea el
  diccionario de Laravel con la `X-Ingest-Key` existente y lo cachea en el
  Redis de la instancia. Cero puertos nuevos, cero auth nueva.

### Archivos tocados
| Archivo | Cambio |
|---------|--------|
| `database/data/jne_entities_2026.json` | Dataset: candidatos presidenciales 2026 + partidos + 27 circunscripciones, con aliases y slugs. ⚠ Generado de conocimiento general — validar contra padrón JNE antes de producción |
| `app/Http/Controllers/IngestEntityController.php` | `GET /api/ingest/entities` (global, protegido con `ingest_key`, sin `plan_feature`) |
| `routes/api.php` | Ruta del endpoint |
| `ingest/data/jne_entities_2026.json` | Copia bundled del dataset (fallback offline) |
| `ingest/processors/entity_detector.py` | Matching por diccionario (sin tildes, case-insensitive, word-boundary; aliases-sigla exigen mayúsculas). Lee Redis con fallback al bundled |
| `ingest/workers/entities_sync.py` | Task de sync pull (beat diario 4:30 + `worker_ready`) → Redis |
| `ingest/app.py` | Registra la task en `include` y `beat_schedule` |
| `ingest/processors/classifier.py` | `_normalize`/`_fallback_classify` pasan texto+menciones por el detector → campo `entities`. `is_attack` intacto |
| `ingest/workers/{rss_scraper,twitter_listener,youtube_comments}.py` | Propagan `entities` al payload |
| `database/migrations/2026_06_12_000001_add_entities_to_external_signals.php` | Columna JSON nullable `entities` (retrocompatible) |
| `app/Http/Controllers/ExternalSignalController.php` | Valida `entities` en el ingest (reglas extraídas a `ingestRules()`) |
| `app/Models/ExternalSignal.php` | `entities` en `$fillable` + cast `array` |

### Criterio de "done"
- ✅ Sin configurar `TARGET_CANDIDATES`, el detector reconoce ≥80% de los
  candidatos presidenciales del dataset 2026 en titulares de prensa
  (`ingest/tests/test_entity_detector.py::test_detects_at_least_80_percent_of_candidates`,
  hoy 16/16 = 100%).

### Tests
- `ingest/tests/test_entity_detector.py` (15) — matching, criterio 80%, partidos, distritos
- `ingest/tests/test_classifier_entities.py` (5) — integración fallback + canonicalización
- `tests/Feature/IngestEntityTest.php` (3) — endpoint + auth `ingest_key`
- `tests/Feature/ExternalSignalEntitiesTest.php` (6) — validación + cast + retrocompat

### Deuda / seguimiento
- Validar `jne_entities_2026.json` contra el padrón oficial JNE/Infogob antes
  de producción (la lista nace de conocimiento general, cutoff ene-2026).
- La cola larga municipal/regional (4-oct-2026) no se seedea: queda al LLM.
- Bug latente pre-existente (no de Fase 6): `CheckPlanFeature` hace
  `app('tenant')`, que lanza si el binding es `null` (quirk `isset`+null del
  container) en vez de devolver null. No se manifiesta en prod porque siempre
  resuelve un tenant real (single-tenant por `tenant_slug`; VPS por `X-Tenant`).

---

## Orden de prioridad por estado del proyecto

```
URGENTE (antes jun 2026):  Fase 0 → Fase 1
POST-ELECCIONES:           Fase 2 → Fase 3 → Fase 4
LARGO PLAZO:               Fase 5 → Fase 6
```

---

## Reglas del roadmap

1. **Cada fase es una PR independiente** — no se mezclan fases.
2. **Sin feature flags** — si una fase no está lista, no entra.
3. **Migrations non-destructivas** — siempre `nullable()` para campos nuevos, nunca borrar columnas en la misma migración que las agrega.
4. **El modo campaña no se depreca** — `politicos_v2_prompt.txt` permanece disponible para tenants que lo usen explícitamente.
5. **No tocar datos de producción** — los seeders de Keiko y Roberto son históricos, no se eliminan.
