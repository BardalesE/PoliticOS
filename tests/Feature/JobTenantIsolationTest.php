<?php

namespace Tests\Feature;

use App\Jobs\StartDocumentAnalysisJob;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Fase 3.2b — aislamiento multi-tenant a nivel de JOB (no solo de query
 * directa, ya cubierto en DocumentIngestTenantIsolationTest de la Fase 1):
 * StartDocumentAnalysisJob, corriendo con el MISMO document_id en dos BDs de
 * tenant distintas, nunca debe crear ni leer secciones de la otra.
 */
class JobTenantIsolationTest extends TestCase
{
    private string $dbA;
    private string $dbB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->dbA = tempnam(sys_get_temp_dir(), 'jobTenantA');
        $this->dbB = tempnam(sys_get_temp_dir(), 'jobTenantB');

        config(['database.default' => 'mysql', 'ingest.chunking.fallback_tokens' => 1500, 'ingest.chunking.overlap_tokens' => 200]);

        $this->provisionTenantDb($this->dbA, 'Plan del candidato A', 'Propuesta exclusiva de riego para el candidato A.');
        $this->provisionTenantDb($this->dbB, 'Plan del candidato B', 'Propuesta exclusiva de salud para el candidato B.');
    }

    protected function tearDown(): void
    {
        @unlink($this->dbA);
        @unlink($this->dbB);
        parent::tearDown();
    }

    private function useTenantDb(string $path): void
    {
        config(['database.connections.mysql' => [
            'driver' => 'sqlite', 'database' => $path, 'prefix' => '', 'foreign_key_constraints' => true,
        ]]);
        DB::purge('mysql');
        DB::reconnect('mysql');
    }

    private function provisionTenantDb(string $path, string $title, string $pageText): void
    {
        $this->useTenantDb($path);

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->longText('content')->nullable();
            $t->json('pages')->nullable();
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('ready');
            $t->text('error_message')->nullable();
            $t->string('analysis_status', 20)->default('pendiente');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
            $t->boolean('is_public')->default(false);
            $t->timestamps();
        });
        (require database_path('migrations/2026_11_14_000002_create_document_sections_table.php'))->up();

        KnowledgeDocument::create(['id' => 1, 'title' => $title, 'pages' => [$pageText]]);
    }

    public function test_the_same_document_id_in_two_tenants_never_mixes_sections(): void
    {
        Bus::fake();

        $this->useTenantDb($this->dbA);
        (new StartDocumentAnalysisJob(1, null))->handle();

        $this->useTenantDb($this->dbB);
        (new StartDocumentAnalysisJob(1, null))->handle();

        $this->useTenantDb($this->dbA);
        $sectionsA = DocumentSection::where('document_id', 1)->get();
        $this->assertCount(1, $sectionsA);
        $this->assertStringContainsString('candidato A', $sectionsA[0]->texto);

        $this->useTenantDb($this->dbB);
        $sectionsB = DocumentSection::where('document_id', 1)->get();
        $this->assertCount(1, $sectionsB);
        $this->assertStringContainsString('candidato B', $sectionsB[0]->texto);
    }
}
