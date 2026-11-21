<?php

namespace Tests\Feature;

use App\Jobs\EmbedDocumentSectionsJob;
use App\Jobs\SinglePassAnalyzeDocumentJob;
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

/**
 * Modo INGEST_ANALYSIS_MODE=single_pass_gemini: este job reemplaza el batch
 * de MapDocumentChunkJob + ReduceDocumentJob (ver StartDocumentAnalysisJob y
 * GeminiLongContextAnalyzerTest para la lógica de "lectura única").
 */
class SinglePassAnalyzeDocumentJobTest extends TestCase
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
            'ingest.single_pass.api_key'  => 'test-gemini-key',
            'ingest.single_pass.base_url' => 'https://generativelanguage.googleapis.com/v1beta',
            'ingest.single_pass.model'    => 'gemini-2.5-flash',
            'ingest.single_pass.max_tokens' => 400000,
            'ingest.single_pass.json_retries' => 3,
        ]);
        DB::purge('sqlite');

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->string('status', 20)->default('ready');
            $t->json('pages')->nullable();
            $t->string('analysis_status', 20)->default('pendiente');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
            $t->string('analysis_batch_id')->nullable();
            $t->string('analysis_stage', 30)->nullable();
            $t->timestamp('analysis_started_at')->nullable();
            $t->timestamp('analysis_finished_at')->nullable();
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

    private function geminiFullResponse()
    {
        return Http::response([
            'candidates' => [['content' => ['parts' => [['text' => json_encode([
                'resumen_ejecutivo'   => 'Resumen del plan.',
                'indice_estructurado' => [['titulo' => 'Agricultura', 'orden' => 1]],
                'propuestas_por_eje'  => [
                    'Agricultura' => ['eje' => 'Agricultura', 'resumen' => 'r', 'propuestas' => [['texto' => 'Canal de riego', 'paginas' => [2]]]],
                ],
                'propuestas_por_region' => [
                    ['nombre' => 'cajamarca', 'propuestas' => [['texto' => 'Posta de salud', 'paginas' => [5]]]],
                ],
                'faqs' => array_merge(
                    [['pregunta' => 'FAQ inventada sin página', 'respuesta' => 'x', 'paginas' => []]],
                    [['pregunta' => '¿Hay riego?', 'respuesta' => 'Sí, canal de riego.', 'paginas' => [2]]]
                ),
            ], JSON_UNESCAPED_UNICODE)]]]]],
            'usageMetadata' => ['totalTokenCount' => 500],
        ], 200);
    }

    public function test_persists_the_analysis_and_faqs_and_dispatches_embeddings(): void
    {
        Bus::fake([EmbedDocumentSectionsJob::class]);
        Http::fake(['*generateContent*' => $this->geminiFullResponse()]);

        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'candidate_id' => 1,
            'pages' => ['Portada.', 'EJE 1: riego para la zona alta.', 'Otra pagina.', 'Otra mas.', 'Salud en la region.'],
        ]);
        DocumentSection::create([
            'document_id' => $doc->id, 'candidate_id' => $doc->candidate_id, 'orden' => 0,
            'titulo' => null, 'texto' => 'x', 'page_start' => 1, 'page_end' => 5,
            'tokens' => 10, 'map_status' => 'listo',
        ]);

        (new SinglePassAnalyzeDocumentJob($doc->id))->handle();

        $analysis = DocumentAnalysis::where('document_id', $doc->id)->first();
        $this->assertNotNull($analysis);
        $this->assertSame('Resumen del plan.', $analysis->resumen_ejecutivo);
        $this->assertSame('gemini-2.5-flash', $analysis->modelo);
        $this->assertSame(1, $analysis->version);
        $this->assertSame('CAJAMARCA', $analysis->propuestas_por_region[0]['nombre']);

        $faqs = DocumentFaq::where('document_id', $doc->id)->get();
        $this->assertCount(1, $faqs, 'la FAQ sin página se descarta');
        $this->assertSame('¿Hay riego?', $faqs[0]->pregunta);

        Bus::assertDispatched(EmbedDocumentSectionsJob::class, fn ($job) => $job->documentId === $doc->id);
        $this->assertSame('embeddings', $doc->fresh()->analysis_stage);
    }

    public function test_reprocessing_increments_the_analysis_version(): void
    {
        Bus::fake([EmbedDocumentSectionsJob::class]);
        Http::fake(['*generateContent*' => $this->geminiFullResponse()]);

        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'pages' => ['Unica pagina.']]);

        (new SinglePassAnalyzeDocumentJob($doc->id))->handle();
        (new SinglePassAnalyzeDocumentJob($doc->id))->handle();

        $this->assertSame(2, DocumentAnalysis::where('document_id', $doc->id)->value('version'));
    }

    public function test_a_document_without_pages_is_marked_as_an_analysis_error(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'pages' => []]);

        (new SinglePassAnalyzeDocumentJob($doc->id))->handle();

        $doc->refresh();
        $this->assertSame('error', $doc->analysis_status);
        $this->assertNotNull($doc->analysis_error);
    }

    public function test_a_sustained_gemini_failure_marks_the_document_as_an_analysis_error(): void
    {
        Http::fake(['*generateContent*' => Http::response(['error' => 'boom'], 500)]);

        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'pages' => ['Unica pagina.']]);

        try {
            (new SinglePassAnalyzeDocumentJob($doc->id))->handle();
            $this->fail('debía relanzar la excepción para que la cola la reintente');
        } catch (\Throwable $e) {
            // esperado: se relanza para que el mecanismo de reintentos de la cola la registre.
        }

        $doc->refresh();
        $this->assertSame('error', $doc->analysis_status);
        $this->assertNotNull($doc->analysis_error);
        $this->assertNotNull($doc->analysis_finished_at);
    }
}
