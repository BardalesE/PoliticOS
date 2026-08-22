# Diagnóstico — Chatbot PEPA

Auditoría de solo-lectura. No se modificó código ni datos. Fecha del análisis: 2026-08-21.
Entorno auditado: local (Laragon), BD por defecto `bdpolitic` (tenant "Marisol Quiñones Castro",
`APP_TENANT_SLUG` vacío → modo single-tenant sobre la BD por defecto).

## Corrección de un supuesto del encargo

El encargo asume una ruta `Next.js → Laravel → microservicio Python RAG → proveedor IA`.
**Esa ruta no existe.** El microservicio Python (`ingest/`) sirve exclusivamente el pipeline
de inteligencia electoral (RSS/YouTube/Twitter → clasificador Groq → `POST
/api/admin/external-signals/ingest`) y el diccionario de entidades JNE (`GET
/api/ingest/entities`, consumido por `ingest/workers/entities_sync.py` vía
`INGEST_SERVICE_URL`/`INGEST_KEY`). Verificado por grep: ninguna de esas dos claves de config
(`services.ingest.url`, `services.ingest.key`) aparece en `ChatController.php` ni en
`CivicAIService.php`.

El RAG del chat es **100% Laravel**: `CivicAIService` llama directamente a
`EmbeddingsServiceInterface` (driver `mysql_fulltext` o `qdrant`, swappeable por
`AI_EMBEDDINGS_DRIVER`) y luego llama directamente por HTTP a Groq/Claude/OpenAI. No hay
salto de red a un servicio Python en el camino crítico del chat. El resto del diagnóstico
se basa en la ruta real.

---

## 1. Ruta exacta del request (end-to-end, con archivo:línea)

**Sin streaming — `POST /api/chat`:**

1. `resources/js/src/app/chat/page.tsx:948` — `fetch(`${API}/chat`, …)`. `API` se arma en
   `page.tsx:49` desde `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api`).
2. `routes/api.php` → grupo `api` (incluye `ResolveTenant`, `app/Http/Middleware/ResolveTenant.php`)
   → `App\Http\Controllers\ChatController::send()` (`app/Http/Controllers/ChatController.php:27`).
3. `ChatController.php:125` → `$this->ai->respond($data['message'], $session)`.
4. `App\Services\CivicAIService::respond()` (`app/Services/CivicAIService.php:64`):
   - `:93-95` detecta tema/distrito/ataque.
   - `:97` → `buildContext()` (`:407-489`) construye el contexto: propuestas (`:422-436`),
     FAQs (`:439-448`), clusters de preguntas (`:451-462`) y **RAG** —
     `:471` `$this->embeddings->search($userMessage, 3, …)`.
     - Driver activo (`config/services.ai.embeddings_driver`, bindeado en
       `app/Providers/AppServiceProvider.php:15-21`): `MySQLFulltextEmbeddings::search()`
       (`app/Services/MySQLFulltextEmbeddings.php:35-64`) → `MATCH(title, content) AGAINST(...)`
       (`:71-77`).
   - `:101` → `callAI()` (`:645-694`) arma la cadena de proveedores (`:648-652`:
     `provider`, `fallback_provider`, `getLastResortProvider()`) y llama
     `callProvider()` (`:728-747`), que despacha a:
     - Groq/OpenAI-compatible: `callOpenCompatible()` (`:776-813`) → HTTP POST a
       `https://api.groq.com/openai/v1/chat/completions` u
       `https://api.openai.com/v1/chat/completions`.
     - Claude: `callClaude()` (`:815-849`) → HTTP POST a `https://api.anthropic.com/v1/messages`.
   - `:107` → `parseAIResponse()` (`:1348-1390`) parsea el JSON (modo PEPA) o el texto plano
     (modo campaña) devuelto por el LLM.
   - `:120` → `mediaFromSources()` (`:1483-1489`) agrega como media tipo `link` cada URL de
     `pepa_metadata.fuentes_citadas` que el LLM devolvió.
5. `ChatController.php:127-137` guarda el `ChatMessage` de respuesta.
6. `ChatController.php:472-491` (`jsonChatResponse()`) arma el JSON de vuelta al frontend.
7. Frontend renderiza `reply` y `media` en `page.tsx`.

**Con streaming — `POST /api/chat/stream`** (usado primero; `sendFallback` en
`page.tsx:945` es el respaldo si el streaming falla): mismo camino de RAG/LLM pero vía
`ChatController::stream()` (`ChatController.php:159`) → `CivicAIService::respondStream()`
(`CivicAIService.php:140`) → `callAIStream()` (`:852-888`) → `streamOpenCompatible()` /
`streamClaude()` (`:931-1005`) → SSE consumido por `page.tsx:879-943`
(`sendStreaming()`).

---

## 2. Dónde se rompe — en el orden pedido

### 2.1 Variables de entorno

**BLOQUEANTE — parcialmente cerrado (PR #5, `chore/declare-ai-fallback-keys`).**
`ANTHROPIC_API_KEY` y `OPENAI_API_KEY` no están configuradas — ni en el `.env` local
(confirmado vía `config('services.ai.claude_key')` / `openai_key` → ambos vacíos) ni en
el blueprint de producción `render.yaml`, que hasta el PR #5 solo declaraba
`AI_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL` — sin entrada alguna para
`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, ni siquiera como `sync: false`. Nombres correctos,
sin errores de tipeo — el problema es que las claves simplemente no existen en ningún
entorno.

**Estado tras el PR #5:** `render.yaml` ya declara las dos variables (mismo patrón que
`GROQ_API_KEY`: `sync: false`, sin valor), así que Render las va a pedir en el próximo
deploy. **Esto no resuelve el fallback todavía** — sigue faltando pegar el valor real de
cada key en el dashboard de Render (Environment del servicio) y, para probarlo en local,
en el `.env`. Sin ese paso manual (fuera del alcance de este repo — son credenciales,
nunca van a un commit), el comportamiento no cambia: Groq sigue siendo el único proveedor
funcional.

Consecuencia directa: `AiSetting::current()` (`app/Models/AiSetting.php:36`) fija
`fallback_provider = 'claude'` por defecto para **todo tenant nuevo**, y
`getLastResortProvider()` (`CivicAIService.php:769-774`) añade `openai` como tercer
intento. Los tres proveedores de la cadena (`groq`, `claude`, `openai`) quedan configurados
en el código, pero solo 1 de 3 tiene credenciales reales. La cadena de fallback es
decorativa: cuando Groq falla, los otros dos fallan también, siempre, por 401.

Evidencia en `storage/logs/laravel.log` (líneas 30180–30528, `2026-07-10 14:04-14:06`,
secuencia repetida cada 10-15s):
```
AI provider 'groq' failed  → HTTP 429 rate_limit_exceeded (TPM 12000, tier on_demand)
AI HTTP error (Claude)     → HTTP 401 "x-api-key header is required"
AI HTTP error (OpenAI...)  → HTTP 401 "You didn't provide an API key"
All AI providers failed    → {"groq_key_set":true,"claude_key_set":false,"openai_key_set":false}
```
Esto no es un evento aislado de esa sesión de pruebas: la configuración que lo causó
(`.env` sin `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, `render.yaml` sin declararlas) sigue
vigente hoy — se verificó en este mismo audit.

**Fix propuesto:** cargar `ANTHROPIC_API_KEY` y/o `OPENAI_API_KEY` reales en `.env` y en
el dashboard de Render (las entradas `sync: false` en `render.yaml` ya están —
PR #5). Alternativa más barata si no se quiere pagar dos proveedores más: cambiar
`fallback_provider` a `null`/mismo `groq` en el `AiSetting` del tenant para que el código
no pierda ~2s por llamada intentando dos proveedores que siempre van a fallar con 401 (no
arregla la falta de redundancia, pero elimina la latencia muerta).

---

### 2.2 ¿El "microservicio Python" está caído?

**No aplica / NO BLOQUEANTE.** Como se explica arriba, el chat no depende de `ingest/` en
absoluto. Si `INGEST_SERVICE_URL` no responde, no afecta al chat — solo afectaría a
`entities_sync.py` (diccionario JNE) y a la ingesta de señales externas para el dashboard
de inteligencia.

---

### 2.3 ¿La cadena de proveedores falla en silencio y cae a un fallback que devuelve el chunk crudo?

**Falla, pero NO en silencio (ya está logueado) y NO devuelve el chunk crudo — BLOQUEANTE
solo por el efecto de "chat degradado", no por fuga de datos.**

Cuando los 3 proveedores fallan, `callAI()` devuelve el centinela `'__AI_RESTING__'`
(`CivicAIService.php:693`), y `respond()` lo intercepta (`:103-104`) devolviendo
`buildRestingResponse()` (`:1048-1076`): un mensaje "necesito un descanso" + lista de
propuestas + media de respaldo. **No es el chunk crudo del documento** — es un mensaje
canned con datos reales pero no generado por IA.

El problema real es la **frecuencia**: con el límite gratuito de Groq (`Limit 12000` TPM,
ver log) y sin fallback funcional, cualquier conversación de más de 4-6 mensajes por
minuto empieza a devolver esta respuesta enlatada en vez de una respuesta sintetizada. En
una demo en vivo esto se percibe exactamente como "el chat está roto": respuestas
genéricas que no atienden la pregunta real. Esto es consecuencia directa del punto 2.1.

---

### 2.4 El prompt de síntesis: ¿existe y recibe el contexto, o se retorna la búsqueda vectorial directo?

**Existe y está bien cableado — el contexto SÍ se inyecta y se le pide sintetizar. NO
BLOQUEANTE en el mecanismo, pero hay un BLOQUEANTE de datos aguas arriba (ver 2.4.1).**

- `resources/prompts/pepa_prompt.txt` (modo activo del tenant auditado, `mode=pepa`) exige
  salida JSON `{"respuesta_usuario": "...", "metadata_interna": {...}}` y prohíbe
  explícitamente inventar enlaces (línea 24-27: *"Usa solo las URLs que vienen en el
  contexto ... nunca inventes enlaces"*).
- `buildContext()` (`CivicAIService.php:407-489`) arma el bloque `DOCUMENTACIÓN
  VERIFICADA POR CANDIDATO` (`formatDocsWithAttribution()`, `:497-547`) SOLO con los
  documentos que `embeddings->search()` efectivamente devolvió, y `appendPromptGuards()`
  (`:621-636`) lo inyecta como `--- CONTEXTO DISPONIBLE PARA ESTA RESPUESTA ---` en el
  system prompt final. El modelo recibe el contexto, no se le entrega la búsqueda cruda
  como respuesta — la síntesis la hace el LLM.

#### 2.4.1 BLOQUEANTE real: no hay contexto real que sintetizar → el LLM improvisa fuentes

Los 2 `KnowledgeDocument` activos del tenant auditado tienen `content = NULL` (verificado
por consulta directa a BD, no por inferencia):

```
id=1 "Plan de gobierno 2026-2030"              content=NULL  source_url=NULL  file_url=<PDF dummy de w3.org>
id=2 "Hoja de vida — Marisol Quiñones Castro"  content=NULL  source_url=NULL  file_url=<mismo PDF dummy>
```

Origen: `database/seeders/DemoContentSeeder.php:294-307` — crea estos dos registros
directamente en BD (sin pasar por `KnowledgeDocumentController::store()`, que es el único
lugar que extrae texto real de un PDF vía `extractText()`, `app/Http/Controllers/
KnowledgeDocumentController.php:163-172`). El propio seeder los etiqueta:
*"Documento de ejemplo para pruebas — reemplazar por el archivo real antes de campaña"*
(`DemoContentSeeder.php:298`). Nunca se reemplazaron.

Con `content = NULL`, `MATCH(title, content) AGAINST(...)` (`MySQLFulltextEmbeddings.php:71-77`)
nunca hace match → `buildContext()` jamás incluye el bloque `DOCUMENTACIÓN VERIFICADA`
para ninguna pregunta. Pero `{{candidatos_con_docs}}` (`CivicAIService.php:597-619`,
`candidatesWithDocs()`) SÍ le dice al modelo que existe documentación para el candidato
activo: como ningún `KnowledgeDocument` tiene `candidate_id` asignado (ambos son `NULL`
también), el query con `whereNotNull('candidate_id')` no devuelve filas y el método cae al
`else` (`:608-611`) que **devuelve el nombre del candidato igual**, sin aclarar que no hay
documentos indexados. El prompt PEPA, que exige citar cada propuesta con
`[Candidato] — [Fuente: URL]`, queda contradicho: cree que hay fuente verificada pero no
recibe ninguna URL real para citar. Con un modelo de instruction-following débil como
Llama-3.3-70B en Groq, esa combinación (instrucción de citar + cero URLs reales
disponibles) es el patrón clásico que produce URLs inventadas — coincide con el síntoma
histórico de "alucina links".

Hay además un segundo gap de código, independiente del dato faltante: `mediaFromSources()`
(`CivicAIService.php:1483-1489`) solo valida que cada URL en `fuentes_citadas` sea
sintácticamente una URL (`filter_var($url, FILTER_VALIDATE_URL)`) — **no verifica que esa
URL pertenezca a alguno de los documentos realmente recuperados por `buildContext()`**. Si
el LLM inventa una URL bien formada, pasa el filtro igual y se le muestra al ciudadano
como `"title": "Fuente verificada"` (línea 1487) — una etiqueta que en este caso sería
falsa.

**Fix propuesto (dos partes, ninguna es refactor):**
1. Dato: subir el PDF real de plan de gobierno / hoja de vida vía el panel admin
   (`/admin/knowledge`, que sí extrae texto con `extractText()` y sí indexa) y asignarles
   `candidate_id`. Esto es un paso operativo, no un cambio de código.
2. Código (pequeño, no refactor): en `mediaFromSources()` (`CivicAIService.php:1483-1489`),
   intersectar `fuentes_citadas` contra las URLs (`source_url`/`file_url`) de los `$docs`
   que `buildContext()` recuperó para ese turno, descartando cualquier URL que el LLM
   haya devuelto pero que no venga de un documento real.

---

### 2.5 Manejo de errores que traga excepciones sin loguear

**Mayormente NO BLOQUEANTE — el manejo de errores en el pipeline de chat está, en general,
bien instrumentado** (`Log::warning`/`Log::error` en cada fallo de proveedor,
`CivicAIService.php:662-693`; `Log::warning` en fallo de FULLTEXT,
`MySQLFulltextEmbeddings.php:52-55`; `Log::error` en excepción fatal del stream,
`ChatController.php:316-317`).

Un solo punto de swallow silencioso con impacto real, ya cubierto en 2.4.1:
`KnowledgeDocumentController::extractText()` (`:163-172`) captura cualquier `\Throwable`
de `Smalot\PdfParser` y devuelve `''` con solo un `Log::warning` — el `store()` (`:39-90`)
sigue creando el documento igual (`is_active: true`, 201 Created) sin content, y el
frontend (`resources/js/src/app/admin/knowledge/page.tsx:151-162`) solo avisa al admin si
`doc.content === ""` (string vacío). Como el registro sembrado por el seeder tiene
`content = NULL` (no `''`), ninguna de las dos condiciones de la UI (`doc.content` truthy
ni `doc.content === ""`) se activa — el admin no ve ni el check verde ni el aviso ámbar
"Sin texto (PDF imagen)". Para el flujo real de subida sí funciona (ahí `extractText()`
siempre devuelve string, nunca null), así que esto solo se manifiesta con filas insertadas
fuera del controller (como el seeder). **NO BLOQUEANTE** por sí solo — es un síntoma
más de 2.4.1, no una causa nueva.

---

### 2.6 Conexión a BD por tenant y estado de las migraciones

**NO BLOQUEANTE.** `php artisan migrate:status` no muestra migraciones pendientes (72
migraciones, todas `Ran`). `APP_TENANT_SLUG` está vacío en `.env`, lo cual es válido:
`ResolveTenant::resolveSlug()` (`app/Http/Middleware/ResolveTenant.php:70-72`) cae a
`next($request)` sin tenant, usando la conexión `mysql` por defecto (`DB_DATABASE=bdpolitic`
en este entorno), que sí tiene datos consistentes (`CandidateProfile`, `AiSetting`,
`Proposal` con contenido real). Es el comportamiento esperado en local single-tenant, no
una ruptura.

---

## 3. Resumen de hallazgos

| # | Hallazgo | Archivo:línea | Severidad | Estado |
|---|----------|----------------|-----------|--------|
| 1 | `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` ausentes en `.env` y en `render.yaml` → cadena de fallback de 3 proveedores es en realidad 1 proveedor sin redundancia; con el TPM=12000 gratuito de Groq, el chat cae a respuesta enlatada cada pocos mensajes | `render.yaml` (bloque IA), `config/services.php:38-51`, `app/Models/AiSetting.php:36` | **BLOQUEANTE** | 🟡 Parcial — `render.yaml` ya declara las 2 vars (PR #5). Falta pegar los valores reales en Render/`.env` (fuera del repo, son credenciales) |
| 2 | `KnowledgeDocument.content = NULL` en los 2 documentos activos del tenant (seed de demo nunca reemplazado) → RAG nunca encuentra nada que citar, pero el prompt PEPA exige citar con URL → el LLM improvisa | `database/seeders/DemoContentSeeder.php:294-307`, `app/Services/MySQLFulltextEmbeddings.php:71-77` | **BLOQUEANTE** | 🟡 Parcial — `buildDocumentationSection()` (PR #4) ya descarta estos docs y avisa en vez de improvisar (ver `RAG_VACIO.md`). Sigue faltando subir los PDFs reales (punto 3 de la lista de abajo) |
| 3 | `mediaFromSources()` no valida que las URLs citadas por el LLM vengan de un documento realmente recuperado — una URL inventada pero bien formada se muestra como "Fuente verificada" | `app/Services/CivicAIService.php:1483-1489` | **BLOQUEANTE** | ✅ Resuelto — PR #4 (`fix/rag-content-vacio`) |
| 4 | `candidatesWithDocs()` afirma "documentación verificada" del candidato activo aunque no exista ningún `KnowledgeDocument` con `candidate_id` asignado (fallback silencioso) | `app/Services/CivicAIService.php:608-611` | NO BLOQUEANTE (agrava #2, no es causa independiente) | Sin cambios |
| 5 | UI admin de Knowledge no distingue `content = NULL` de `content` con texto → un documento sin indexar puede pasar desapercibido | `resources/js/src/app/admin/knowledge/page.tsx:151-162` | NO BLOQUEANTE | Sin cambios |
| 6 | La fuga histórica de `metadata_interna`/JSON crudo (el "chunk crudo" original) ya está parcheada en el código actual (`parseAIResponse`, `extractJsonObject`, `looksLikeStructuredLeak`) — commit `da425a6` | `app/Services/CivicAIService.php:1348-1481` | Ya resuelto — mencionado solo para no reabrirlo por error | — |

---

## 4. BLOQUEANTES ordenados por esfuerzo (menor → mayor)

1. **Cargar `ANTHROPIC_API_KEY` y/o `OPENAI_API_KEY` reales** en `.env` local y en el
   dashboard de Render. 🟡 Las 2 líneas `sync: false` en `render.yaml` ya están (PR #5,
   `chore/declare-ai-fallback-keys`) — falta el valor real, que es una credencial y no
   puede vivir en este repo. — *Config pura, minutos, pero requiere acción manual fuera
   del código.*
2. ~~**Blindar `mediaFromSources()`**~~ ✅ Hecho en PR #4 — descarta cualquier URL citada
   por el LLM que no venga de un documento realmente recuperado por el RAG.
3. **Subir los documentos reales** (plan de gobierno, hoja de vida) vía
   `/admin/knowledge` con `candidate_id` asignado, reemplazando los 2 placeholders del
   seeder. — *Operativo, no requiere código, pero requiere tener el PDF real a mano.*
   Nota: con PR #4 ya mergeado, mientras no se suban los PDFs reales el chat va a
   responder *"no tengo información en los documentos del candidato"* en vez de citar el
   placeholder — más seguro que antes, pero sigue sin poder hablar del plan de gobierno
   real hasta que se suba.

(No se listan el punto 4 ni el 5 del resumen: son NO BLOQUEANTES — no impiden vender ni
demostrar por sí solos, son agravantes/UX del punto 2 y 3 de esta lista.)
