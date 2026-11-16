<?php

namespace Tests\Feature;

use App\Http\Controllers\KnowledgeDocumentController;
use App\Jobs\ProcessKnowledgeDocumentJob;
use App\Jobs\StartDocumentAnalysisJob;
use App\Models\KnowledgeDocument;
use App\Services\EmbeddingsServiceInterface;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->string('topic', 40)->nullable();
            $t->longText('content')->nullable();
            $t->json('pages')->nullable();
            $t->string('file_url')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('ready');
            $t->text('error_message')->nullable();
            $t->string('analysis_status', 20)->default('sin_analizar');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
            $t->string('analysis_batch_id')->nullable();
            $t->boolean('is_public')->default(false);
            $t->timestamps();
        });
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
}
