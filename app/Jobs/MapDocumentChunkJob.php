<?php

namespace App\Jobs;

use App\Models\DocumentSection;
use App\Services\Llm\GroqClient;
use App\Services\Llm\GroqRateLimitException;
use App\Services\Llm\GroqThrottler;
use App\Services\TenantContext;
use Illuminate\Bus\Batchable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * MAP: le pide a Groq un resumen estructurado de UN chunk (DocumentSection).
 * Un job por chunk dentro del Bus::batch que dispara ProcessKnowledgeDocumentJob.
 * Idempotente (map_status=listo no se reprocesa) para que reintentar el batch
 * o reingerir el documento no vuelva a gastar tokens en lo ya hecho.
 *
 * Reintentos por TIEMPO, no por conteo (bug 2026-11: con $tries=20 fijo, un
 * documento de 180+ chunks agotaba los 20 intentos solo con las esperas del
 * throttle — cada release() por "todavía no hay cupo" contaba como un
 * intento, así que los últimos chunks fallaban sin haber llamado a Groq ni
 * una vez). Ahora:
 *   - $tries = 0 + retryUntil(): sin tope de INTENTOS; el único límite es el
 *     tiempo de pared (INGEST_MAP_RETRY_HOURS, default 6h).
 *   - $maxExceptions: solo cuenta contra este presupuesto una EXCEPCIÓN real
 *     que Laravel vea propagarse (JSON inválido, 5xx, cualquier Throwable
 *     salvo 429) — el throttle y el 429 llaman a release() directamente
 *     dentro del try/catch, nunca lanzan, así que nunca lo consumen.
 */
class MapDocumentChunkJob implements ShouldQueue
{
    use Batchable, Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 0;
    public int $timeout = 90;

    /** Leído por Laravel como PROPIEDAD pública (no método) al serializar el job — ver Illuminate\Queue\Queue::createObjectPayload(). */
    public ?int $maxExceptions = null;

    private \DateTimeInterface $retryDeadline;

    private const SYSTEM_PROMPT = <<<'TXT'
Eres un analista de planes de gobierno peruanos. Recibes UN fragmento de un
documento y devuelves SOLO un JSON con esta forma exacta, sin texto fuera del
JSON:
{
  "seccion": "título corto del fragmento o null",
  "resumen": "resumen en 2-4 frases, en español neutro",
  "propuestas": ["propuesta concreta 1", "propuesta concreta 2"],
  "ejes": ["eje temático 1", "eje temático 2"],
  "regiones_mencionadas": ["nombre de región/provincia/distrito mencionado"],
  "paginas": [números de página del fragmento, enteros]
}
Si el fragmento no contiene propuestas (portada, índice, biografía), deja
"propuestas" como lista vacía. Nunca inventes datos que no estén en el texto.
TXT;

    public function __construct(public int $sectionId, public ?string $tenantSlug = null)
    {
        $this->tenantSlug ??= TenantContext::currentSlug();
        $this->maxExceptions = (int) config('ingest.map.max_retries', 5);
        $this->retryDeadline = now()->addHours((int) config('ingest.map.retry_hours', 6));
    }

    /** Fijo al construirse (no en cada llamada): si se recalculara con now() en
     *  cada evaluación, el plazo se correría para adelante indefinidamente y
     *  nunca expiraría. Ver Illuminate\Queue\Worker::markJobAsFailedIfAlreadyExceedsMaxAttempts. */
    public function retryUntil(): \DateTimeInterface
    {
        return $this->retryDeadline;
    }

    /** Backoff exponencial para una excepción real (JSON inválido, 5xx) — el throttle y el 429 ya liberan con su propio delay, sin pasar por aquí. */
    public function backoff(): array
    {
        return [2, 4, 8, 16, 32, 60];
    }

    public function handle(): void
    {
        TenantContext::run($this->tenantSlug, fn () => $this->process());
    }

    private function process(): void
    {
        if ($this->batch()?->cancelled()) {
            return;
        }

        $section = DocumentSection::find($this->sectionId);
        if (!$section || $section->map_status === 'listo') {
            return; // idempotente: ya procesado (o borrado).
        }

        $throttler = new GroqThrottler(
            (int) config('ingest.map.requests_per_minute'),
            (int) config('ingest.map.tokens_per_minute'),
        );
        $estimatedTokens = $section->tokens + 400; // + overhead del prompt/respuesta.
        $acquire = $throttler->tryAcquire(TenantContext::cacheKey('groq_map'), $estimatedTokens);
        if (!$acquire['allowed']) {
            // Esperar cupo no es un error: release() directo, nunca una excepción
            // (no debe consumir el presupuesto de maxExceptions).
            $this->release($acquire['retry_after']);
            return;
        }

        $section->update(['map_status' => 'procesando']);

        try {
            $result = (new GroqClient())->completeJson(
                self::SYSTEM_PROMPT,
                $this->buildUserPrompt($section),
                (string) config('ingest.map.model'),
            );

            $data = $this->validated($result['data']);

            $section->update(['map_json' => $data, 'map_status' => 'listo', 'map_error' => null]);
        } catch (GroqRateLimitException $e) {
            // 429: tampoco es un error real — release() directo, sin relanzar.
            $section->update(['map_status' => 'pendiente']);
            $this->release($e->retryAfter);
        } catch (\Throwable $e) {
            // Error real (JSON inválido, 5xx, red): se relanza para que Laravel
            // lo cuente contra maxExceptions y lo reintente con backoff() —
            // ver la nota de la clase. map_status queda en 'error' mientras
            // tanto, visible en el admin, y el reintento (idempotente por
            // map_status=listo) lo corrige si tiene éxito.
            Log::warning('MapDocumentChunkJob failed', ['section_id' => $this->sectionId, 'error' => $e->getMessage()]);
            $section->update(['map_status' => 'error', 'map_error' => mb_substr($e->getMessage(), 0, 500)]);

            throw $e;
        }
    }

    private function buildUserPrompt(DocumentSection $section): string
    {
        $titulo = $section->titulo ? "Título detectado: {$section->titulo}\n" : '';

        return "{$titulo}Páginas {$section->page_start}-{$section->page_end}:\n\n{$section->texto}";
    }

    /** @throws \RuntimeException si falta alguna clave requerida. */
    private function validated(array $data): array
    {
        foreach (['resumen', 'propuestas', 'ejes', 'regiones_mencionadas', 'paginas'] as $key) {
            if (!array_key_exists($key, $data)) {
                throw new \RuntimeException("JSON de Groq sin la clave requerida '{$key}'");
            }
        }

        return [
            'seccion'              => $data['seccion'] ?? null,
            'resumen'              => (string) $data['resumen'],
            'propuestas'           => array_values((array) $data['propuestas']),
            'ejes'                 => array_values((array) $data['ejes']),
            'regiones_mencionadas' => array_values((array) $data['regiones_mencionadas']),
            'paginas'              => array_values(array_map('intval', (array) $data['paginas'])),
        ];
    }
}
