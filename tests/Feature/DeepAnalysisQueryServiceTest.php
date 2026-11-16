<?php

namespace Tests\Feature;

use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\DeepAnalysisQueryService;
use App\Services\Embeddings\CosineSimilarity;
use App\Services\MySQLFulltextEmbeddings;
use App\Services\VagueQuestionDetector;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Clasificador de intención de la Fase 2: vaga→menú, FAQ cercana→cacheada,
 * específica→fragmentos de document_sections + léxico + región, siempre SIN
 * exponer un documento que todavía no terminó su análisis (is_public=false).
 */
class DeepAnalysisQueryServiceTest extends TestCase
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
            'ingest.embeddings.driver' => 'gemini',
            'ingest.embeddings.gemini.api_key' => 'test-key',
            'ingest.embeddings.gemini.dimensions' => 4,
            'ingest.query.faq_similarity_threshold' => 0.85,
            'ingest.query.rag_top_k' => 6,
            'ingest.query.context_token_budget' => 6000,
            'ingest.chunking.chars_per_token' => 4,
        ]);
        DB::purge('sqlite');

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->longText('content')->nullable();
            $t->json('pages')->nullable();
            $t->string('topic', 40)->nullable();
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->string('file_url')->nullable();
            $t->string('source_url', 500)->nullable();
            $t->string('source_type', 20)->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('ready');
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

    private function service(): DeepAnalysisQueryService
    {
        return new DeepAnalysisQueryService(new MySQLFulltextEmbeddings(), new VagueQuestionDetector());
    }

    private function vec(float $a, float $b, float $c, float $d): array
    {
        return [$a, $b, $c, $d];
    }

    public function test_returns_null_when_the_candidate_has_no_deep_analysis_yet(): void
    {
        KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'is_public' => false]);

        $this->assertNull($this->service()->classify('¿Qué propones sobre agricultura?', 1, 'Ana'));
    }

    public function test_vague_question_returns_a_menu_without_calling_the_embedder(): void
    {
        Http::fake();
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'is_public' => true, 'is_active' => true]);
        DocumentAnalysis::create([
            'document_id' => $doc->id,
            'resumen_ejecutivo' => 'El plan prioriza agua, salud y educación para el distrito.',
            'indice_estructurado' => [['titulo' => 'Agua y saneamiento', 'orden' => 1], ['titulo' => 'Salud', 'orden' => 2]],
            'version' => 1,
        ]);

        $out = $this->service()->classify('Resume el plan', 1, 'Ana Pérez');

        $this->assertSame('menu', $out['type']);
        $this->assertStringContainsString('inteligencia artificial', $out['reply']);
        $this->assertStringContainsString('Ana Pérez', $out['reply']);
        $this->assertStringContainsString('agua, salud y educación', $out['reply']);
        $this->assertStringContainsString('Agua y saneamiento', $out['reply']);
        Http::assertNothingSent();
    }

    public function test_menu_never_includes_a_raw_url(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'is_public' => true]);
        DocumentAnalysis::create([
            'document_id' => $doc->id,
            'resumen_ejecutivo' => 'Visita https://malicioso.test/x para más info sobre el plan.',
            'version' => 1,
        ]);

        $out = $this->service()->classify('resumen del plan', 1, null);

        $this->assertStringNotContainsString('http', $out['reply']);
    }

    public function test_a_question_close_to_an_existing_faq_returns_the_cached_answer(): void
    {
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'candidate_id' => 1, 'is_public' => true,
            'source_url' => 'https://cdn.test/plan.pdf',
        ]);
        DocumentFaq::create([
            'document_id' => $doc->id, 'candidate_id' => 1,
            'pregunta' => '¿Hay canal de riego para la zona alta?',
            'respuesta' => 'Sí, el plan propone el canal de riego Agua Blanca.',
            'paginas' => [42],
            'embedding' => CosineSimilarity::pack($this->vec(1, 0, 0, 0)),
        ]);

        Http::fake(['*batchEmbedContents*' => Http::response(['embeddings' => [['values' => [1, 0, 0, 0]]]], 200)]);

        $out = $this->service()->classify('¿Hay canal de riego para la zona alta o no?', 1, null);

        $this->assertSame('faq', $out['type']);
        $this->assertSame('Sí, el plan propone el canal de riego Agua Blanca.', $out['reply']);
        $this->assertSame(42, $out['citations'][0]['page']);
        $this->assertSame('https://cdn.test/plan.pdf', $out['citations'][0]['url']);
    }

    public function test_a_faq_below_the_threshold_falls_through_to_rag(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'is_public' => true]);
        DocumentFaq::create([
            'document_id' => $doc->id, 'candidate_id' => 1,
            'pregunta' => 'algo totalmente distinto', 'respuesta' => 'x', 'paginas' => [1],
            'embedding' => CosineSimilarity::pack($this->vec(0, 1, 0, 0)), // ortogonal a [1,0,0,0] → score 0
        ]);
        DocumentSection::create([
            'document_id' => $doc->id, 'candidate_id' => 1, 'orden' => 0, 'titulo' => null,
            'texto' => 'Canal de riego Agua Blanca para la zona alta.', 'page_start' => 5, 'page_end' => 5,
            'tokens' => 10, 'map_status' => 'listo',
            'embedding' => CosineSimilarity::pack($this->vec(1, 0, 0, 0)),
        ]);

        Http::fake(['*batchEmbedContents*' => Http::response(['embeddings' => [['values' => [1, 0, 0, 0]]]], 200)]);

        $out = $this->service()->classify('¿qué dice sobre el canal de riego?', 1, null);

        $this->assertSame('rag', $out['type']);
        $this->assertNotEmpty($out['docs']);
    }

    public function test_specific_question_returns_the_best_matching_section_by_cosine_similarity(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'is_public' => true]);
        DocumentSection::create([
            'document_id' => $doc->id, 'candidate_id' => 1, 'orden' => 0, 'titulo' => 'EJE 1',
            'texto' => 'Canal de riego Agua Blanca para productores agricolas.', 'page_start' => 10, 'page_end' => 10,
            'tokens' => 10, 'map_status' => 'listo',
            'embedding' => CosineSimilarity::pack($this->vec(1, 0, 0, 0)),
        ]);
        DocumentSection::create([
            'document_id' => $doc->id, 'candidate_id' => 1, 'orden' => 1, 'titulo' => 'EJE 2',
            'texto' => 'Posta de salud para el centro poblado.', 'page_start' => 20, 'page_end' => 20,
            'tokens' => 10, 'map_status' => 'listo',
            'embedding' => CosineSimilarity::pack($this->vec(0, 1, 0, 0)),
        ]);

        Http::fake(['*batchEmbedContents*' => Http::response(['embeddings' => [['values' => [1, 0, 0, 0]]]], 200)]);

        $out = $this->service()->classify('¿qué propone sobre riego y agricultura?', 1, null);

        $this->assertSame('rag', $out['type']);
        $this->assertSame(10, $out['docs'][0]['page']);
        $this->assertStringContainsString('riego', $out['docs'][0]['excerpt']);
    }

    public function test_mentioning_a_region_surfaces_its_propuestas_por_region_first(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => 1, 'is_public' => true]);
        DocumentAnalysis::create([
            'document_id' => $doc->id,
            'propuestas_por_region' => [[
                'nombre' => 'San Miguel', 'nivel' => 'distrito',
                'propuestas' => [['texto' => 'Construir el mercado de San Miguel', 'paginas' => [33]]],
            ]],
            'version' => 1,
        ]);
        DocumentSection::create([
            'document_id' => $doc->id, 'candidate_id' => 1, 'orden' => 0, 'titulo' => null,
            'texto' => 'Texto general sin mencionar San Miguel.', 'page_start' => 1, 'page_end' => 1,
            'tokens' => 5, 'map_status' => 'listo',
            'embedding' => CosineSimilarity::pack($this->vec(1, 0, 0, 0)),
        ]);

        Http::fake(['*batchEmbedContents*' => Http::response(['embeddings' => [['values' => [1, 0, 0, 0]]]], 200)]);

        $out = $this->service()->classify('¿qué propone para San Miguel?', 1, null);

        $this->assertSame('rag', $out['type']);
        $this->assertStringContainsString('San Miguel', $out['docs'][0]['title']);
        $this->assertStringContainsString('mercado de San Miguel', $out['docs'][0]['excerpt']);
    }

    public function test_an_embedder_failure_degrades_to_lexical_only_instead_of_breaking(): void
    {
        $doc = KnowledgeDocument::create([
            'title' => 'Plan', 'candidate_id' => 1, 'is_public' => true,
            'content' => 'Canal de riego Agua Blanca para productores agricolas.',
            'pages' => ['Canal de riego Agua Blanca para productores agricolas.'],
        ]);
        DocumentSection::create([
            'document_id' => $doc->id, 'candidate_id' => 1, 'orden' => 0, 'titulo' => null,
            'texto' => 'Canal de riego.', 'page_start' => 1, 'page_end' => 1, 'tokens' => 5, 'map_status' => 'listo',
        ]);

        Http::fake(['*batchEmbedContents*' => Http::response([], 500)]);

        $out = $this->service()->classify('¿qué propone sobre riego?', 1, null);

        $this->assertSame('rag', $out['type']); // no lanza excepción
    }

    public function test_another_candidates_documents_are_never_used(): void
    {
        $other = KnowledgeDocument::create(['title' => 'Plan ajeno', 'candidate_id' => 99, 'is_public' => true]);
        DocumentFaq::create([
            'document_id' => $other->id, 'candidate_id' => 99,
            'pregunta' => 'algo', 'respuesta' => 'respuesta ajena', 'paginas' => [1],
            'embedding' => CosineSimilarity::pack($this->vec(1, 0, 0, 0)),
        ]);

        $this->assertNull($this->service()->classify('cualquier cosa', 1, null));
    }
}
