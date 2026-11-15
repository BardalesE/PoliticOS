<?php

namespace Tests\Feature;

use App\Models\CandidateProfile;
use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\Embeddings\CosineSimilarity;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Fase 3.3 — el comando de QA debe cubrir las 10 preguntas pedidas (3 vagas,
 * 4 FAQ, 3 específicas por región) contra un documento real y reportar tipo
 * + páginas citadas + si llamaría al LLM, sin gastar ningún token (no llama
 * a Groq ni a Gemini: clasifica con lo que ya está guardado).
 */
class KnowledgeQaCommandTest extends TestCase
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

        Schema::create('candidate_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->timestamps();
        });
        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->string('analysis_status', 20)->default('pendiente');
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

    public function test_reports_all_ten_cases_with_type_pages_and_llm_flag(): void
    {
        config(['ingest.embeddings.gemini.api_key' => 'test-key']);
        // Devuelve un vector distinto para la pregunta de región (San Miguel)
        // vs. el resto: así la FAQ (vector [1,0,0,0]) solo matchea sus propias
        // preguntas y la pregunta de región cae en 'rag' contra la sección
        // (vector [0,1,0,0]), igual que pasaría con embeddings reales.
        Http::fake(function ($request) {
            $text = $request->data()['requests'][0]['content']['parts'][0]['text'] ?? '';
            $vector = str_contains($text, 'San Miguel') ? [0, 1, 0, 0] : [1, 0, 0, 0];

            return Http::response(['embeddings' => [['values' => $vector]]], 200);
        });

        $candidateId = CandidateProfile::create(['name' => 'Ana Pérez'])->id;
        $doc = KnowledgeDocument::create([
            'title' => 'Plan de Gobierno', 'candidate_id' => $candidateId,
            'analysis_status' => 'listo', 'is_public' => true,
        ]);

        DocumentAnalysis::create([
            'document_id' => $doc->id,
            'resumen_ejecutivo' => 'El plan prioriza agua, salud y educación.',
            'indice_estructurado' => [['titulo' => 'Agua y saneamiento', 'orden' => 1]],
            'propuestas_por_region' => [[
                'nombre' => 'San Miguel', 'nivel' => 'distrito',
                'propuestas' => [['texto' => 'Construir el mercado de San Miguel', 'paginas' => [33]]],
            ]],
            'version' => 1,
        ]);

        foreach (range(1, 4) as $i) {
            DocumentFaq::create([
                'document_id' => $doc->id, 'candidate_id' => $candidateId,
                'pregunta' => "¿Pregunta frecuente número {$i}?", 'respuesta' => "Respuesta número {$i}.",
                'paginas' => [10 + $i],
                'embedding' => CosineSimilarity::pack([1, 0, 0, 0]),
            ]);
        }

        DocumentSection::create([
            'document_id' => $doc->id, 'candidate_id' => $candidateId, 'orden' => 0, 'titulo' => null,
            'texto' => 'Texto de un chunk cualquiera del plan.', 'page_start' => 5, 'page_end' => 5,
            'tokens' => 10, 'map_status' => 'listo',
            'embedding' => CosineSimilarity::pack([0, 1, 0, 0]),
        ]);

        $this->artisan('knowledge:qa', ['document' => $doc->id])
            ->assertExitCode(0)
            ->expectsOutputToContain('[vaga] "Resume el plan"')
            ->expectsOutputToContain('tipo: menu')
            ->expectsOutputToContain('[faq] "¿Pregunta frecuente número 1?"')
            ->expectsOutputToContain('tipo: faq')
            ->expectsOutputToContain('[específica] "¿Qué propone para San Miguel?"')
            ->expectsOutputToContain('páginas citadas: 33');
    }

    public function test_refuses_a_document_without_deep_analysis_ready(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Sin analizar', 'is_public' => false]);

        $this->artisan('knowledge:qa', ['document' => $doc->id])->assertExitCode(1);
    }

    public function test_refuses_a_missing_document(): void
    {
        $this->artisan('knowledge:qa', ['document' => 9999])->assertExitCode(1);
    }
}
