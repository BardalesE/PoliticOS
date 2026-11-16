<?php

namespace Tests\Feature;

use App\Http\Controllers\KnowledgeDocumentController;
use App\Jobs\StartDocumentAnalysisJob;
use App\Models\KnowledgeDocument;
use App\Services\EmbeddingsServiceInterface;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Endpoints del admin para el polling de estado y el botón "Reprocesar" del
 * análisis profundo (Fase 1.9). Se llama al controller directamente (en vez
 * de por HTTP) para no acoplar esta prueba al middleware admin/plan_feature,
 * que no es parte de lo que cambió aquí.
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
            $t->longText('content')->nullable();
            $t->json('pages')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('ready');
            $t->text('error_message')->nullable();
            $t->string('analysis_status', 20)->default('pendiente');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
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
}
