# Auditoría Técnica CTO — PoliticOS

**Fecha:** 4 de julio de 2026
**Alcance:** Auditoría completa de solo lectura (no se modificó ningún archivo).
**Método:** Lectura directa del código fuente vivo, verificando (y corrigiendo) lo que dicen los documentos en `docs/architecture/`, que están parcialmente desactualizados (referencian `JamesAIService`, que ya fue reemplazado por `CivicAIService`).

> **Nota de honestidad intelectual:** Varios riesgos del `05-risks-and-dependencies.md` ya están resueltos en el código actual (RT-01, RT-02, RT-07). Este informe refleja el estado **real** del repositorio hoy, no el histórico.

---

## Resumen ejecutivo (léelo primero)

PoliticOS es un proyecto **bien construido para su etapa**. No es un prototipo desechable: la separación multi-tenant es real, el núcleo de IA no hardcodea al candidato, hay tests, hay documentación de arquitectura, hay rate limiting, headers de seguridad, consentimiento de datos y un diseño de fallback de proveedores de IA que demuestra criterio de ingeniería serio. Esto está por encima del promedio de un SaaS en fase temprana.

Sin embargo, **hay una decisión arquitectónica central que choca frontalmente con tu objetivo de migrar a Supabase**: el sistema usa **una base de datos MySQL física por cada tenant**, conmutada dinámicamente en cada request. Supabase te da **un solo Postgres por proyecto**. Esto no es un detalle de configuración: es el corazón del modelo de aislamiento. Migrar a Supabase tal cual implica o bien un proyecto Supabase por candidato (inviable económicamente, que es justo lo que quieres evitar), o **rediseñar el aislamiento** a esquema-por-tenant o fila-por-tenant con Row Level Security. Es trabajo real, pero acotado y de una sola vez.

**Clasificación global: B — Necesita una refactorización parcial.** No hay que rehacer la arquitectura (no es D), pero tampoco está listo para venderse tal cual con la infraestructura barata que quieres (no es A). El proyecto es sólido; el modelo de datos multi-tenant y un puñado de temas de seguridad son lo que hay que tocar antes de mostrarlo a clientes.

### Respuestas directas a tus 6 preguntas

1. **¿Está bien construido?** Sí, en lo esencial. Arquitectura limpia, buen aislamiento de tenants, núcleo de IA agnóstico al candidato, tests presentes. Los defectos son de madurez (un "god object" de 1.437 líneas, duplicación entre chat sync/stream, muchas queries por mensaje), no de diseño roto.

2. **¿Puede venderse en su estado actual?** **Técnicamente funciona, pero no lo vendería todavía.** Hay 3 bloqueadores de seguridad/robustez que un cliente serio (o su equipo de TI) detectaría: el SuperAdmin protegido por una sola clave estática compartida que además expone credenciales de BD, las contraseñas de BD de tenant guardadas sin cifrar en la tabla central, y `APP_DEBUG=true` como riesgo operativo. Se arreglan en días, no meses.

3. **¿Conviene migrar a Render + Vercel + Supabase?** **Vercel para el frontend Next.js: sí, inmediato y gratis.** **Render para el backend Laravel + workers + cron: sí, es el reemplazo natural del VPS.** **Supabase para la base de datos: solo si primero rediseñas el multi-tenancy** de "BD-por-tenant" a "esquema/fila-por-tenant". Además, el RAG por defecto usa **MySQL FULLTEXT**, que no existe en Postgres — hay que reescribirlo a `tsvector`/`pgvector`. Sin ese trabajo previo, Supabase no encaja.

4. **¿Qué riesgos hay en la migración?** El mayor es la reescritura del aislamiento de datos (alto riesgo de fuga de datos entre candidatos si se hace mal — es dato político sensible). Le siguen: FULLTEXT→Postgres, el churn de reconexión de BD en cada request, Redis (Render lo cobra aparte), el servicio Python/Celery de ingesta (otro servicio pago en Render), y el almacenamiento de archivos que hoy va a disco local del VPS y debe ir a Supabase Storage/S3.

5. **¿Qué cambios son imprescindibles antes de mostrarlo a clientes?** (a) Endurecer el SuperAdmin (dejar de exponer credenciales, no depender de una sola clave estática). (b) Cifrar `db_password` en la tabla `tenants`. (c) `APP_DEBUG=false` garantizado en prod. (d) Verificar el aislamiento de datos con una prueba real de "tenant A no puede ver nada de tenant B". Nada más es estrictamente bloqueante para una demo controlada.

6. **Si fuera mío, ¿qué haría en las próximas 2 semanas?** Semana 1: los 4 arreglos de seguridad + separar frontend a Vercel y backend a Render (sin tocar aún la BD, apuntando a un MySQL gestionado). Semana 2: prueba de carga y de aislamiento, decisión formal sobre Supabase (con un spike técnico del rediseño de tenancy), y limpieza del "god object" solo si sobra tiempo. La razón: primero vendes con infra estable y barata (Render+Vercel+MySQL gestionado), y la migración a Supabase la haces como proyecto separado cuando tengas los primeros clientes pagando, no antes.

---

## FASE 1 — Mapa de arquitectura

### Stack real (verificado en código)

| Capa | Tecnología | Ubicación |
|------|-----------|-----------|
| Backend | Laravel 12 / PHP 8.2, API REST pura | `app/`, `routes/api.php` |
| Frontend | Next.js 15 / React 19 / TS (App Router) | `resources/js/src/` |
| Datos | MySQL — **1 BD por tenant** + BD `central` | `config/database.php`, `ResolveTenant` |
| Cache/colas | Redis en prod; `sync`/`file` en local | `config/queue.php`, `.env` |
| Auth | Sanctum (Bearer) por tenant; SuperAdmin por clave estática | `bootstrap/app.php` |
| IA chat | Claude → OpenAI → Groq (cascada de fallback) | `CivicAIService` |
| RAG | `mysql_fulltext` (default) o Qdrant | `config/services.php` |
| Ingesta | Python 3 / FastAPI / Celery / Redis | `ingest/` |

### Componentes backend
- **27 controladores**, **33 modelos**, **8 servicios**, **7 middlewares**, **6 jobs**.
- Núcleo de IA: `CivicAIService` (1.437 líneas — el archivo más grande y crítico).
- Multi-tenancy: `ResolveTenant` (middleware) + `TenantContext` (para jobs/scheduler/cache).
- **61 migraciones**, de las cuales 4 son de la BD `central` (tenants, planes).

### Flujo de una petición de chat, de extremo a extremo

1. **Navegador** → el usuario abre el frontend Next.js (Vercel/servidor Next) y escribe un mensaje. El frontend llama `POST /api/chat` o `/api/chat/stream` (`resources/js/src/lib/api.ts`, `hooks/useChat.ts`) contra el backend Laravel (`NEXT_PUBLIC_API_URL`).
2. **CORS** (`HandleCors`, prepend global) valida el origen.
3. **`ResolveTenant`** (corre **antes** de `auth:sanctum` por `prependToPriorityList`) resuelve el slug del tenant por subdominio (prod), header `X-Tenant`, query `?tenant=`, o `APP_TENANT_SLUG`. Busca el tenant en la BD `central`, **reescribe `config('database.connections.mysql.*')` con las credenciales del tenant, y hace `DB::purge('mysql') + DB::reconnect('mysql')`**. A partir de aquí, todas las queries van a la BD de ese candidato.
4. **`throttle:30,1`** y **`CaptureRequestContext`** (IP, UA, UTM, device) se aplican al grupo `chat`.
5. **`ChatController::send/stream`** valida el payload, resuelve/crea la `ChatSession` y el `VisitorProfile`, chequea límite mensual del plan (`PlanService::messagesPerMonth` → `COUNT` sobre `chat_messages`), estado de bloqueo, primer mensaje (bienvenida) y moderación de nonsense.
6. **`CivicAIService::respond()`**: sanitiza (anti prompt-injection por regex) → detecta identidad/tema/distrito/ataque → **`buildContext()`** ejecuta varias queries secuenciales (Proposals, FAQs, QuestionClusters) + **RAG** (`embeddings->search()`) → arma el system prompt con placeholders desde `CandidateProfile`/`AiSetting` → **`callAI()`** recorre proveedores en cascada (Claude/OpenAI/Groq) con timeout 30s → parsea la respuesta (texto plano en modo campaña, JSON estricto en modo PEPA).
7. **Media**: `resolveMedia*/resolveAllContent` ejecutan más queries (fotos, videos, PDFs) para adjuntar contenido.
8. **Persistencia**: se guardan `ChatMessage` (user + assistant); se despachan `AnalyzeMessageJob` y `GeolocateSessionJob` `afterResponse()` (si la cola no es `sync`).
9. **Respuesta**: JSON (con cookie `politicos_visitor_id`) o stream SSE token-a-token en modo campaña; en PEPA se bufferiza el JSON completo y se re-trocea (streaming "simulado").

**Observación de flujo:** un solo mensaje de chat dispara fácilmente **10–20 queries** a la BD del tenant antes de la llamada al LLM. Funciona bien con pocos usuarios; es el primer punto a optimizar bajo carga (ver Fase 4).

---

## FASE 2 — Auditoría de calidad de código

Clasificación: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🟢 Bajo

### 🟠 C-1 — "God object": `CivicAIService` (1.437 líneas)
- **Archivo:** `app/Services/CivicAIService.php`
- **Causa:** una sola clase concentra sanitización, detección (identidad/tema/distrito/ataque/nonsense), construcción de contexto RAG, construcción de prompt, llamadas HTTP a 3 proveedores (sync y stream), parseo de JSON, resolución de media (3 métodos que se solapan) y respuestas de fallback.
- **Impacto:** difícil de testear en unidades, difícil de mantener, alto riesgo de regresión al tocar cualquier cosa (el propio `CLAUDE.md` advierte "no modificar sin probar el flujo completo"). Es el cuello de botella de mantenibilidad del proyecto.
- **Solución:** extraer colaboradores sin cambiar comportamiento: `PromptBuilder`, `RagContextBuilder`, `MediaResolver`, `LlmClient` (con implementaciones `ClaudeClient`/`OpenAiClient`/`GroqClient` detrás de una interfaz), `MessageModerator`. `CivicAIService` queda como orquestador delgado. Hacerlo **después** de la migración de infra, con los tests de parseo (`PepaResponseParsingTest`) como red de seguridad.

### 🟠 C-2 — Duplicación masiva entre `send()` y `stream()`
- **Archivo:** `app/Http/Controllers/ChatController.php` (líneas ~27–332)
- **Causa:** `send()` y `stream()` repiten casi idéntica la lógica de: límite de plan, sesión bloqueada, bienvenida, moderación de nonsense y persistencia. `CivicAIService::respond()` y `respondStream()` también se duplican.
- **Impacto:** cualquier cambio de regla de negocio hay que hacerlo en dos sitios; ya es fuente probable de divergencias sutiles.
- **Solución:** extraer un método privado `prepareTurn(Request): TurnDecision` que devuelva la decisión (bloqueado/bienvenida/nonsense/normal) y que ambos endpoints consuman. Reduce ~150 líneas duplicadas.

### 🟡 C-3 — Solapamiento en resolución de media
- **Archivo:** `CivicAIService::resolveMedia()`, `resolveMediaFeatured()`, `resolveAllContent()`
- **Causa:** tres métodos con lógica muy parecida (fotos → videos → PDFs → propuestas) y límites hardcodeados.
- **Impacto:** duplicación + queries redundantes.
- **Solución:** unificar en un `MediaResolver` con estrategia parametrizable (`featured`, `related`, `all`).

### 🟡 C-4 — Historial conversacional cargado completo y recortado en PHP
- **Archivo:** `CivicAIService::getConversationHistory()` (líneas 341–359)
- **Causa:** hace `ChatMessage::where('session_id', …)->get()` (todos los mensajes) y luego `array_slice(-8)` en memoria.
- **Impacto:** en una sesión larga se traen cientos de filas para usar 8. Desperdicio de memoria y BD por cada mensaje.
- **Solución:** `->latest()->limit(16)->get()->reverse()` (traer solo lo necesario) y luego deduplicar roles.

### 🟡 C-5 — Conteo de límite de plan por request
- **Archivo:** `ChatController::send/stream` (chequeo `PlanService::messagesPerMonth`)
- **Causa:** `COUNT(*)` sobre `chat_messages` con `whereMonth/whereYear` en **cada** mensaje.
- **Impacto:** `whereMonth` no usa índice de rango eficientemente; a volumen alto es un escaneo caro por mensaje.
- **Solución:** contador incremental cacheado en Redis por tenant/mes, o una tabla `usage_counters` que se incremente al escribir el mensaje.

### 🟢 C-6 — Documentación de arquitectura desactualizada
- **Archivo:** `docs/architecture/05-risks-and-dependencies.md` y otros.
- **Causa:** referencian `JamesAIService` (ya renombrado a `CivicAIService`), riesgos ya resueltos (RT-01/02/07) y el directorio `politicos-v2-patch` (hoy `docs/v2-patch`).
- **Impacto:** confunde a cualquier dev nuevo (o a un due-diligence de un comprador).
- **Solución:** una pasada de actualización; borrar `docs/v2-patch` si ya está integrado.

### 🟢 C-7 — Ruido en la raíz del repositorio
- **Archivos:** `generate_pptx.py`, `hexisten_solutions_presentacion.pptx`, `landing_bento_*.png` (~2 MB), `landing-robertov2.html`, `index.sql`, `dump.rdb`.
- **Nota positiva:** **no están trackeados en git** (bien: `.gitignore` los cubre). Pero ensucian el working directory y sugieren falta de una carpeta `scratch/`.
- **Solución:** moverlos a `docs/assets/` o `scratch/` (ya ignorado).

**Nota sobre código muerto/memory leaks:** no encontré código muerto significativo ni memory leaks reales en PHP (el runtime request-scoped de Laravel los mitiga). Los "leaks" potenciales son de conexiones (ver Fase 4), no de memoria.

---

## FASE 3 — Auditoría de seguridad

### 🔴 S-1 — SuperAdmin protegido por una única clave estática que además expone credenciales de BD
- **Archivo:** `app/Http/Middleware/EnsureSuperAdmin.php`, `SuperAdminController::getCredentials()`
- **Causa:** todo el panel SuperAdmin (crear/editar/**borrar** tenants, ver stats, **obtener credenciales de BD**, resetear contraseñas) se autoriza con un solo header `X-Super-Admin-Key` comparado contra `config('superadmin.key')`. No hay cuentas de usuario, ni rotación, ni MFA, ni auditoría. Y `getCredentials` **devuelve credenciales sensibles** del tenant.
- **Impacto:** **Crítico.** Una sola clave filtrada (en un log, un `.env` mal manejado, un commit accidental) = control total de **todos** los candidatos y acceso a sus bases de datos. Para un producto que maneja datos políticos sensibles, esto es lo primero que hay que cerrar.
- **Solución:** (a) mover el SuperAdmin a cuentas reales con Sanctum + rol `superadmin` + MFA; (b) que `getCredentials` **nunca** devuelva la contraseña (solo permitir resetear, no leer); (c) registrar cada acción de SuperAdmin en un log de auditoría inmutable; (d) mientras tanto, como mínimo: clave larga rotable + IP allowlist + rate limit más estricto que `throttle:30,1`.

### 🔴 S-2 — Contraseñas de BD de tenant guardadas sin cifrar en la tabla central
- **Archivo:** `app/Models/Tenant.php` (`db_password` está en `$fillable` y `$hidden`, pero **no** en un cast `encrypted`). Contrasta con `admin_password_hint`, que **sí** se cifra con `Crypt`.
- **Causa:** `db_password` es `$hidden` (no sale en JSON) pero se almacena en texto plano en la columna.
- **Impacto:** **Alto.** Cualquiera con acceso de lectura a la BD `central` (backup filtrado, SQLi en central, credencial de solo-lectura) obtiene las credenciales de **todas** las bases de datos de los candidatos.
- **Solución:** castear `db_password` como `encrypted` en el modelo `Tenant` (Laravel lo cifra/descifra transparente con `APP_KEY`). Migración de datos existente para cifrar los valores actuales.

### 🟠 S-3 — `APP_DEBUG=true` en el entorno actual
- **Archivo:** `.env` (local) — `APP_DEBUG=true`.
- **Causa:** correcto en local, pero es la fuente #1 de fugas de stack traces / variables de entorno si se despliega así.
- **Impacto:** Alto **si** llega a producción. El `.env.production.example` correctamente pone `APP_DEBUG=false`, así que es cuestión de disciplina de despliegue, no de código.
- **Solución:** garantizar en el pipeline de Render que `APP_DEBUG=false` y `APP_ENV=production`; añadir un health-check que falle el deploy si `APP_DEBUG` es true en prod.

### 🟡 S-4 — CSP con `unsafe-inline` y `unsafe-eval`
- **Archivo:** `app/Http/Middleware/SecurityHeaders.php`
- **Causa:** `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (comentado como requerido por Next.js en dev).
- **Impacto:** Medio. Debilita la CSP como defensa contra XSS. React ya escapa por defecto, así que el riesgo residual es bajo, pero no es la CSP endurecida que un pentest querría ver.
- **Solución:** en prod, servir el frontend desde Vercel (dominio separado) y en el backend endurecer a `'self'` + nonces; `unsafe-eval` no es necesario en build de producción de Next.

### 🟡 S-5 — Los headers de seguridad no se aplican a respuestas SSE/stream
- **Archivo:** `SecurityHeaders::handle()` — retorna temprano si es `StreamedResponse`.
- **Impacto:** Bajo-Medio. Las respuestas de chat streaming y los chunks de video salen sin `X-Content-Type-Options`, CSP, etc. Es una decisión deliberada (evitar romper el stream), pero deja una superficie sin cubrir.
- **Solución:** aplicar al menos `X-Content-Type-Options: nosniff` y `Cache-Control` a los streams; se puede setear en los headers del propio `StreamedResponse` en `ChatController`.

### 🟢 S-6 — Sanitización anti prompt-injection por regex (defensa parcial)
- **Archivo:** `CivicAIService::sanitize()`
- **Impacto:** Bajo. Los patrones regex son sorteables (multi-idioma, ofuscación). Es defensa en profundidad razonable, no una barrera dura.
- **Solución:** mantenerlo, pero no confiar en ello como control único; el aislamiento real lo dan el system prompt + el hecho de que el modelo no tiene herramientas peligrosas. Documentarlo como "best-effort".

### Lo que está BIEN en seguridad (crédito donde corresponde)
- **Rate limiting** presente y granular en todos los endpoints públicos (`throttle:5,1` login, `30,1` chat, etc.).
- **`ResolveTenant` corre antes de `auth:sanctum`** y el subdominio manda en producción (un header `X-Tenant` falsificado no puede desviar a otro tenant). Diseño correcto.
- **Validación en el controller** con `$request->validate()` en todos los endpoints revisados; sin `raw SQL` con concatenación (Eloquent parametriza). No encontré SQLi.
- **Consentimiento de datos** implementado (`consent_data_capture`, modal) — relevante por Ley 29733 (dato político sensible).
- **Secretos** correctamente en `.env` (no trackeado en git; verificado).
- **Sanctum por tenant**: los tokens viven en la BD del tenant, así que un token no cruza a otro candidato.
- **`admin_password_hint` cifrado** con `Crypt` — la práctica correcta que hay que replicar en `db_password` (S-2).

---

## FASE 4 — Escalabilidad (10 → 100.000 candidatos)

El modelo **BD-por-tenant** define todo el análisis.

| Escala | Qué falla primero | Comentario |
|--------|-------------------|-----------|
| **10** | Nada. | Un solo servidor MySQL + un backend. Cómodo. |
| **100** | `DB::purge + reconnect` en cada request empieza a notarse. | Sigue siendo manejable en un VPS/Render decente. |
| **1.000** | (a) Churn de reconexión de MySQL; (b) migraciones: cada release corre `migrate` sobre 1.000 BDs; (c) el scheduler `forEachTenant` itera 1.000 BDs por cron. | Aquí el modelo BD-por-tenant se vuelve una carga operativa real. |
| **10.000** | Límite de bases de datos y conexiones de un solo servidor MySQL; ventana de mantenimiento de migraciones se vuelve horas; provisioning y backup por-BD se vuelven un sistema en sí mismos. | Necesitas sharding de servidores MySQL o haber migrado a esquema/fila-por-tenant. |
| **100.000** | Insostenible con BD-por-tenant en un solo motor. | Obligatorio: fila-por-tenant con RLS (modelo Supabase) o sharding masivo. |

### Cuellos de botella concretos (con archivo)

1. **🔴 Reconexión por request** — `ResolveTenant.php:45-46` (`DB::purge` + `DB::reconnect`). Rompe el pooling de MySQL. **Bajo carga alta es el primer límite.** Mitigación: usar una conexión `tenant` con config dinámico por request sin purgar la global; o PgBouncer/ProxySQL. (En Supabase con fila-por-tenant, este problema **desaparece** porque no cambias de BD.)

2. **🟠 Migraciones y scheduler O(n·tenants)** — `routes/console.php` + `TenantContext::forEachTenant`. Cada cron y cada deploy escala linealmente con el número de candidatos.

3. **🟠 Muchas queries por mensaje** — `CivicAIService::buildContext` + `resolveMedia*` (10–20 queries/mensaje). Convertir en menos queries agregadas + caché por tenant/topic.

4. **🟡 `COUNT` de límite de plan por mensaje** — ver C-5.

5. **🟡 Historial completo por mensaje** — ver C-4.

### Qué debería ir a colas / workers / caché
- **Ya en colas (bien):** `AnalyzeMessageJob`, `GeolocateSessionJob`, `ClusterTopQuestionsJob`, `GenerateAlertsJob`, geocoding, merge de chunks de stream. El diseño async ya existe.
- **A caché (Redis, namespaced por tenant — `TenantContext::cacheKey` ya lo soporta):** `CandidateProfile`, `AiSetting`, mapas de keywords de `Topic`/`District`/`AttackResponse`, contadores de uso del plan. Estos se leen en cada mensaje y casi nunca cambian.
- **Candidato a microservicio:** el pipeline de ingesta Python **ya es un servicio separado** (`ingest/`) — correcto. El resto del monolito Laravel debe **permanecer monolito**; separarlo prematuramente añadiría complejidad sin beneficio a esta escala.

---

## FASE 5 — Arquitectura de IA

### Cómo funciona hoy (verificado)
- **Prompts:** plantilla en BD (`AiSetting.system_prompt`) o archivo (`resources/prompts/politicos_v2_prompt.txt` campaña, `pepa_prompt.txt` neutro). `buildSystemPrompt()` sustituye placeholders (`{{candidate_name}}`, `{{tone}}`, `{{forbidden_topics}}`, `{{candidatos_con_docs}}`, etc.) desde `CandidateProfile`. **El núcleo no sabe quién es el candidato** — la identidad se inyecta. Esta es la invariante de diseño y está bien respetada.
- **Memoria:** dos niveles. Corto plazo = `getConversationHistory` (últimos ~8 turnos de la sesión). Largo plazo = `VisitorProfile` (segmento, intención, preocupaciones, distrito inferidos) cruzado por `visitor_uuid` entre sesiones. Además `QuestionCluster` aporta "lo que más preguntan los ciudadanos" como aprendizaje agregado.
- **Contexto/RAG:** `EmbeddingsServiceInterface` con dos drivers — `MySQLFulltextEmbeddings` (default, sin infra) y `QdrantEmbeddings` (semántico, colección `politicos_{slug}_docs` aislada por tenant). `buildContext` mezcla propuestas + FAQs + clusters + docs RAG.
- **Documentos:** `KnowledgeDocument` + `KnowledgeDocumentController` (CRUD + reindex). PDFs parseados con `smalot/pdfparser`.
- **Multi-proveedor:** `callProvider()` con `match` sobre `claude`/`openai`/`groq` y **cascada de fallback** (provider → fallback_provider → last-resort). Este es un punto fuerte: cambiar de proveedor es cambiar `AiSetting.provider`.

### Fortalezas
- Abstracción de proveedores ya lista → **cambiar entre OpenAI/Anthropic/Gemini/local es barato**. Solo falta añadir un `case 'gemini'` y un cliente; la arquitectura ya lo permite.
- RAG con interfaz swappable → puedes empezar con FULLTEXT gratis y subir a Qdrant/pgvector sin tocar `CivicAIService`.
- Contrato JSON estricto en PEPA con parseo tolerante (`extractJsonObject`, `firstBalancedJson`) y fallback seguro que **no filtra `metadata_interna`**. Bien pensado.

### Debilidades / mejoras
- **🟡 Reducción de tokens:** el system prompt se reconstruye completo cada mensaje e incluye contexto largo (docs recortados a 2.200 chars × 4). Oportunidades: (a) cachear el prefijo estable del prompt; (b) usar **prompt caching** de Anthropic para la parte fija; (c) recortar el historial por tokens, no por nº de turnos.
- **🟡 Streaming "simulado" en PEPA:** como el output es JSON, se bufferiza todo y se re-trocea en chunks de 30 chars → el usuario no ve nada hasta que el LLM termina. Mejora: separar respuesta-de-usuario (stream real) de metadata (segundo paso), o usar el prompt de texto plano para streaming real.
- **🟡 Gemini/local aún no cableados:** la arquitectura lo permite pero no hay `case` para Gemini ni cliente Ollama. Es una tarde de trabajo.
- **🟢 Añadir un límite de tokens de entrada** (no solo de salida `max_tokens`) para acotar coste por mensaje.

---

## FASE 6 — Viabilidad de migración a Render / Vercel / Supabase

Componente por componente:

| Componente | Destino | Veredicto | Trabajo |
|-----------|---------|-----------|---------|
| **Frontend Next.js** | **Vercel** | ✅ Directo | Casi nada. Solo `NEXT_PUBLIC_API_URL` apuntando al backend en Render. Es el caso de uso natural de Vercel. |
| **Backend Laravel (API)** | **Render** (Web Service, Docker/PHP) | ✅ Encaja | Render corre procesos persistentes → SSE funciona (a diferencia de funciones serverless). Reemplazo natural del VPS. |
| **Workers de cola Laravel** | **Render** (Background Worker) | ✅ Encaja | `queue:work`. Servicio pago adicional. |
| **Scheduler/cron** | **Render** (Cron Jobs) | ✅ Encaja | `schedule:run` cada minuto o crons nativos de Render. |
| **Redis** | **Render Key Value / Upstash** | ⚠️ Cambia | Render lo cobra aparte (no gratis). Alternativa: Upstash serverless. Necesario para colas y caché en prod. |
| **Ingesta Python/Celery** | **Render** (Web + Worker + beat) | ⚠️ Refactor menor | 2–3 servicios más en Render (FastAPI + worker + beat) + su Redis. Coste adicional. Alternativa temprana: apagarlo hasta tener clientes que paguen "inteligencia electoral". |
| **Base de datos MySQL** | **Supabase = Postgres** | 🔴 Bloqueador | Ver abajo. **Este es el punto que rompe la migración directa.** |
| **RAG MySQL FULLTEXT** | **Postgres** | 🔴 Reescritura | `MATCH … AGAINST` no existe en Postgres. Hay que reescribir `MySQLFulltextEmbeddings` a `tsvector`/`ts_rank` o saltar a `pgvector`. |
| **Almacenamiento de archivos** | **Supabase Storage / S3** | ⚠️ Ya preparado | `MEDIA_DISK` ya permite swap a S3 sin tocar código. Apuntar a Supabase Storage (API S3) o S3 real. |
| **Qdrant (opcional)** | Servicio externo / `pgvector` | ⚠️ Opcional | Si se migra a Postgres, `pgvector` reemplaza a Qdrant y elimina un servicio. |

### El bloqueador de Supabase, explicado
El diseño es **una base de datos física por candidato**, conmutada en runtime (`ResolveTenant` reescribe la conexión MySQL). Supabase entrega **un Postgres por proyecto**. Sólo tienes dos caminos:

- **(A) Un proyecto Supabase por candidato** → inviable: es exactamente el gasto que quieres evitar, y no escala operativamente.
- **(B) Rediseñar el aislamiento** a **esquema-por-tenant** (un `schema` Postgres por candidato dentro de una sola BD) o **fila-por-tenant** (`tenant_id` en cada tabla + **Row Level Security**). El modelo fila-por-tenant + RLS es el que Supabase favorece y el que escala a 100k. Es un rediseño acotado pero real: tocar migraciones, modelos (global scope por tenant), `ResolveTenant` (ya no conmuta BD, sólo fija el `tenant_id` de contexto) y una verificación exhaustiva de aislamiento.

**Dependencias que impiden la migración directa a Supabase:** (1) BD-por-tenant; (2) FULLTEXT MySQL en el RAG; (3) cualquier SQL específico de MySQL en migraciones/queries (hay que auditar las 61 migraciones para sintaxis MySQL-only). El resto (Redis, Python, storage, SSE) **no bloquea** — sólo cuesta dinero o refactor menor.

---

## FASE 7 — Decisión técnica

### Veredicto: **B — Necesita una refactorización parcial**

**Por qué no es A (listo para producción):** por tu objetivo específico (Supabase + infra mínima), el multi-tenancy BD-por-tenant y el RAG FULLTEXT requieren rediseño antes de que Supabase sea viable; y hay 3 temas de seguridad (S-1, S-2, S-3) que arreglar antes de clientes reales.

**Por qué no es C/D (rediseñar módulos / rehacer arquitectura):** la arquitectura general es **correcta y bien pensada**. El aislamiento por tenant funciona, el núcleo de IA es agnóstico y extensible, el diseño async ya existe, hay tests y documentación. No hay que rehacer nada estructural salvo **la estrategia de aislamiento de datos** — y eso es un módulo (la capa de tenancy), no la arquitectura entera.

**Matiz importante:** si decidieras **quedarte en MySQL gestionado** (PlanetScale, RDS, o incluso MySQL en Render) en lugar de Supabase, el proyecto está mucho más cerca de **A**: sería Render + Vercel + MySQL gestionado con cambios mínimos, y sólo quedarían los arreglos de seguridad. **Supabase es lo que empuja el veredicto a B.** Vale la pena que decidas conscientemente si Supabase-Postgres es un requisito duro o si un MySQL gestionado barato cumple tu objetivo de "infra mínima" con mucho menos riesgo.

---

## FASE 8 — Roadmap de migración (sin ejecutar nada)

**Estrategia recomendada: migrar en dos olas.** Primero saca el peso del VPS con cambios mínimos (Ola 1); decide Supabase como proyecto aparte (Ola 2). Así empiezas a vender con infra estable y barata sin cargar todo el riesgo de golpe.

### Ola 1 — Salir del VPS con riesgo mínimo (1–2 semanas)
1. **Frontend a Vercel.** Importar `resources/js`, configurar `NEXT_PUBLIC_API_URL`. Deploy de preview. (Bajo riesgo.)
2. **Backend Laravel a Render** como Web Service (Dockerfile PHP 8.2 + nginx/php-fpm). Variables de entorno con `APP_DEBUG=false`, `APP_ENV=production`.
3. **Redis gestionado** (Render Key Value o Upstash). `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`, `SESSION_DRIVER=redis`.
4. **Worker + Cron en Render** (`queue:work`, `schedule:run`).
5. **Base de datos: MySQL gestionado provisional** (mantener el modelo actual; PlanetScale/RDS/MySQL en Render). Cero rediseño de tenancy en esta ola.
6. **Storage a S3/Supabase Storage** vía `MEDIA_DISK=s3` (ya soportado). Migrar los archivos existentes.
7. **Ingesta Python:** decidir si se enciende ya (3 servicios en Render) o se pospone hasta tener clientes que paguen inteligencia electoral.
8. **Arreglos de seguridad S-1/S-2/S-3** (obligatorio antes de exponer a clientes).
9. **Prueba de aislamiento y de carga** en staging antes de apuntar el dominio.

Resultado de la Ola 1: fuera del VPS problemático, en Render+Vercel, con infra elástica y barata, **sin haber tocado el modelo de datos**.

### Ola 2 — Supabase (proyecto separado, sólo si se confirma como requisito)
10. **Spike técnico**: prototipo de aislamiento fila-por-tenant + RLS en Postgres con 2 tenants de prueba.
11. **Reescribir la capa de tenancy**: `tenant_id` en todas las tablas, global scope por tenant en modelos, `ResolveTenant` fija contexto (no conmuta BD), políticas RLS.
12. **Portar las 61 migraciones a Postgres** (auditar sintaxis MySQL-only).
13. **Reescribir el RAG**: `MySQLFulltextEmbeddings` → `tsvector`/`ts_rank` o `pgvector` (y jubilar Qdrant si se quiere menos infra).
14. **Migración de datos** MySQL→Postgres por tenant, con verificación.
15. **Batería de pruebas de aislamiento** (tenant A jamás ve datos de B) — no negociable con datos políticos.
16. Cutover con ventana y rollback plan.

---

## FASE 9 — Plan de refactorización priorizado

### Urgente (antes de mostrar a clientes)
1. **S-1** — Endurecer SuperAdmin: no exponer credenciales, cuentas reales + MFA + auditoría.
2. **S-2** — Cifrar `db_password` en `Tenant` (cast `encrypted` + migración de datos).
3. **S-3** — Garantizar `APP_DEBUG=false`/`APP_ENV=production` en el pipeline de Render.
4. **Prueba de aislamiento de datos** entre tenants (test automatizado que lo demuestre).

### Importante (estabilidad y coste, primeras semanas post-lanzamiento)
5. **RT-04 / cuello #1** — eliminar `DB::purge+reconnect` por request (conexión dinámica sin purgar, o resolver con el rediseño de tenancy de la Ola 2).
6. **C-4 / C-5** — historial con `limit` en query + contador de uso cacheado (no `COUNT` por mensaje).
7. **Caché por tenant** de `CandidateProfile`/`AiSetting`/keyword maps (usar `TenantContext::cacheKey`, ya existe).
8. **S-4 / S-5** — endurecer CSP en prod y aplicar headers mínimos a streams.
9. **Prompt caching de Anthropic** para el prefijo estable → reducción real de tokens/coste.

### Mejoras (cuando haya holgura)
10. **C-1** — descomponer `CivicAIService` en colaboradores (con `PepaResponseParsingTest` de red).
11. **C-2 / C-3** — deduplicar `send()`/`stream()` y unificar resolución de media.
12. **Streaming real en PEPA** (separar texto de metadata).
13. **Añadir proveedor Gemini y opción local (Ollama)** — la arquitectura ya lo permite.
14. **C-6 / C-7** — actualizar docs y limpiar la raíz del repo.

### Dónde está el mayor retorno
- **Máximo impacto en confianza del cliente:** los 4 puntos urgentes (seguridad + aislamiento). Sin ellos no vendes a nadie serio; con ellos, sí.
- **Máximo impacto en coste/escala:** #5, #6, #7, #9 (reconexión, conteos, caché, prompt caching). Reducen tu factura de infra y de tokens, que es exactamente tu preocupación.
- **Máximo impacto en mantenibilidad:** #10 (romper el god object), pero **sólo después** de estabilizar infra — no es urgente y es el más arriesgado de tocar.

---

## Recomendación final del CTO

No hagas la migración a Supabase de golpe. **Separa el problema:** tu dolor real hoy es un VPS de DigitalOcean inestable y caro. Eso se resuelve en 1–2 semanas moviendo el frontend a Vercel y el backend + workers a Render, manteniendo MySQL gestionado y arreglando los 3–4 temas de seguridad. Con eso ya tienes un producto estable, barato y vendible.

Supabase-Postgres es deseable a largo plazo (RLS + fila-por-tenant es lo que te lleva a 100k candidatos), pero es un **rediseño del aislamiento de datos**, no una migración de configuración, y con datos políticos el riesgo de una fuga entre candidatos es serio. Trátalo como un proyecto propio, con su spike y su batería de pruebas de aislamiento, y hazlo cuando tengas clientes pagando que justifiquen el esfuerzo — no antes.

Antes de tocar código, confírmame una decisión: **¿Supabase-Postgres es requisito duro, o un MySQL gestionado barato (PlanetScale/RDS) cumple tu objetivo de "infra mínima"?** Esa sola respuesta cambia si el proyecto es "B con trabajo de rediseño" o "casi A con solo mudanza + seguridad".
