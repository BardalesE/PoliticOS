<?php

namespace Tests\Feature;

use App\Jobs\EmbedDocumentSectionsJob;
use App\Jobs\ReduceDocumentJob;
use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Models\UbigeoDepartamento;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ReduceDocumentJobTest extends TestCase
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
            'ingest.reduce.model' => 'openai/gpt-oss-120b',
        ]);
        DB::purge('sqlite');

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->string('status', 20)->default('ready');
            $t->string('analysis_status', 20)->default('pendiente');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
            $t->boolean('is_public')->default(false);
            $t->timestamps();
        });

        foreach ([
            '2026_11_14_000002_create_document_sections_table',
            '2026_11_14_000003_create_document_analysis_table',
            '2026_11_14_000004_create_document_faqs_table',
            '2026_09_16_000001_create_ubigeo_departamentos_table',
            '2026_09_16_000002_create_ubigeo_provincias_table',
            '2026_09_16_000003_create_ubigeo_distritos_table',
        ] as $migration) {
            (require database_path("migrations/{$migration}.php"))->up();
        }

        UbigeoDepartamento::create(['departamento' => 'CAJAMARCA', 'ubigeo' => '06']);
    }

    private function fakeGroq(array $byEjeResponse, array $globalResponse): void
    {
        $this->fakeGroqSequence([$byEjeResponse, $globalResponse]);
    }

    /** Un Http::fake() acumula callbacks (no reemplaza) si se llama más de una
     *  vez en el mismo test — por eso una sola secuencia cubre todas las
     *  llamadas a Groq de un test, aunque haga varios handle(). */
    private function fakeGroqSequence(array $payloads): void
    {
        $calls = 0;
        Http::fake(function () use (&$calls, $payloads) {
            $payload = $payloads[$calls] ?? end($payloads);
            $calls++;

            return Http::response([
                'choices' => [['message' => ['content' => json_encode($payload)]]],
                'usage'   => ['total_tokens' => 50],
            ], 200);
        });
    }

    public function test_discards_faqs_without_pages_and_keeps_the_rest(): void
    {
        Bus::fake([EmbedDocumentSectionsJob::class]);
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1]);
        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => 'EJE 1', 'texto' => 'riego',
            'page_start' => 2, 'page_end' => 2, 'tokens' => 10, 'map_status' => 'listo',
            'map_json' => ['resumen' => 'r', 'propuestas' => ['Canal de riego'], 'ejes' => ['Agricultura'], 'regiones_mencionadas' => ['Cajamarca'], 'paginas' => [2]],
        ]);

        $this->fakeGroq(
            ['eje' => 'Agricultura', 'resumen' => 'consolidado', 'propuestas' => [['texto' => 'Canal de riego', 'paginas' => [2]]]],
            [
                'indice_estructurado' => [['titulo' => 'Agricultura', 'orden' => 1]],
                'resumen_ejecutivo'   => 'Resumen global.',
                'faqs' => [
                    ['pregunta' => '¿Hay riego?', 'respuesta' => 'Sí, canal Agua Blanca.', 'paginas' => [2]],
                    ['pregunta' => 'FAQ inventada sin página', 'respuesta' => 'x', 'paginas' => []],
                ],
            ],
        );

        (new ReduceDocumentJob($doc->id))->handle();

        $faqs = DocumentFaq::where('document_id', $doc->id)->get();
        $this->assertCount(1, $faqs);
        $this->assertSame('¿Hay riego?', $faqs[0]->pregunta);

        $analysis = DocumentAnalysis::where('document_id', $doc->id)->first();
        $this->assertSame('Resumen global.', $analysis->resumen_ejecutivo);
        $this->assertSame(1, $analysis->version);

        Bus::assertDispatched(EmbedDocumentSectionsJob::class);
    }

    public function test_normalizes_region_mentions_against_ubigeo(): void
    {
        Bus::fake([EmbedDocumentSectionsJob::class]);
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1]);
        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => null, 'texto' => 'x',
            'page_start' => 5, 'page_end' => 5, 'tokens' => 10, 'map_status' => 'listo',
            'map_json' => ['resumen' => 'r', 'propuestas' => ['Posta de salud'], 'ejes' => ['Salud'], 'regiones_mencionadas' => ['cajamarca'], 'paginas' => [5]],
        ]);

        $this->fakeGroq(
            ['eje' => 'Salud', 'resumen' => 'consolidado', 'propuestas' => [['texto' => 'Posta de salud', 'paginas' => [5]]]],
            ['indice_estructurado' => [], 'resumen_ejecutivo' => 'r', 'faqs' => []],
        );

        (new ReduceDocumentJob($doc->id))->handle();

        $analysis = DocumentAnalysis::where('document_id', $doc->id)->first();
        $region = $analysis->propuestas_por_region[0];
        $this->assertSame('CAJAMARCA', $region['nombre']);
        $this->assertSame('departamento', $region['nivel']);
    }

    public function test_reprocessing_increments_the_analysis_version(): void
    {
        Bus::fake([EmbedDocumentSectionsJob::class]);
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1]);
        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => null, 'texto' => 'x',
            'page_start' => 1, 'page_end' => 1, 'tokens' => 10, 'map_status' => 'listo',
            'map_json' => ['resumen' => 'r', 'propuestas' => [], 'ejes' => ['General'], 'regiones_mencionadas' => [], 'paginas' => [1]],
        ]);
        $this->fakeGroqSequence([
            ['eje' => 'General', 'resumen' => 'r', 'propuestas' => []],
            ['indice_estructurado' => [], 'resumen_ejecutivo' => 'v1', 'faqs' => []],
            ['eje' => 'General', 'resumen' => 'r', 'propuestas' => []],
            ['indice_estructurado' => [], 'resumen_ejecutivo' => 'v2', 'faqs' => []],
        ]);

        (new ReduceDocumentJob($doc->id))->handle();
        (new ReduceDocumentJob($doc->id))->handle();

        $analysis = DocumentAnalysis::where('document_id', $doc->id)->first();
        $this->assertSame(2, $analysis->version);
        $this->assertSame('v2', $analysis->resumen_ejecutivo);
    }
}
