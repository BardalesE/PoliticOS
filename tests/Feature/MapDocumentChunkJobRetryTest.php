<?php

namespace Tests\Feature;

use App\Jobs\MapDocumentChunkJob;
use App\Models\DocumentSection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Fase 3.2a — 429 de Groq → release() con el backoff correcto, no una
 * excepción que tire el batch entero. Usa el helper oficial de Laravel para
 * esto (withFakeQueueInteractions()/assertReleased()): sin un Job real
 * detrás, InteractsWithQueue::release()/attempts() son no-ops.
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
            'cache.default' => 'array',
        ]);
        DB::purge('sqlite');

        (require database_path('migrations/2026_11_14_000002_create_document_sections_table.php'))->up();
    }

    private function section(): DocumentSection
    {
        return DocumentSection::create([
            'document_id' => 1, 'orden' => 0, 'titulo' => 'EJE 1',
            'texto' => 'Ejecutar el canal de riego Agua Blanca.',
            'page_start' => 2, 'page_end' => 2, 'tokens' => 20,
            'map_status' => 'pendiente',
        ]);
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

    public function test_an_invalid_json_response_retries_with_backoff_instead_of_crashing_the_batch(): void
    {
        Http::fake(['*api.groq.com*' => Http::response([
            'choices' => [['message' => ['content' => 'esto no es json']]],
            'usage'   => ['total_tokens' => 10],
        ], 200)]);

        $section = $this->section();
        $job = (new MapDocumentChunkJob($section->id))->withFakeQueueInteractions();
        $job->job->attempts = 1; // primer intento: todavía por debajo de max_retries (5).

        $job->handle();

        $job->assertReleased();
        $job->assertNotFailed();
        $this->assertSame('error', $section->fresh()->map_status);
        $this->assertNotNull($section->fresh()->map_error);
    }

    public function test_exhausting_all_retries_on_sustained_invalid_json_gives_up_via_fail_not_an_uncaught_exception(): void
    {
        Http::fake(['*api.groq.com*' => Http::response([
            'choices' => [['message' => ['content' => 'esto no es json']]],
            'usage'   => ['total_tokens' => 10],
        ], 200)]);

        $section = $this->section();
        $job = (new MapDocumentChunkJob($section->id))->withFakeQueueInteractions();
        $job->job->attempts = 5; // ya alcanzó max_retries: debe rendirse vía fail(), no relanzar.

        $job->handle();

        $job->assertNotReleased();
        $job->assertFailed();
        $this->assertSame('error', $section->fresh()->map_status);
    }
}
