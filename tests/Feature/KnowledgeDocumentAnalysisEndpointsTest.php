<?php

namespace Tests\Feature;

use App\Http\Controllers\KnowledgeDocumentController;
use App\Jobs\ProcessKnowledgeDocumentJob;
use App\Jobs\StartDocumentAnalysisJob;
use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\EmbeddingsServiceInterface;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Endpoints del admin para el polling de estado y los botones "Analizar plan
 * completo" / "Volver a analizar" / "Reintentar" / "Cancelar" del análisis
 * profundo. Se llama al controller directamente (en vez de por HTTP) para no
 * acoplar esta prueba al middleware admin/plan_feature, que no es parte de
 * lo que cambió aquí — ya cubierto para el resto de /admin/* en otras
 * pruebas (ver CheckPlanFeatureTest).
 */
class KnowledgeDocumentAnalysisEndpointsTest extends TestCase
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
        ]);
        DB::purge('sqlite');
        // store() hace app('tenant') incondicionalmente — fuera de una request
        // (no pasa por ResolveTenant) el binding no existe y eso revienta;
        // replica el bind-a-null que hace ResolveTenant en modo single-tenant.
        app()->bind('tenant', fn () => null);

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->text('description')->nullable();
            $t->string('topic', 40)->nullable();
            $t->longText('content')->nullable();
            $t->json('pages')->nullable();
            $t->string('file_url')->nullable();
            $t->string('original_name')->nullable();
            $t->string('source_url', 500)->nullable();
            $t->string('source_type', 20)->nullable();
            $t->unsignedBigInteger('file_size')->nullable();
            $t->boolean('embeddings_indexed')->default(false);
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('ready');
            $t->text('error_message')->nullable();
            $t->string('analysis_status', 20)->default('sin_analizar');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
            $t->string('analysis_batch_id')->nullable();
            $t->string('analysis_stage', 30)->nullable();
            $t->timestamp('analysis_started_at')->nullable();
            $t->timestamp('analysis_finished_at')->nullable();
            $t->timestamp('analyzed_at')->nullable();
            $t->boolean('is_public')->default(false);
            $t->timestamps();
        });

        foreach ([
            '2026_11_14_000002_create_document_sections_table',
            '2026_11_14_000003_create_document_analysis_table',
            '2026_11_14_000004_create_document_faqs_table',
        ] as $migration) {
            (require database_path("migrations/{$migration}.php"))->up();
        }
    }

    private function controller(): KnowledgeDocumentController
    {
        $embeddings = new class implements EmbeddingsServiceInterface {
            public function index(int $documentId, string $content, array $metadata = []): void {}
            public function search(string $query, int $topK = 5, array $filter = []): array { return []; }
            public function delete(int $documentId): void {}
        };

        return new KnowledgeDocumentController($embeddings);
    }

    public function test_analysis_status_exposes_progress_and_error(): void
    {
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'analysis_status' => 'procesando', 'analysis_progress' => 42,
        ]);

        $json = $this->controller()->analysisStatus($doc->id)->getData(true);

        $this->assertSame('procesando', $json['analysis_status']);
        $this->assertSame(42, $json['analysis_progress']);
        $this->assertNull($json['analysis_error']);
    }

    public function test_retry_analysis_resets_error_and_dispatches_the_job(): void
    {
        Bus::fake();
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'pages' => ['pagina 1'],
            'analysis_status' => 'error', 'analysis_error' => 'Groq caído',
        ]);

        $response = $this->controller()->retryAnalysis($doc->id);

        $this->assertSame(200, $response->getStatusCode());
        $doc->refresh();
        $this->assertSame('pendiente', $doc->analysis_status);
        $this->assertNull($doc->analysis_error);
        Bus::assertDispatched(StartDocumentAnalysisJob::class, fn ($job) => $job->documentId === $doc->id);
    }

    public function test_retry_analysis_refuses_a_document_without_extracted_pages(): void
    {
        Bus::fake();
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'pages' => null]);

        $response = $this->controller()->retryAnalysis($doc->id);

        $this->assertSame(422, $response->getStatusCode());
        Bus::assertNotDispatched(StartDocumentAnalysisJob::class);
    }

    public function test_retry_analysis_refuses_a_hoja_de_vida(): void
    {
        Bus::fake();
        $doc = KnowledgeDocument::create(['title' => 'HV', 'topic' => 'hoja_de_vida', 'pages' => ['datos']]);

        $response = $this->controller()->retryAnalysis($doc->id);

        $this->assertSame(422, $response->getStatusCode());
        Bus::assertNotDispatched(StartDocumentAnalysisJob::class);
    }

    // ── Botón "Analizar plan completo" ─────────────────────────────────

    public function test_analyze_resets_the_document_and_chains_extraction_then_analysis(): void
    {
        Bus::fake();
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'file_url' => 'https://cdn.test/plan.pdf',
            'analysis_status' => 'error', 'analysis_error' => 'fallo anterior', 'analysis_batch_id' => 'batch-viejo',
        ]);

        $response = $this->controller()->analyze($doc->id);

        $this->assertSame(200, $response->getStatusCode());
        $doc->refresh();
        $this->assertSame('pending', $doc->status);
        $this->assertSame('pendiente', $doc->analysis_status);
        $this->assertNull($doc->analysis_error);
        $this->assertNull($doc->analysis_batch_id);

        Bus::assertChained([
            fn (ProcessKnowledgeDocumentJob $job) => $job->documentId === $doc->id,
            fn (StartDocumentAnalysisJob $job) => $job->documentId === $doc->id,
        ]);
    }

    public function test_analyze_refuses_a_hoja_de_vida(): void
    {
        Bus::fake();
        $doc = KnowledgeDocument::create(['title' => 'HV', 'topic' => 'hoja_de_vida', 'file_url' => 'https://cdn.test/hv.pdf']);

        $response = $this->controller()->analyze($doc->id);

        $this->assertSame(422, $response->getStatusCode());
        Bus::assertNothingDispatched();
    }

    // ── Botón "Cancelar" ────────────────────────────────────────────────

    public function test_cancel_analysis_refuses_when_nothing_is_running(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'analysis_status' => 'sin_analizar']);

        $response = $this->controller()->cancelAnalysis($doc->id);

        $this->assertSame(422, $response->getStatusCode());
        $this->assertSame('sin_analizar', $doc->fresh()->analysis_status);
    }

    public function test_cancel_analysis_resets_to_sin_analizar_while_queued_without_a_batch_yet(): void
    {
        // Ventana entre el click en "Analizar" y que StartDocumentAnalysisJob
        // alcance a crear el batch: analysis_batch_id todavía es null.
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'analysis_status' => 'pendiente', 'analysis_progress' => 0]);

        $response = $this->controller()->cancelAnalysis($doc->id);

        $this->assertSame(200, $response->getStatusCode());
        $doc->refresh();
        $this->assertSame('sin_analizar', $doc->analysis_status);
        $this->assertSame(0, $doc->analysis_progress);
        $this->assertNull($doc->analysis_batch_id);
    }

    public function test_cancel_analysis_while_processing_resets_to_sin_analizar(): void
    {
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'analysis_status' => 'procesando', 'analysis_progress' => 40,
            'analysis_batch_id' => 'un-batch-que-no-existe-en-el-repositorio',
        ]);

        // Bus::findBatch() de un id que no existe en el repositorio real
        // devuelve null (no lanza) — el controller debe seguir limpiando el
        // documento igual. El caso con un batch REAL (cancelarlo + vaciar sus
        // jobs pendientes de la cola) se cubre con infraestructura de cola
        // real en TenantAwareQueueCentralTest/CancelAnalysisBatchTest.
        $response = $this->controller()->cancelAnalysis($doc->id);

        $this->assertSame(200, $response->getStatusCode());
        $doc->refresh();
        $this->assertSame('sin_analizar', $doc->analysis_status);
        $this->assertNull($doc->analysis_batch_id);
    }

    // ── Botón "Ver análisis" ────────────────────────────────────────────

    public function test_analysis_detail_exposes_summary_proposals_faqs_and_coverage(): void
    {
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'analysis_status' => 'listo',
            'pages' => array_fill(0, 10, 'texto'),
        ]);

        DocumentAnalysis::create([
            'document_id'           => $doc->id,
            'indice_estructurado'   => [['titulo' => 'Eje 1', 'orden' => 1]],
            'resumen_ejecutivo'     => 'Resumen del plan.',
            'propuestas_por_eje'    => ['Eje 1' => ['eje' => 'Eje 1', 'resumen' => 'r', 'propuestas' => []]],
            'propuestas_por_region' => [['nombre' => 'San Miguel', 'propuestas' => []]],
        ]);

        DocumentFaq::create([
            'document_id' => $doc->id, 'pregunta' => '¿Qué propone?', 'respuesta' => 'Esto.', 'paginas' => [3],
        ]);

        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => 'Eje 1', 'texto' => 'texto 1',
            'page_start' => 1, 'page_end' => 4, 'tokens' => 100,
        ]);
        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 1, 'titulo' => 'Eje 2', 'texto' => 'texto 2',
            'page_start' => 4, 'page_end' => 6, 'tokens' => 100,
        ]);

        $json = $this->controller()->analysisDetail($doc->id)->getData(true);

        $this->assertSame('Resumen del plan.', $json['resumen_ejecutivo']);
        $this->assertSame([['titulo' => 'Eje 1', 'orden' => 1]], $json['indice_estructurado']);
        $this->assertArrayHasKey('Eje 1', $json['propuestas_por_eje']);
        $this->assertCount(1, $json['propuestas_por_region']);
        $this->assertCount(1, $json['faqs']);
        $this->assertSame('¿Qué propone?', $json['faqs'][0]['pregunta']);
        $this->assertSame(10, $json['pages_total']);
        $this->assertSame(6, $json['pages_covered']); // paginas 1-6 (1-4 ∪ 4-6)
        $this->assertSame(2, $json['sections_count']);
    }

    public function test_analysis_detail_refuses_a_document_that_is_not_ready(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'analysis_status' => 'procesando']);

        $response = $this->controller()->analysisDetail($doc->id);

        $this->assertSame(422, $response->getStatusCode());
    }

    // ── index() con per_page (lista completa para agrupar por candidato) ──

    public function test_index_accepts_a_per_page_override_to_fetch_every_document(): void
    {
        foreach (range(1, 3) as $i) {
            KnowledgeDocument::create(['title' => "Doc {$i}"]);
        }

        $response = $this->controller()->index(new \Illuminate\Http\Request(['per_page' => 100]));
        $json = $response->getData(true);

        $this->assertSame(3, $json['total']);
        $this->assertCount(3, $json['data']);
    }

    public function test_index_exposes_section_and_faq_counts_for_the_progress_card(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan']);
        DocumentSection::create(['document_id' => $doc->id, 'orden' => 0, 'texto' => 'a', 'page_start' => 1, 'page_end' => 1, 'tokens' => 1, 'map_status' => 'listo']);
        DocumentSection::create(['document_id' => $doc->id, 'orden' => 1, 'texto' => 'b', 'page_start' => 2, 'page_end' => 2, 'tokens' => 1, 'map_status' => 'pendiente']);
        DocumentFaq::create(['document_id' => $doc->id, 'pregunta' => '¿?', 'respuesta' => '.', 'paginas' => [1]]);

        $json = $this->controller()->index(new \Illuminate\Http\Request())->getData(true);
        $row = $json['data'][0];

        $this->assertSame(2, $row['sections_total']);
        $this->assertSame(1, $row['sections_done']);
        $this->assertSame(1, $row['faqs_count']);
    }

    // ── Puntos 1/2/8: tiempos, etapa y los mismos en analysis-status ──────

    public function test_analyze_marks_when_the_real_analysis_started_and_the_stage(): void
    {
        Bus::fake();
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'file_url' => 'https://cdn.test/plan.pdf']);

        $this->controller()->analyze($doc->id);

        $doc->refresh();
        $this->assertNotNull($doc->analysis_started_at);
        $this->assertNull($doc->analysis_finished_at);
        $this->assertSame('extrayendo', $doc->analysis_stage);
    }

    public function test_retry_analysis_marks_when_the_real_analysis_started(): void
    {
        Bus::fake();
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'pages' => ['p1'], 'analysis_status' => 'error']);

        $this->controller()->retryAnalysis($doc->id);

        $this->assertNotNull($doc->fresh()->analysis_started_at);
    }

    public function test_cancel_analysis_clears_stage_and_timestamps(): void
    {
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'analysis_status' => 'procesando', 'analysis_stage' => 'resumiendo_secciones',
            'analysis_started_at' => now()->subMinutes(5),
        ]);

        $this->controller()->cancelAnalysis($doc->id);

        $doc->refresh();
        $this->assertNull($doc->analysis_stage);
        $this->assertNull($doc->analysis_started_at);
        $this->assertNull($doc->analysis_finished_at);
    }

    public function test_analysis_status_endpoint_exposes_stage_timestamps_and_section_counts(): void
    {
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'analysis_status' => 'procesando', 'analysis_stage' => 'resumiendo_secciones',
            'analysis_started_at' => now()->subMinutes(3),
        ]);
        DocumentSection::create(['document_id' => $doc->id, 'orden' => 0, 'texto' => 'a', 'page_start' => 1, 'page_end' => 1, 'tokens' => 1, 'map_status' => 'listo']);
        DocumentSection::create(['document_id' => $doc->id, 'orden' => 1, 'texto' => 'b', 'page_start' => 2, 'page_end' => 2, 'tokens' => 1, 'map_status' => 'pendiente']);

        $json = $this->controller()->analysisStatus($doc->id)->getData(true);

        $this->assertSame('resumiendo_secciones', $json['analysis_stage']);
        $this->assertNotNull($json['analysis_started_at']);
        $this->assertNull($json['analysis_finished_at']);
        $this->assertSame(2, $json['sections_total']);
        $this->assertSame(1, $json['sections_done']);
    }

    // ── Punto 7: una hoja de vida nunca debe contarse como "sin analizar" ──

    public function test_uploading_a_hoja_de_vida_never_leaves_it_in_sin_analizar(): void
    {
        Bus::fake();
        Storage::fake('public');
        config(['filesystems.media' => 'public']);
        app()->bind('tenant', fn () => null);

        $request = \Illuminate\Http\Request::create('/api/admin/knowledge', 'POST', [
            'title' => 'HV', 'topic' => 'hoja_de_vida',
        ], [], ['file' => UploadedFile::fake()->create('hv.pdf', 10, 'application/pdf')]);

        $response = $this->controller()->store($request);
        $doc = KnowledgeDocument::find($response->getData(true)['id']);

        $this->assertSame('no_aplica', $doc->analysis_status);
    }

    public function test_uploading_a_plan_de_gobierno_starts_at_sin_analizar_not_pendiente(): void
    {
        Bus::fake();
        Storage::fake('public');
        config(['filesystems.media' => 'public']);
        app()->bind('tenant', fn () => null);

        $request = \Illuminate\Http\Request::create('/api/admin/knowledge', 'POST', [
            'title' => 'Plan', 'topic' => 'plan_de_gobierno',
        ], [], ['file' => UploadedFile::fake()->create('plan.pdf', 10, 'application/pdf')]);

        $response = $this->controller()->store($request);
        $doc = KnowledgeDocument::find($response->getData(true)['id']);

        $this->assertSame('sin_analizar', $doc->analysis_status);
    }

    public function test_changing_topic_to_hoja_de_vida_switches_analysis_status_to_no_aplica(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'topic' => 'plan_de_gobierno', 'analysis_status' => 'sin_analizar']);

        $request = \Illuminate\Http\Request::create('/x', 'PUT', ['topic' => 'hoja_de_vida']);
        $this->controller()->update($request, $doc->id);

        $this->assertSame('no_aplica', $doc->fresh()->analysis_status);
    }

    public function test_changing_topic_away_from_hoja_de_vida_switches_analysis_status_to_sin_analizar(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'HV', 'topic' => 'hoja_de_vida', 'analysis_status' => 'no_aplica']);

        $request = \Illuminate\Http\Request::create('/x', 'PUT', ['topic' => 'plan_de_gobierno']);
        $this->controller()->update($request, $doc->id);

        $this->assertSame('sin_analizar', $doc->fresh()->analysis_status);
    }
}
