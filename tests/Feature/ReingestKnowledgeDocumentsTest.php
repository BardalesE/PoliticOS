<?php

namespace Tests\Feature;

use App\Jobs\ProcessKnowledgeDocumentJob;
use App\Models\KnowledgeDocument;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Los documentos subidos antes del fix de MAX_CHARS=80000 (PdfPageExtractor)
 * quedaron truncados. Este comando los re-encola para que el pipeline
 * completo (Fase 1) los vuelva a procesar sin truncar.
 */
class ReingestKnowledgeDocumentsTest extends TestCase
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
            $t->string('file_url')->nullable();
            $t->string('source_type', 20)->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
    }

    private function doc(int $contentLength, array $over = []): KnowledgeDocument
    {
        return KnowledgeDocument::create($over + [
            'title' => "Doc {$contentLength}", 'file_url' => 'https://cdn.test/x.pdf',
            'content' => str_repeat('a', $contentLength), 'is_active' => true, 'source_type' => 'pdf',
        ]);
    }

    public function test_by_default_only_reingests_documents_near_the_old_80k_cutoff(): void
    {
        Bus::fake();
        $truncated = $this->doc(80000);
        $normal    = $this->doc(500);

        $this->artisan('knowledge:reingest', ['--here' => true])->assertExitCode(0);

        Bus::assertDispatched(ProcessKnowledgeDocumentJob::class, fn ($job) => $job->documentId === $truncated->id);
        Bus::assertNotDispatched(ProcessKnowledgeDocumentJob::class, fn ($job) => $job->documentId === $normal->id);
    }

    public function test_the_all_flag_reingests_every_active_pdf(): void
    {
        Bus::fake();
        $this->doc(80000);
        $this->doc(500);

        $this->artisan('knowledge:reingest', ['--here' => true, '--all' => true])->assertExitCode(0);

        Bus::assertDispatchedTimes(ProcessKnowledgeDocumentJob::class, 2);
    }

    public function test_inactive_documents_are_never_reingested(): void
    {
        Bus::fake();
        $this->doc(80000, ['is_active' => false]);

        $this->artisan('knowledge:reingest', ['--here' => true, '--all' => true])->assertExitCode(0);

        Bus::assertNotDispatched(ProcessKnowledgeDocumentJob::class);
    }

    public function test_requires_a_slug_or_here(): void
    {
        $this->artisan('knowledge:reingest')->assertExitCode(1);
    }

    /** Punto 4: --only restringe a IDs específicos, ignorando el umbral de truncamiento. */
    public function test_the_only_flag_restricts_to_the_given_ids_ignoring_the_truncation_heuristic(): void
    {
        Bus::fake();
        $picked   = $this->doc(500); // normalmente no calificaría (no "truncado")
        $notAsked = $this->doc(80000);

        $this->artisan('knowledge:reingest', ['--here' => true, '--only' => (string) $picked->id])
            ->assertExitCode(0);

        Bus::assertDispatchedTimes(ProcessKnowledgeDocumentJob::class, 1);
        Bus::assertDispatched(ProcessKnowledgeDocumentJob::class, fn ($job) => $job->documentId === $picked->id);
        Bus::assertNotDispatched(ProcessKnowledgeDocumentJob::class, fn ($job) => $job->documentId === $notAsked->id);
    }

    public function test_the_only_flag_accepts_several_comma_separated_ids(): void
    {
        Bus::fake();
        $a = $this->doc(100);
        $b = $this->doc(200);
        $c = $this->doc(300);

        $this->artisan('knowledge:reingest', ['--here' => true, '--only' => "{$a->id},{$c->id}"])
            ->assertExitCode(0);

        Bus::assertDispatchedTimes(ProcessKnowledgeDocumentJob::class, 2);
        Bus::assertDispatched(ProcessKnowledgeDocumentJob::class, fn ($job) => $job->documentId === $a->id);
        Bus::assertDispatched(ProcessKnowledgeDocumentJob::class, fn ($job) => $job->documentId === $c->id);
        Bus::assertNotDispatched(ProcessKnowledgeDocumentJob::class, fn ($job) => $job->documentId === $b->id);
    }
}
