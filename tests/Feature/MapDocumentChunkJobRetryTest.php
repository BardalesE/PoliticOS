<?php

namespace Tests\Feature;

use App\Jobs\MapDocumentChunkJob;
use App\Models\DocumentSection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Fase 3.2a — 429 de Groq → release() con el backoff correcto, no una
 * excepción que tire el batch entero. Usa el helper oficial de Laravel para
 * esto (withFakeQueueInteractions()/assertReleased()): sin un Job real
 * detrás, InteractsWithQueue::release()/attempts() son no-ops.
 *
 * Bug 2026-11: $tries=20 fijo se agotaba con los release() por throttling —
 * cada espera por "todavía no hay cupo" contaba como un intento, así que en
 * documentos de 180+ chunks los últimos fallaban sin haber llamado a Groq.
 * Ahora $tries=0 + retryUntil() (tope por TIEMPO) + maxExceptions (tope de
 * ERRORES reales, no de esperas) — ver el comentario en MapDocumentChunkJob.
 */
class MapDocumentChunkJobRetryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.tenant_slug' => null,
            'database.default' => 'sqlite',
            'database.connections.sqlite' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true,
            ],
            'services.ai.groq_key' => 'test-groq-key',
            'ingest.map.model' => 'openai/gpt-oss-20b',
            'ingest.map.requests_per_minute' => 100,
            'ingest.map.tokens_per_minute' => 1_000_000,
            'ingest.map.max_retries' => 5,
            'ingest.map.retry_hours' => 6,
            'cache.default' => 'array',
        ]);
        DB::purge('sqlite');
        Cache::flush();

        (require database_path('migrations/2026_11_14_000002_create_document_sections_table.php'))->up();
    }

    private int $nextOrden = 0;

    private function section(): DocumentSection
    {
        return DocumentSection::create([
            'document_id' => 1, 'orden' => $this->nextOrden++, 'titulo' => 'EJE 1',
            'texto' => 'Ejecutar el canal de riego Agua Blanca.',
            'page_start' => 2, 'page_end' => 2, 'tokens' => 20,
            'map_status' => 'pendiente',
        ]);
    }

    public function test_tries_is_zero_and_retry_is_governed_by_time_and_real_errors_only(): void
    {
        $job = new MapDocumentChunkJob($this->section()->id);

        $this->assertSame(0, $job->tries);
        $this->assertSame(5, $job->maxExceptions); // == config('ingest.map.max_retries')

        $hoursUntilDeadline = (now()->diffInMinutes($job->retryUntil(), false)) / 60;
        $this->assertGreaterThan(5.9, $hoursUntilDeadline);
        $this->assertLessThan(6.1, $hoursUntilDeadline);
    }

    public function test_a_429_releases_the_job_with_the_retry_after_delay_instead_of_failing(): void
    {
        Http::fake(['*api.groq.com*' => Http::response(['error' => 'rate limited'], 429, ['Retry-After' => '17'])]);

        $section = $this->section();
        $job = (new MapDocumentChunkJob($section->id))->withFakeQueueInteractions();

        $job->handle();

        $job->assertReleased(delay: 17);
        $job->assertNotFailed();
        $this->assertSame('pendiente', $section->fresh()->map_status); // vuelve a pendiente, se reintenta igual que antes de la Fase 1.
    }

    public function test_a_429_without_a_retry_after_header_falls_back_to_a_default_delay(): void
    {
        Http::fake(['*api.groq.com*' => Http::response(['error' => 'rate limited'], 429)]); // sin header Retry-After

        $section = $this->section();
        $job = (new MapDocumentChunkJob($section->id))->withFakeQueueInteractions();

        $job->handle();

        $job->assertReleased();
        $this->assertGreaterThan(0, $job->job->releaseDelay);
    }

    /**
     * Un error real (JSON inválido) ya NO se gestiona a mano con
     * $this->attempts()/release()/fail(): se relanza para que Laravel lo
     * cuente contra maxExceptions (ver Illuminate\Queue\Worker::maxExceptions()).
     * El job deja map_status=error ANTES de relanzar, visible en el admin
     * aunque Laravel todavía no haya decidido si reintenta o falla.
     */
    public function test_an_invalid_json_response_marks_the_section_as_error_and_rethrows_for_laravel_to_handle(): void
    {
        Http::fake(['*api.groq.com*' => Http::response([
            'choices' => [['message' => ['content' => 'esto no es json']]],
            'usage'   => ['total_tokens' => 10],
        ], 200)]);

        $section = $this->section();
        $job = (new MapDocumentChunkJob($section->id))->withFakeQueueInteractions();

        $thrown = null;
        try {
            $job->handle();
        } catch (\Throwable $e) {
            $thrown = $e;
        }

        $this->assertNotNull($thrown, 'un JSON inválido debe relanzar para que Laravel lo cuente contra maxExceptions');
        $job->assertNotReleased(); // el job no se libera a sí mismo: el worker decide, vía maxExceptions/backoff().
        $job->assertNotFailed();   // tampoco se falla a sí mismo.
        $this->assertSame('error', $section->fresh()->map_status);
        $this->assertNotNull($section->fresh()->map_error);
    }

    /**
     * Simula el escenario real del bug: un documento de 250 chunks con un
     * throttle agresivo (solo 5 requests/min) de verdad obliga a MUCHAS más
     * de 20 esperas en total — con el viejo $tries=20 varios chunks habrían
     * fallado por "intentos agotados" sin haber llamado nunca a Groq. Con
     * $tries=0 ninguno falla: todos terminan en 'listo' tras suficientes
     * rondas. El "paso del tiempo" entre rondas se simula vaciando la caché
     * del throttle (misma caché que usa GroqThrottler) en vez de dormir de verdad.
     */
    public function test_250_chunks_with_a_tight_throttle_all_end_up_listo_without_any_attempt_based_failure(): void
    {
        config(['ingest.map.requests_per_minute' => 5, 'ingest.map.tokens_per_minute' => 1_000_000]);
        Http::fake(['*api.groq.com*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([
                'resumen' => 'ok', 'propuestas' => [], 'ejes' => [], 'regiones_mencionadas' => [], 'paginas' => [1],
            ])]]],
            'usage' => ['total_tokens' => 50],
        ], 200)]);

        $ids = collect(range(1, 250))->map(fn () => $this->section()->id);
        $pending = $ids->all();
        $totalReleases = 0;

        for ($wave = 0; $wave < 80 && !empty($pending); $wave++) {
            $stillPending = [];
            foreach ($pending as $id) {
                $job = (new MapDocumentChunkJob($id))->withFakeQueueInteractions();
                $job->handle();

                if ($job->job->isReleased()) {
                    $totalReleases++;
                    $stillPending[] = $id;
                }
                $job->assertNotFailed(); // nunca se rinde por conteo de intentos.
            }
            $pending = $stillPending;
            Cache::flush(); // simula que pasó un minuto: el throttle vuelve a tener cupo.
        }

        $this->assertEmpty($pending, 'quedaron chunks sin procesar tras 80 rondas simuladas');
        $this->assertGreaterThan(20, $totalReleases, 'el throttle debería haber liberado más veces que el viejo $tries=20 — si no, la prueba no reproduce el bug');
        $this->assertSame(250, DocumentSection::where('map_status', 'listo')->count());
        $this->assertSame(0, DocumentSection::where('map_status', 'error')->count());
    }
}
