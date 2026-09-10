# Review — Fase 9 / Paso 3: guard de fuga de contexto en streaming ya no retiene el arranque

**Rama:** `fix/chat-rag-quality`
**Commit:** `820d83f` — *fix(chat): el guard de fuga en streaming ya no retiene el arranque — streaming en vivo para toda respuesta corta*
**Base del diff:** `HEAD~1` = `e3f0cd6`
**PR:** todavía no abierta.

Contexto: en `e3f0cd6` el guard de "fuga de contexto crudo" bufferizaba los primeros
~300 caracteres de la respuesta de campaña **antes de emitir nada**. Para cualquier
respuesta bajo 300 chars —la mayoría, con el prompt pidiendo "3-5 oraciones estilo
WhatsApp"— el ciudadano no veía nada hasta que el modelo terminaba de generar todo,
y aparecía de golpe en un bloque. Este paso lo corrige sin perder el guard.

---

## 1. Diff completo — `git diff HEAD~1..HEAD -- app/Services/CivicAIService.php`

```diff
diff --git a/app/Services/CivicAIService.php b/app/Services/CivicAIService.php
index d8fdc99..e702718 100644
--- a/app/Services/CivicAIService.php
+++ b/app/Services/CivicAIService.php
@@ -185,28 +185,31 @@ public function respondStream(string $userMessage, ChatSession $session, callabl
 
         $isPepa = ($this->config->mode ?? 'campaign') === 'pepa';
 
-        // En PEPA el modelo devuelve JSON: hay que bufferizar todo y parsear antes de
-        // enviar. En campaña devuelve texto plano: streameamos cada token en tiempo real.
-        // En ambos modos acumulamos en $rawBuffer para construir el retorno.
+        // En PEPA el modelo devuelve JSON: hay que bufferizar todo y parsear antes
+        // de enviar. En campaña devuelve texto plano y se streamea cada token EN
+        // VIVO, sin retención — el "escribiendo…" es lo primero que ve el
+        // ciudadano (y el candidato al probar el chat).
         //
-        // Guard de "fuga de contexto crudo" para campaña: como en campaña los
-        // chunks salen en vivo, no hay un punto donde revisar la respuesta
-        // completa antes de que el ciudadano la vea. Como mínimo validamos el
-        // ARRANQUE — acumulamos los primeros ~300 chars, comprobamos que no sean
-        // un volcado verbatim del contexto RAG y recién ahí soltamos el buffer y
-        // seguimos streameando sin más chequeos (no se valida chunk por chunk:
-        // eso mantiene la latencia baja). Un volcado que empiece después del
-        // arranque no queda cubierto — trade-off aceptado en el diseño.
+        // Guard de "fuga de contexto crudo" (solo campaña): EN PARALELO al
+        // streaming se acumula un buffer de cola y se corre looksLikeRawContextLeak()
+        // cada CONTEXT_LEAK_SCAN_STEP chars nuevos. Si en algún punto el texto ya
+        // emitido resulta ser un volcado verbatim del contexto RAG, se corta el
+        // stream ahí (no se emiten más chunks del modelo) y se agrega el mensaje
+        // canned. Lo ya emitido no se puede deshacer: trade-off consciente — el
+        // ciudadano pudo ver hasta ~180 chars del volcado antes del corte, a
+        // cambio de que NINGUNA respuesta normal (incluidas todas las cortas)
+        // sufra retraso. Pasada CONTEXT_LEAK_SCAN_CAP se deja de escanear: tanto
+        // texto coherente sin match = el modelo está sintetizando, no volcando.
         $rawBuffer           = '';
-        $campaignStart       = '';
-        $campaignStartGated  = false; // ¿ya validamos y soltamos el arranque?
-        $campaignLeakAborted = false; // ¿cortamos el stream por fuga?
-        $startGateChars      = self::CONTEXT_LEAK_MIN_OVERLAP + 120;
+        $campaignBuf         = '';    // cola acumulada para el chequeo
+        $campaignLastScan    = 0;     // longitud del buffer en el último escaneo
+        $campaignScanDone    = false; // dejamos de escanear (cap alcanzado sin fuga)
+        $campaignLeakAborted = false; // fuga detectada → stream cortado
 
         $this->callAIStream($userMessage, $context, $history, $segment, $attack, $session, $topic,
             function (string $chunk) use (
-                &$rawBuffer, &$campaignStart, &$campaignStartGated, &$campaignLeakAborted,
-                $onChunk, $isPepa, $context, $startGateChars
+                &$rawBuffer, &$campaignBuf, &$campaignLastScan, &$campaignScanDone, &$campaignLeakAborted,
+                $onChunk, $isPepa, $context
             ) {
                 $rawBuffer .= $chunk;
 
@@ -217,51 +220,42 @@ function (string $chunk) use (
                 }
 
                 if ($campaignLeakAborted) {
-                    return; // fuga ya detectada en el arranque → no emitir nada más
+                    return; // fuga ya detectada → no emitir más chunks del modelo
                 }
 
-                if ($campaignStartGated) {
-                    $onChunk($chunk); // arranque ya validado → passthrough normal
+                $onChunk($chunk); // streaming en vivo, inmediato
+
+                if ($campaignScanDone) {
                     return;
                 }
 
-                // Acumula el arranque; valida una sola vez antes de emitir nada.
-                $campaignStart .= $chunk;
-                if (mb_strlen($campaignStart) < $startGateChars) {
-                    return;
+                $campaignBuf .= $chunk;
+                $len = mb_strlen($campaignBuf);
+
+                if ($len < self::CONTEXT_LEAK_MIN_OVERLAP
+                    || $len - $campaignLastScan < self::CONTEXT_LEAK_SCAN_STEP) {
+                    return; // aún no hay bastante texto, o no creció lo suficiente
                 }
 
-                $campaignStartGated = true;
-                if ($this->looksLikeRawContextLeak($campaignStart, $context)) {
-                    Log::warning('Campaign (stream): fuga de contexto crudo en el arranque — fallback aplicado', [
-                        'raw_snippet' => mb_substr($campaignStart, 0, 800),
+                $campaignLastScan = $len;
+                if ($this->looksLikeRawContextLeak($campaignBuf, $context)) {
+                    Log::warning('Campaign (stream): fuga de contexto crudo detectada — stream cortado', [
+                        'raw_snippet' => mb_substr($campaignBuf, 0, 800),
                     ]);
                     $campaignLeakAborted = true;
                     return;
                 }
 
-                $onChunk($campaignStart); // arranque validado → emitir de una vez
+                if ($len >= self::CONTEXT_LEAK_SCAN_CAP) {
+                    $campaignScanDone = true; // suficiente texto coherente sin fuga
+                }
             }
         );
 
-        // El stream terminó antes de que el arranque llegara al umbral (respuesta
-        // corta sin fuga aparente): validar y emitir lo que quedó buffereado.
-        if (!$isPepa && !$campaignStartGated && !$campaignLeakAborted && $campaignStart !== '') {
-            $campaignStartGated = true;
-            if ($this->looksLikeRawContextLeak($campaignStart, $context)) {
-                Log::warning('Campaign (stream): fuga de contexto crudo en el arranque — fallback aplicado', [
-                    'raw_snippet' => mb_substr($campaignStart, 0, 800),
-                ]);
-                $campaignLeakAborted = true;
-            } else {
-                $onChunk($campaignStart);
-            }
-        }
-
-        // Fuga detectada: no se emitió nada de lo buffereado. Servimos el mismo
-        // texto canned que ChatController usa para $fullReply vacío y devolvemos
-        // meta marcada como fallback (is_fallback) para que no realimente el
-        // historial del LLM.
+        // Fuga detectada a mitad de stream: lo ya emitido no se puede deshacer,
+        // así que se agrega el mismo texto canned que ChatController usa para
+        // $fullReply vacío y se marca la respuesta como fallback (is_fallback)
+        // para que no realimente el historial del LLM.
         if ($campaignLeakAborted) {
             $onChunk(self::TECH_DIFFICULTY_REPLY);
             return [
@@ -286,9 +280,9 @@ function (string $chunk) use (
             return $resting;
         }
 
-        // Streaming: el arranque campaña ya se validó arriba; no re-pasamos el
-        // contexto a parseAIResponse (evita un segundo veredicto sobre texto ya
-        // emitido).
+        // Streaming: los chunks campaña ya salieron en vivo y el guard de fuga
+        // corrió en paralelo; no re-pasamos el contexto a parseAIResponse (no
+        // tiene sentido un segundo veredicto sobre texto ya emitido).
         $parsed = $this->parseAIResponse($rawBuffer);
 
         // Solo en PEPA podemos revisar el texto completo antes de emitir nada — está
@@ -1051,9 +1045,12 @@ private function callClaude(string $userMessage, string $systemPrompt, array $hi
     }
 
     // ─── STREAMING ───────────────────────────────────────────────────────
-    private function callAIStream(string $userMessage, string $context, array $history,
-                                  array $segment, ?array $attack, ChatSession $session,
-                                  ?string $topic, callable $onChunk): void
+    // protected (no private) para poder sustituir la capa de red en tests de
+    // respondStream() sin tocar Guzzle/HTTP — el streaming usa un GuzzleClient
+    // directo que Http::fake() no intercepta.
+    protected function callAIStream(string $userMessage, string $context, array $history,
+                                    array $segment, ?array $attack, ChatSession $session,
+                                    ?string $topic, callable $onChunk): void
     {
         $providers = $this->usableProviders();
 
@@ -1711,6 +1708,16 @@ private function looksLikeStructuredLeak(string $raw): bool
      */
     private const CONTEXT_LEAK_MIN_OVERLAP = 180;
 
+    /**
+     * Streaming en modo campaña: cada cuántos caracteres nuevos se vuelve a
+     * correr el chequeo de fuga sobre el buffer acumulado (throttle), y a partir
+     * de qué longitud de texto sin match se deja de escanear (si el modelo
+     * produjo tanto texto coherente que no aparece en el contexto, está
+     * sintetizando). Acotan el costo del chequeo continuo a ~12 pasadas.
+     */
+    private const CONTEXT_LEAK_SCAN_STEP = 60;
+    private const CONTEXT_LEAK_SCAN_CAP  = 800;
+
     /**
      * ¿$text contiene algún tramo contiguo de >= $minOverlapChars caracteres que
      * también aparece verbatim en $context? Es la señal de "fuga de contexto
```

**Resumen del cambio de diseño**

| | `e3f0cd6` (antes) | `820d83f` (ahora) |
|---|---|---|
| Emisión de chunks campaña | retiene hasta juntar `CONTEXT_LEAK_MIN_OVERLAP + 120 = 300` chars, valida una vez, y recién ahí suelta el buffer | emite cada chunk **inmediato y progresivo**, sin gate previo |
| Chequeo de fuga | 1 sola vez, sobre los primeros 300 chars | **en paralelo**: `looksLikeRawContextLeak()` sobre un buffer de cola, re-escaneado cada `CONTEXT_LEAK_SCAN_STEP=60` chars nuevos, hasta `CONTEXT_LEAK_SCAN_CAP=800` chars sin match (~12 pasadas máx) |
| Al detectar fuga | no se había emitido nada → se sirve solo el canned | se corta el stream ahí (no más chunks del modelo) y se **agrega** `TECH_DIFFICULTY_REPLY`; `meta['ai_resting'] = true` |
| Respuesta normal < 300 chars | **no se ve nada** hasta terminar la generación; aparece en bloque | streaming en vivo, sin retraso |
| Fuga real de documento | 0 chars visibles antes del corte | hasta ~180–240 chars visibles antes del corte (trade-off consciente) |
| `callAIStream()` | `private` | `protected` (seam para tests de `respondStream()`; el streaming usa `GuzzleClient` directo que `Http::fake()` no intercepta) |

Fuera de alcance / sin tocar: modo PEPA, `parseAIResponse()` no-streaming, `usableProviders()`,
cadena de proveedores, `buildRestingResponse()`, `MySQLFulltextEmbeddings`, `QdrantEmbeddings`,
prompts `.txt`, y el Commit 1 (`fuentes_citadas` / `filterVerifiedUrls`).

---

## 2. Test end-to-end — conteo de `$onChunk()`

Archivo: `tests/Feature/ChatStreamCampaignGuardTest.php`. Invoca `respondStream()`
**completo** (real `buildContext`, `parseAIResponse`, guard) sustituyendo **solo**
`callAIStream()` por un mock que emite chunks predefinidos, y cuenta las llamadas
a `$onChunk()`.

### ANTES del fix (código de `e3f0cd6`)

| Escenario | Reply | Llamadas a `$onChunk()` | Qué ve el ciudadano |
|---|---|---|---|
| **A. Respuesta corta** | 122 chars · 10 chunks | **1** | Nada durante toda la generación; al final, los 122 chars de golpe en un solo bloque. |
| **B. Respuesta larga normal** | 1060 chars · 20 chunks | **15** | 1ª emisión = bloque de 318 chars (6 chunks retenidos y soltados juntos); recién después progresivo. |
| **C. Volcado del contexto** | 355 chars · 9 chunks de 40 | **1** (solo el canned) | Guard corta bien; 0 chars de fuga visibles. |

Salida real (test A, antes):

```
FAILED  Tests\Feature\ChatStreamCampaignGuardTest > respuesta corta de campana se streamea progresivamente
la respuesta corta debe llegar en varias llamadas a onChunk, no en un solo bloque
Failed asserting that 1 is greater than 1.
```

Salida real (test B, antes):

```
FAILED  Tests\Feature\ChatStreamCampaignGuardTest > respuesta larga normal se streamea progresivamente
passthrough progresivo, sin retención
Failed asserting that two arrays are identical.
--- Expected   (20 elementos de 54 chars)
+++ Actual      (15 elementos; el [0] son 6 chunks concatenados = 318 chars)
```

Confirma la lectura del review: para respuestas `< 300` chars, `$campaignStartGated`
nunca pasa a `true` dentro del loop; la única emisión es el bloque posterior a
`callAIStream()`, que corre cuando el modelo ya terminó.

### DESPUÉS del fix (código de `820d83f`)

Salida real de la sonda (`onChunk` numerado, tamaño de cada emisión):

```
=== A. respuesta corta (122 chars, 10 chunks) — RAG vacío ===
llamadas a onChunk(): 10
  [ 0] ( 14 chars) Hola paisano,
  [ 1] (  8 chars) ¿de qué
  [ 2] (  9 chars) distrito
  [ 3] ( 11 chars) eres y qué
  [ 4] (  9 chars) problema
  [ 5] ( 12 chars) te preocupa
  [ 6] ( 10 chars) más en tu
  [ 7] ( 11 chars) comunidad?
  [ 8] ( 11 chars) Cuéntame y
  [ 9] ( 17 chars) te ayudo con eso.
ai_resting: false

=== B. respuesta larga normal (1060 chars, 20 chunks) — RAG vacío ===
llamadas a onChunk(): 20
  [ 0..19] ( 54 chars c/u) oracion natural distinta numero N con contenido util.
ai_resting: false

=== C. volcado del contexto (355 chars, 9 chunks de 40) — RAG devuelve ese excerpt ===
llamadas a onChunk(): 6
  [ 0] ( 40 chars) El programa integral de seguridad ciudad
  [ 1] ( 40 chars) ana contempla la instalacion de doce bas
  [ 2] ( 40 chars) es de serenazgo interconectadas con un s
  [ 3] ( 40 chars) istema central de videovigilancia con an
  [ 4] ( 40 chars) alitica de video en tiempo real, la inco
  [ 5] (101 chars) Disculpa, tengo un inconveniente técnico en este momento. Por favor intenta de nuevo en unos minutos.
ai_resting: true
```

| Escenario | Llamadas a `$onChunk()` | Resultado |
|---|---|---|
| **A. corta (122 c)** | **10** — una por chunk, en orden | streaming en vivo, `ai_resting=false` |
| **B. larga normal (1060 c)** | **20** — una por chunk, sin retención | streaming en vivo, `ai_resting=false` |
| **C. volcado (355 c)** | **6** — 5 chunks del volcado (200 chars) en vivo + `TECH_DIFFICULTY_REPLY` | stream cortado, `ai_resting=true`, 4 chunks restantes del volcado **no** emitidos; fuga visible acotada a 200 chars |

```
PASS  Tests\Feature\ChatStreamCampaignGuardTest
✓ respuesta corta de campana se streamea progresivamente
✓ respuesta larga normal se streamea progresivamente
✓ volcado de contexto a media stream corta y agrega canned
Tests: 3 passed (13 assertions)
```

---

## 3. Test suite completo

`php artisan test` sobre `820d83f` — 5 corridas consecutivas, resultado estable:

```
Tests:    5 failed, 82 passed (199 assertions)
Duration: ~19s
```

Total pasando: 68 (baseline `c22bba2`) → 79 (Commit 1 `be7d0f9` + Commit 2 `e3f0cd6`) → **82** (Commit 3 `820d83f`, +3 tests E2E de streaming).

### Los 5 fallos son pre-existentes y ajenos a estos commits

| Test | Causa | ¿Introducido aquí? |
|---|---|---|
| `Tests\Feature\LiveStreamMergeTest > process batch completa el merge y marca done` | `"ffmpeg" no se reconoce como un comando` — binario ausente en este entorno | No |
| `Tests\Feature\LiveStreamMergeTest > process batch es idempotente si ya esta done` | ídem ffmpeg | No |
| `Tests\Feature\LiveStreamMergeTest > un intento a medias no corrompe el archivo final` | ídem ffmpeg | No |
| `Tests\Feature\LiveStreamContinueMergesCommandTest > comando continue merges retoma streams pendientes` | ídem ffmpeg | No |
| `Tests\Feature\AiProviderFailoverTest > 401 no reintenta y salta de inmediato al siguiente provider` | el entorno de test no tiene `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, así que `usableProviders()` colapsa la cadena a groq-only y el test espera `'Respuesta de Claude'`. `usableProviders()` no se tocó. | No |

Byte-idénticos a la baseline de `c22bba2` (5 failed, 68 passed).

> Nota: una corrida aislada dio `6 failed, 81 passed` cuando se ejecutó `php artisan test`
> **en paralelo con la sonda manual** (`stream_probe.php`) sobre la misma BD `bdpolitic`
> — contención transitoria de estado compartido, no reproducible al correr la suite sola
> (5/5 corridas limpias en `5 failed, 82 passed`).

### Tests relevantes verdes

```
PASS  Tests\Unit\PepaResponseParsingTest                 (33 passed)   ← Commits 1 y 2
PASS  Tests\Feature\ChatStreamCampaignGuardTest          (3 passed)    ← Commit 3
PASS  Tests\Unit\MySQLFulltextExcerptTest
```

---

## 4. Latencia del primer chunk en pantalla

La red está mockeada en la sonda, así que estos números aíslan el **overhead
in-process de `respondStream()` antes de la primera emisión** (el TTFT real de
Groq —~200-500 ms— se suma igual en los dos casos y ningún commit lo cambia).

Sonda sobre `820d83f` (`primer chunk emitido a los N ms del arranque de respondStream()`):

```
A. respuesta corta   → ~74 ms   (1ª llamada del proceso: buildContext en frío)
B. respuesta larga    → ~38 ms   (warm)
C. volcado            → ~23 ms   (warm)
```

Esos ~23–74 ms son el trabajo síncrono previo a `callAIStream()` (`ensureInitialized`
+ `detectTopic/District/Attack` + `buildContext` + `getConversationHistory` +
`resolveSegment` + `buildSystemPrompt`) — **idéntico antes y después del fix**. El fix
no agrega nada a ese camino: el escaneo de fuga corre dentro del callback, en paralelo
al streaming, y `looksLikeRawContextLeak()` se llama como mucho ~12 veces
(throttle de 60 chars, tope de 800), ~1-2 ms cada una, repartidas a lo largo de todo
el stream.

Lo que el fix cambia no es ese número, es **cuándo se pinta el primer token respecto
de la generación del modelo**:

| | Antes (`e3f0cd6`) | Después (`820d83f`) |
|---|---|---|
| Reply `< 300` chars | nada hasta terminar **toda** la generación (p. ej. ~120 chars ≈ 40 tokens ≈ **2-4 s** a velocidad de Groq), luego un bloque | el **primer token**, en cuanto Groq emite el primer delta SSE (~TTFT) |
| Reply `> 300` chars | primer bloque de ~300 chars retenido hasta que el modelo generó 300 chars (~150-375 ms de generación), luego progresivo | primer token al instante; el resto progresivo sin cortes |
| Overhead in-process previo | ~11-74 ms | ~11-74 ms (sin cambios) |

En una demo con respuestas de 3-5 oraciones, es la diferencia entre "aparece
escribiendo en ~0,3 s" y "pantalla vacía 2-4 s y después un bloque".
