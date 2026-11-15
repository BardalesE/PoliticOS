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
 */
class MapDocumentChunkJob implements ShouldQueue
{
    use Batchable, Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 20; // los release() por throttling/429 cuentan como intento; ver backoff().
    public int $timeout = 90;

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
            $section->update(['map_status' => 'pendiente']);
            $this->release($e->retryAfter);
        } catch (\Throwable $e) {
            Log::warning('MapDocumentChunkJob failed', ['section_id' => $this->sectionId, 'error' => $e->getMessage()]);
            $section->update(['map_status' => 'error', 'map_error' => mb_substr($e->getMessage(), 0, 500)]);

            if ($this->attempts() < (int) config('ingest.map.max_retries')) {
                $this->release(min(60, 2 ** $this->attempts()));
            } else {
                $this->fail($e);
            }
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
