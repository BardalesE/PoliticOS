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
 * Botón "Cancelar" con un batch REAL en curso (sin Bus::fake, cola
 * 'database' de verdad — mismo espíritu que TenantAwareQueueCentralTest):
 * debe cancelar el Bus::batch de MapDocumentChunkJob Y vaciar sus jobs
 * pendientes de `central.jobs` ya mismo — no basta con marcar cancelled_at y
 * esperar a que el worker los descarte cuando los tome (ver
 * KnowledgeDocumentController::cancelAnalysis).
 */
class CancelAnalysisBatchTest extends TestCase
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
            'database.connections.central' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true,
            ],
            'queue.default'                          => 'database',
            'queue.connections.database.connection'   => 'central',
            'queue.connections.database.table'        => 'jobs',
            'queue.connections.database.queue'        => 'default',
            'queue.connections.database.retry_after'  => 60,
            'queue.batching.database'                 => 'central',
            'queue.batching.table'                     => 'job_batches',
            'queue.failed.database'                   => 'central',
            'queue.failed.table'                       => 'failed_jobs',
            'ingest.chunking.fallback_tokens'          => 1500,
            'ingest.chunking.overlap_tokens'           => 200,
            // Este test cancela un batch REAL de MapDocumentChunkJob — es
            // específico del modo legacy; single_pass_gemini (nuevo default)
            // no crea batch (ver SinglePassAnalyzeDocumentJobTest).
            'ingest.analysis.mode'                      => 'map_reduce_groq',
        ]);
        DB::purge('sqlite');
        DB::purge('central');

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->string('topic', 40)->nullable();
            $t->longText('content')->nullable();
            $t->json('pages')->nullable();
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
            $t->boolean('is_public')->default(false);
            $t->timestamps();
        });
        (require database_path('migrations/2026_11_14_000002_create_document_sections_table.php'))->up();

        Schema::connection('central')->create('jobs', function (Blueprint $t) {
            $t->id();
            $t->string('queue')->index();
            $t->longText('payload');
            $t->unsignedTinyInteger('attempts');
            $t->unsignedInteger('reserved_at')->nullable();
            $t->unsignedInteger('available_at');
            $t->unsignedInteger('created_at');
        });
        Schema::connection('central')->create('job_batches', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->string('name');
            $t->integer('total_jobs');
            $t->integer('pending_jobs');
            $t->integer('failed_jobs');
            $t->longText('failed_job_ids');
            $t->mediumText('options')->nullable();
            $t->integer('cancelled_at')->nullable();
            $t->integer('created_at');
            $t->integer('finished_at')->nullable();
        });
        Schema::connection('central')->create('failed_jobs', function (Blueprint $t) {
            $t->id();
            $t->string('uuid')->unique();
            $t->text('connection');
            $t->text('queue');
            $t->longText('payload');
            $t->longText('exception');
            $t->timestamp('failed_at')->useCurrent();
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

    public function test_cancel_analysis_cancels_the_real_batch_and_deletes_its_pending_queue_jobs(): void
    {
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'candidate_id' => 1,
            'pages' => ['EJE 1: primera pagina.', 'EJE 2: segunda pagina.', 'EJE 3: tercera pagina.'],
        ]);

        // Arranca el análisis de verdad (sin Bus::fake): crea las secciones +
        // el batch real de MapDocumentChunkJob, con sus jobs ya en central.jobs.
        (new StartDocumentAnalysisJob($doc->id))->handle();

        $doc->refresh();
        $this->assertSame('procesando', $doc->analysis_status);
        $this->assertNotNull($doc->analysis_batch_id);
        $batchId = $doc->analysis_batch_id;
        $this->assertGreaterThan(0, DB::connection('central')->table('jobs')->count());

        $response = $this->controller()->cancelAnalysis($doc->id);

        $this->assertSame(200, $response->getStatusCode());
        $doc->refresh();
        $this->assertSame('sin_analizar', $doc->analysis_status);
        $this->assertNull($doc->analysis_batch_id);

        $this->assertSame(
            0,
            DB::connection('central')->table('jobs')->count(),
            'los jobs MAP pendientes deben borrarse de la cola, no solo marcarse cancelados'
        );

        $batch = Bus::findBatch($batchId);
        $this->assertNotNull($batch);
        $this->assertTrue($batch->cancelled());
    }

    public function test_cancel_analysis_refuses_once_the_batch_already_finished(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'analysis_status' => 'listo']);

        $response = $this->controller()->cancelAnalysis($doc->id);

        $this->assertSame(422, $response->getStatusCode());
    }
}
