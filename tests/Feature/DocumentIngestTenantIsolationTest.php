<?php

namespace Tests\Feature;

use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Aislamiento multi-tenant de las tablas nuevas de la Fase 1. TenantContext::run
 * (ya probado en otro lado) aísla tenants reconfigurando y reconectando la
 * conexión por defecto `mysql` — esta prueba reproduce exactamente ese mismo
 * mecanismo (swap de config + DB::purge/reconnect) para confirmar que
 * DocumentSection/DocumentFaq/KnowledgeDocument, al no declarar un
 * `$connection` propio, SIEMPRE leen de la BD activa en ese momento: un
 * documento con el MISMO id en dos tenants nunca mezcla su contenido.
 */
class DocumentIngestTenantIsolationTest extends TestCase
{
    private string $dbA;
    private string $dbB;

    protected function setUp(): void
    {
        parent::setUp();

        // tempnam() ya crea el archivo (vacío): el conector sqlite de Laravel
        // exige que exista de antemano salvo con ':memory:'.
        $this->dbA = tempnam(sys_get_temp_dir(), 'tenantA');
        $this->dbB = tempnam(sys_get_temp_dir(), 'tenantB');

        config(['database.default' => 'mysql']);

        $this->provisionTenantDb($this->dbA, 'Plan de Gobierno — Candidato A', 'Propuesta exclusiva del candidato A sobre riego.');
        $this->provisionTenantDb($this->dbB, 'Plan de Gobierno — Candidato B', 'Propuesta exclusiva del candidato B sobre salud.');
    }

    protected function tearDown(): void
    {
        @unlink($this->dbA);
        @unlink($this->dbB);
        parent::tearDown();
    }

    /** Mismo swap que App\Services\TenantContext::run() hace sobre la conexión `mysql`. */
    private function useTenantDb(string $path): void
    {
        config(['database.connections.mysql' => [
            'driver' => 'sqlite', 'database' => $path, 'prefix' => '', 'foreign_key_constraints' => true,
        ]]);
        DB::purge('mysql');
        DB::reconnect('mysql');
    }

    private function provisionTenantDb(string $path, string $title, string $texto): void
    {
        $this->useTenantDb($path);

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->timestamps();
        });
        (require database_path('migrations/2026_11_14_000002_create_document_sections_table.php'))->up();
        (require database_path('migrations/2026_11_14_000004_create_document_faqs_table.php'))->up();

        $doc = KnowledgeDocument::create(['title' => $title]);
        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => null, 'texto' => $texto,
            'page_start' => 1, 'page_end' => 1, 'tokens' => 10,
        ]);
        DocumentFaq::create([
            'document_id' => $doc->id, 'pregunta' => "¿Qué propone? ({$title})", 'respuesta' => $texto, 'paginas' => [1],
        ]);
    }

    public function test_switching_the_active_tenant_connection_never_leaks_the_other_tenants_rows(): void
    {
        $this->useTenantDb($this->dbA);
        $this->assertSame('Plan de Gobierno — Candidato A', KnowledgeDocument::first()->title);
        $this->assertStringContainsString('candidato A', DocumentSection::first()->texto);
        $this->assertStringContainsString('candidato A', DocumentFaq::first()->respuesta);

        $this->useTenantDb($this->dbB);
        $this->assertSame('Plan de Gobierno — Candidato B', KnowledgeDocument::first()->title);
        $this->assertStringContainsString('candidato B', DocumentSection::first()->texto);
        $this->assertStringContainsString('candidato B', DocumentFaq::first()->respuesta);

        // El id autoincremental es el mismo (1) en ambas BDs: si el aislamiento
        // se rompiera por una conexión mal cerrada, este id compartido es
        // exactamente lo que haría que se sirviera contenido cruzado.
        $this->assertSame(1, KnowledgeDocument::first()->id);
        $this->assertSame(1, DocumentSection::first()->id);
    }

    public function test_going_back_to_the_first_tenant_still_sees_only_its_own_data(): void
    {
        $this->useTenantDb($this->dbA);
        $this->useTenantDb($this->dbB);
        $this->useTenantDb($this->dbA);

        $this->assertSame(1, KnowledgeDocument::count());
        $this->assertSame('Plan de Gobierno — Candidato A', KnowledgeDocument::first()->title);
    }
}
