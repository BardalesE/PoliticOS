<?php

namespace Tests\Feature;

use App\Jobs\MapDocumentChunkJob;
use App\Models\DocumentSection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * El 429-con-backoff real (release() sobre la cola) se prueba a nivel
 * pipeline completo en la Fase 3 (3.2) — aquí se cubre el contrato de este
 * job en aislamiento: éxito (JSON válido → map_status=listo) e idempotencia
 * (no repite una llamada ya hecha), que es lo que gasta tokens de verdad si
 * se rompe.
 */
class MapDocumentChunkJobTest extends TestCase
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
            'ingest.map.max_retries' => 3,
            'cache.default' => 'array',
        ]);
        DB::purge('sqlite');

        (require database_path('migrations/2026_11_14_000002_create_document_sections_table.php'))->up();
    }

    private function section(array $over = []): DocumentSection
    {
        return DocumentSection::create($over + [
            'document_id' => 1, 'orden' => 0, 'titulo' => 'EJE 1',
            'texto' => 'Ejecutar el canal de riego Agua Blanca.',
            'page_start' => 2, 'page_end' => 2, 'tokens' => 20,
            'map_status' => 'pendiente',
        ]);
    }

    private function fakeGroqJson(array $json): void
    {
        Http::fake([
            '*api.groq.com*' => Http::response([
                'choices' => [['message' => ['content' => json_encode($json)]]],
                'usage'   => ['total_tokens' => 123],
            ], 200),
        ]);
    }

    public function test_successful_map_stores_parsed_json_and_marks_section_as_listo(): void
    {
        $section = $this->section();
        $this->fakeGroqJson([
            'seccion' => 'EJE 1', 'resumen' => 'Riego para la zona alta.',
            'propuestas' => ['Canal de riego Agua Blanca'], 'ejes' => ['Agricultura'],
            'regiones_mencionadas' => ['San Miguel'], 'paginas' => [2],
        ]);

        (new MapDocumentChunkJob($section->id))->handle();

        $section->refresh();
        $this->assertSame('listo', $section->map_status);
        $this->assertSame(['Canal de riego Agua Blanca'], $section->map_json['propuestas']);
        $this->assertSame([2], $section->map_json['paginas']);
    }

    public function test_already_mapped_section_is_not_reprocessed(): void
    {
        $section = $this->section(['map_status' => 'listo', 'map_json' => ['resumen' => 'ya hecho', 'propuestas' => [], 'ejes' => [], 'regiones_mencionadas' => [], 'paginas' => []]]);
        Http::fake();

        (new MapDocumentChunkJob($section->id))->handle();

        Http::assertNothingSent();
    }

    public function test_validation_rejects_a_response_missing_a_required_key(): void
    {
        $job = new MapDocumentChunkJob(1);
        $m = new \ReflectionMethod($job, 'validated');
        $m->setAccessible(true);

        $this->expectException(\RuntimeException::class);
        $m->invoke($job, ['resumen' => 'ok', 'propuestas' => []]); // falta ejes/regiones_mencionadas/paginas
    }
}
