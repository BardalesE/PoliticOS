# Diagnóstico — RAG devuelve contexto vacío

Auditoría de solo-lectura, ejecutada con `php artisan tinker` (consultas) y lectura de código.
No se modificó código ni datos. Rama: `fix/pepa-hallucinated-sources`.

## Aviso sobre "tenant actual" — léase antes del resto

No hay forma de saber desde el backend, con certeza, a qué tenant apunta el navegador del
usuario ahora mismo: `resources/js/.env.local` (donde viviría `NEXT_PUBLIC_TENANT_SLUG`) está
bloqueado por permisos de lectura en este entorno. Por eso este reporte investiga **dos
escenarios reales de la BD `central`** y deja explícito cuál corresponde a cada uno:

| Escenario | Cómo se llega ahí | Documentos | Coincide con "solo hay un documento un PDF" |
|---|---|---|---|
| **A. `bdpolitic`** (BD por defecto, sin `X-Tenant`/subdominio) | Cualquier request a `/api/chat` sin tenant resuelto — `APP_TENANT_SLUG` está vacío en `.env` local, así que `ResolveTenant` cae a la conexión `mysql` por defecto | 2 (`Plan de gobierno 2026-2030`, `Hoja de vida — Marisol Quiñones Castro`) | ❌ No — hay 2, no 1 |
| **B. tenants `rigo` / `qa-elite`** (BD propia, requiere `X-Tenant: rigo` o `qa-elite`) | Solo si el frontend manda ese header (vía subdominio en prod o `NEXT_PUBLIC_TENANT_SLUG`/`?tenant=` en local) | 1 cada uno | ✅ Sí |

Como no pude confirmar cuál de los dos es el que estás probando, corrí el diagnóstico
completo contra **ambos**. El resultado es distinto en cada uno — ver punto 5.

---

## 1. Cuántos `KnowledgeDocument` hay y cuántos tienen contenido indexado

Nota de terminología: el driver de RAG activo (`config('services.ai.embeddings_driver')`,
verificado = `mysql_fulltext`) **no genera un vector de embedding** — no hay llamada a
ningún modelo de embeddings. "Indexado" aquí significa: `content` fue extraído del PDF,
trozado en `chunks`, y `embeddings_indexed = true`. Uso este significado abajo.

**Escenario A — `bdpolitic` (default):**

| id | title | `content` | `chunks` | `embeddings_indexed` |
|---|---|---|---|---|
| 1 | Plan de gobierno 2026-2030 | **NULL** (0 chars) | NULL | `false` |
| 2 | Hoja de vida — Marisol Quiñones Castro | **NULL** (0 chars) | NULL | `false` |

Total: **2 documentos, 0 con contenido indexado, 2 con `content` NULL.**

**Escenario B — tenants con exactamente 1 PDF:**

| tenant | id | title | `content` | `chunks` | `embeddings_indexed` |
|---|---|---|---|---|---|
| `rigo` | 1 | EL MAÑANERO DOC | 15.200 chars | 6 | `true` |
| `qa-elite` | 1 | qa elite test document | 222 chars | 1 | `true` |

Total: **1 documento cada uno, con contenido indexado correctamente.**

---

## 2. ¿Qué proceso genera el contenido/índice? ¿Está corriendo?

**No es un comando artisan ni un job en cola — es síncrono, dentro del propio request HTTP
de subida.** Verificado por grep en `app/Console/Commands/` (4 comandos: ninguno toca
`KnowledgeDocument`/embeddings) y en `app/Jobs/` (ninguna coincidencia). El único disparador
es:

- `KnowledgeDocumentController::store()` (`app/Http/Controllers/KnowledgeDocumentController.php:39`)
  → extrae texto del PDF con `extractText()` (`:163`, vía `Smalot\PdfParser`) →
  si `$content` no está vacío, llama `$this->embeddings->index(...)` en la misma línea de
  request (`:88`). No hay reintento en background si la extracción falla o si el proceso
  se interrumpe.
- `KnowledgeDocumentController::reindex()` (`:134`, endpoint `POST
  /api/admin/knowledge/{id}/reindex`) — también síncrono, y **explícitamente rechaza
  documentos sin contenido**: `if (empty($doc->content)) return response()->json([...], 422)`.
  Es decir, ni siquiera este botón de "reindexar" puede arreglar los 2 documentos del
  Escenario A, porque no hay contenido del cual partir — reindexar no resuelve nada aquí.

**¿Por qué el Escenario A tiene `content = NULL` entonces?** Esos 2 registros no se crearon
vía `store()` — se insertaron directo en la tabla por `database/seeders/DemoContentSeeder.php:294-307`
(`KnowledgeDocument::updateOrCreate(...)`), que nunca setea `content` ni llama a
`$embeddings->index()`. El propio seeder los etiqueta: *"Documento de ejemplo para pruebas —
reemplazar por el archivo real antes de campaña"* (línea 298). El "proceso que genera
embeddings" nunca corrió sobre ellos porque nunca se les subió un archivo real por el
panel — no es que el proceso falló o está caído, es que **nunca se invocó para estos 2
registros**.

Para el Escenario B (`rigo`, `qa-elite`), el proceso sí corrió — `embeddings_meta` de
ambos documentos tiene `indexed_at` con fecha real, consistente con haber pasado por
`store()`.

---

## 3. Trace de `buildContext()` paso a paso

`CivicAIService::buildContext()` (`app/Services/CivicAIService.php:417-503`), llamada desde
`respond()`/`respondStream()` antes de invocar al LLM:

1. Propuestas (`Proposal`, filtradas por `topic`/`district` si se detectaron) — no es RAG,
   es una tabla aparte.
2. FAQs (`Faq`) — igual, tabla aparte.
3. `QuestionCluster` (patrones de preguntas) — igual.
4. **RAG** — línea `:484`:
   ```php
   $docs = $this->embeddings->search($userMessage, 3, $topic ? ['topic' => $topic] : []);
   ```
   - `topK = 3`.
   - **El único filtro que se pasa es `topic`** (cuando `detectTopic()` encontró uno). **No
     se pasa `candidate_id`**, aunque el método `search()` de ambos drivers lo soporta —
     esto es relevante en tenants PEPA multi-candidato, no en el problema reportado aquí
     (con 1 candidato no cambia el resultado).
   - **No existe filtro de `tenant_id`** en esta query, y tampoco debería existirlo: el
     aislamiento multi-tenant de este proyecto es por **base de datos física completa**
     (una BD por tenant), no por columna compartida — lo confirma `CLAUDE.md` y
     `ResolveTenant` (cambia `database.connections.mysql.database` antes de que corra
     cualquier query). Verifiqué que la conexión activa en cada prueba correspondía al
     tenant correcto (`config('database.connections.mysql.database')` = `bdpolitic` en A,
     `bdpolitic_rigo`/`politicos_qa_elite` en B vía `TenantContext::run()`). **No hay
     mezcla de tenants ni filtro de tenant mal aplicado.**
   - **No existe ningún umbral de similitud configurable en el código.** El driver activo
     (`MySQLFulltextEmbeddings`) no usa similitud coseno — usa MySQL FULLTEXT
     (`MySQLFulltextEmbeddings.php:66-87`, `runFulltextQuery()`):
     ```sql
     SELECT ..., MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
     FROM knowledge_documents
     WHERE is_active = 1
       AND MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE)
     ORDER BY relevance DESC LIMIT 3
     ```
     El `WHERE MATCH(...)` (sin comparar contra un número) es binario: MySQL decide
     internamente si hay coincidencia o no — no hay un `->where('relevance', '>', 0.x)`
     en el código que se pueda estar configurando "muy alto". Si algún día se activa el
     driver `qdrant` (`AI_EMBEDDINGS_DRIVER=qdrant`, no es el caso ahora — confirmado por
     `config('services.ai.embeddings_driver') === 'mysql_fulltext'`), tampoco hay umbral
     ahí: `QdrantEmbeddings::search()` (`app/Services/QdrantEmbeddings.php:93-139`) pide
     `topK` resultados sin filtrar por score mínimo.
   - Importante: el índice FULLTEXT es **compuesto sobre `title` Y `content` juntos**
     (`MATCH(title, content)`). Esto significa que un documento con `content = NULL` puede
     igual "matchear" si la consulta comparte palabras con el **título** — ver punto 4,
     es justo lo que pasa con el doc 1 del Escenario A.
5. Si `$docs` no viene vacío, se arma el bloque `DOCUMENTACIÓN VERIFICADA` (modo PEPA,
   `formatDocsWithAttribution()`) con el excerpt de cada doc (`extractExcerpt()`,
   `MySQLFulltextEmbeddings.php:176-227`) — y si `content` es NULL/vacío, `extractExcerpt()`
   devuelve `''` (línea 178: `if (!$content) return '';`).

---

## 4. Consulta de prueba — resultado real en cada etapa

**No hay "embedding de la pregunta"** en ninguno de los dos escenarios: el driver activo
(`mysql_fulltext`) no genera vectores, así que ese paso simplemente no existe en este
pipeline hoy. Lo que sí generé es el score de relevancia FULLTEXT real.

### Escenario A — `bdpolitic`, pregunta: *"cuáles son tus propuestas de gobierno"*

```
RAW MATCH AGAINST (todas las filas, sin WHERE):
  id=1 "Plan de gobierno 2026-2030"              relevance=0.0906190574169159
  id=2 "Hoja de vida — Marisol Quiñones Castro"  relevance=0.0

search() del driver activo → 1 resultado:
  doc_id=1  title="Plan de gobierno 2026-2030"  score=0.0906...
  excerpt = ''   ← VACÍO (extractExcerpt() sobre content=NULL)
  metadata.file_url = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"

Contexto final ensamblado por buildContext() (906 chars):
  PROPUESTAS DEL CANDIDATO: [4 propuestas reales de la tabla Proposal, con presupuesto]

  DOCUMENTACIÓN VERIFICADA POR CANDIDATO (cita siempre con [Candidato] — [Fuente: URL]):
  === Material general (sin candidato específico) ===
  — Plan de gobierno 2026-2030 [documento oficial]
    [Fuente: https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf]
  ←←← sin texto debajo — el "documento" es un título + una URL sin contenido real
```

Con una pregunta que **no** comparte palabras con el título del documento (probado con
*"qué planes tienes contra la delincuencia y seguridad ciudadana"*), `search()` devuelve
`[]`, la sección `DOCUMENTACIÓN VERIFICADA` desaparece por completo, y el contexto queda
reducido a solo las 4 propuestas hardcodeadas en la tabla `Proposal` (634 chars, cero RAG).

**Este es el bug real, más preciso que "contexto totalmente vacío":** cuando la pregunta
toca el título del único doc, el LLM recibe una cita "verificada" con una URL real (la
del PDF placeholder de w3.org) **pero cero texto de respaldo** — le entrega al modelo el
molde exacto para inventar contenido y colgarlo de una fuente que existe pero está vacía.
Cuando la pregunta no toca el título, el RAG simplemente no aporta nada.

### Escenario B — tenant `rigo`, pregunta: *"cuánto necesito para invertir en el negocio de desayunos"*

```
search() → 1 resultado:
  doc_id=1  title="EL MAÑANERO DOC"  score=(alto, match real en content)
  excerpt = "EL MAÑANERO Desayunos frente a UCV Chepén PLAN DE NEGOCIO INTEGRAL..." (1200 chars reales)

Contexto final (1473 chars) incluye el excerpt completo con cifras reales
("Inversión inicial S/ 3,000 - S/ 4,500...") y su URL real de Storage.
```

Aquí el RAG **funciona como está diseñado** — recupera y cita contenido real. Si el chat
de este tenant igual muestra "contexto vacío" en producción, la causa no está en
`buildContext()`/`MySQLFulltextEmbeddings` sino en otra capa (cadena de proveedores de IA
cayendo a `__AI_RESTING__`, ya documentado en `DIAGNOSTICO_CHAT.md`).

---

## 5. Causa — una línea

**Depende del tenant que estés probando (ver aviso al inicio):**

- **Si es `bdpolitic`** (el que se usa sin `X-Tenant`/subdominio, y el que veo por defecto
  en este entorno): **(b) hay documentos sin contenido indexado** — más precisamente,
  `content = NULL` porque los 2 registros los creó `DemoContentSeeder` directo en la BD
  sin pasar por el flujo de subida real (que es el único lugar que extrae texto e indexa).
  No es un umbral ni un filtro de tenant — es que no hay texto que buscar.
- **Si es `rigo` o `qa-elite`** (los tenants que sí tienen exactamente 1 PDF, como
  describiste): **(e) otra — no es el RAG.** Confirmé con consulta real que `buildContext()`
  recupera y cita el contenido del documento sin problema. Si ahí ves contexto vacío en el
  chat real, hay que mirar la cadena de proveedores de IA (`DIAGNOSTICO_CHAT.md`, hallazgo
  #1), no `buildContext()`.

Si me confirmas el slug exacto del tenant que estás probando (o si puedes pegarme el
contenido de `resources/js/.env.local` — yo no pude leerlo por permisos), reduzco esto a
un solo diagnóstico definitivo en vez de dos.
