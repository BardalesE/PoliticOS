<?php

namespace Tests\Feature;

use App\Jobs\MapDocumentChunkJob;
use App\Jobs\ReduceDocumentJob;
use App\Jobs\StartDocumentAnalysisJob;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Antes, un plan de 200+ páginas se "analizaba" en ~13%: este job es el punto
 * donde se garantiza que TODAS las páginas terminan en algún chunk (vía
 * DocumentChunker, ya probado aparte) y que reintentar no vuelve a pagar
 * tokens por lo que ya se mapeó (idempotencia).
 */
class StartDocumentAnalysisJobTest extends TestCase
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
            'ingest.chunking.fallback_tokens' => 1500,
            'ingest.chunking.overlap_tokens' => 200,
        ]);
        DB::purge('sqlite');

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
            $t->string('analysis_status', 20)->default('pendiente');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
            $t->string('analysis_batch_id')->nullable();
            $t->boolean('is_public')->default(false);
            $t->timestamps();
        });

        (require database_path('migrations/2026_11_14_000002_create_document_sections_table.php'))->up();
    }

    private function doc(array $pages, array $over = []): KnowledgeDocument
    {
        return KnowledgeDocument::create($over + ['title' => 'Plan', 'pages' => $pages, 'candidate_id' => 7]);
    }

    public function test_creates_one_chunk_per_detected_section_and_dispatches_a_map_batch(): void
    {
        Bus::fake();
        $doc = $this->doc([
            'PLAN DE GOBIERNO Presentacion.',
            'EJE 1 Agricultura y riego para la zona alta.',
            'CAPITULO II Diagnostico de salud.',
        ]);

        (new StartDocumentAnalysisJob($doc->id))->handle();

        $this->assertGreaterThan(0, DocumentSection::where('document_id', $doc->id)->count());
        $this->assertSame('procesando', $doc->fresh()->analysis_status);

        Bus::assertBatched(function ($batch) {
            return $batch->jobs->count() === DocumentSection::count()
                && $batch->jobs->first() instanceof MapDocumentChunkJob;
        });
    }

    public function test_running_it_twice_does_not_duplicate_chunks(): void
    {
        Bus::fake();
        $doc = $this->doc(['Texto de la unica pagina del documento.']);

        (new StartDocumentAnalysisJob($doc->id))->handle();
        $firstCount = DocumentSection::where('document_id', $doc->id)->count();

        (new StartDocumentAnalysisJob($doc->id))->handle();
        $secondCount = DocumentSection::where('document_id', $doc->id)->count();

        $this->assertSame($firstCount, $secondCount);
    }

    public function test_when_every_chunk_is_already_mapped_it_skips_straight_to_reduce(): void
    {
        Bus::fake();
        $doc = $this->doc(['Texto de la unica pagina del documento.']);

        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => null, 'texto' => 'x',
            'page_start' => 1, 'page_end' => 1, 'tokens' => 5, 'map_status' => 'listo',
            'map_json' => ['resumen' => 'ok', 'propuestas' => [], 'ejes' => [], 'regiones_mencionadas' => [], 'paginas' => [1]],
        ]);

        (new StartDocumentAnalysisJob($doc->id))->handle();

        Bus::assertDispatched(ReduceDocumentJob::class);
    }

    /** Fase 3.2a: un reintento parcial (falló a medias) no vuelve a pagar tokens por lo que ya está listo. */
    public function test_retrying_after_a_partial_failure_only_re_dispatches_the_pending_chunks(): void
    {
        Bus::fake();
        $doc = $this->doc([
            'EJE 1: primera pagina con suficiente contenido para ser un chunk.',
            'EJE 2: segunda pagina con contenido distinto para otro chunk.',
            'EJE 3: tercera pagina, tambien con su propio contenido.',
        ]);

        (new StartDocumentAnalysisJob($doc->id))->handle();
        $sections = DocumentSection::where('document_id', $doc->id)->orderBy('orden')->get();
        $this->assertGreaterThanOrEqual(3, $sections->count());

        // Simula que el batch anterior mapeó 2 de 3 y el tercero quedó en error.
        $sections[0]->update(['map_status' => 'listo', 'map_json' => ['resumen' => 'ok', 'propuestas' => [], 'ejes' => [], 'regiones_mencionadas' => [], 'paginas' => [1]]]);
        $sections[1]->update(['map_status' => 'listo', 'map_json' => ['resumen' => 'ok', 'propuestas' => [], 'ejes' => [], 'regiones_mencionadas' => [], 'paginas' => [2]]]);
        $sections[2]->update(['map_status' => 'error', 'map_error' => 'fallo anterior']);

        Bus::fake(); // limpia las aserciones del primer handle() antes del reintento
        (new StartDocumentAnalysisJob($doc->id))->handle();

        Bus::assertBatched(function ($batch) use ($sections) {
            // Solo el chunk #3 (el que no estaba listo) debe ir en el batch del reintento.
            return $batch->jobs->count() === 1
                && $batch->jobs->first() instanceof MapDocumentChunkJob
                && $batch->jobs->first()->sectionId === $sections[2]->id;
        });
    }

    public function test_a_document_without_extracted_pages_is_marked_as_an_analysis_error(): void
    {
        $doc = $this->doc([]);

        (new StartDocumentAnalysisJob($doc->id))->handle();

        $doc->refresh();
        $this->assertSame('error', $doc->analysis_status);
        $this->assertNotNull($doc->analysis_error);
    }

    /** Punto 5: la hoja de vida (formulario JNE) nunca entra al análisis profundo. */
    public function test_a_hoja_de_vida_is_never_analyzed(): void
    {
        Bus::fake();
        $doc = $this->doc(['Datos personales: Juan Perez. Sentencias: ninguna.'], ['topic' => 'hoja_de_vida']);

        (new StartDocumentAnalysisJob($doc->id))->handle();

        $doc->refresh();
        $this->assertSame('no_aplica', $doc->analysis_status);
        $this->assertSame(0, DocumentSection::where('document_id', $doc->id)->count());
        Bus::assertNothingBatched();
        Bus::assertNotDispatched(ReduceDocumentJob::class);
    }
}
