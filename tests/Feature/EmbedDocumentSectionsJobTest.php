<?php

namespace Tests\Feature;

use App\Jobs\EmbedDocumentSectionsJob;
use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\Embeddings\CosineSimilarity;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class EmbedDocumentSectionsJobTest extends TestCase
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
            'ingest.embeddings.gemini.api_key' => 'test-gemini-key',
            'ingest.embeddings.gemini.dimensions' => 4,
            'ingest.embeddings.gemini.batch_size' => 50,
        ]);
        DB::purge('sqlite');

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->string('status', 20)->default('ready');
            $t->string('analysis_status', 20)->default('procesando');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
            $t->string('analysis_batch_id')->nullable();
            $t->timestamp('analyzed_at')->nullable();
            $t->boolean('is_public')->default(false);
            $t->timestamps();
        });

        foreach ([
            '2026_11_14_000002_create_document_sections_table',
            '2026_11_14_000004_create_document_faqs_table',
        ] as $migration) {
            (require database_path("migrations/{$migration}.php"))->up();
        }
    }

    public function test_embeds_sections_and_faqs_then_publishes_the_document(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan']);
        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => null, 'texto' => 'riego',
            'page_start' => 1, 'page_end' => 1, 'tokens' => 5, 'map_status' => 'listo',
        ]);
        DocumentFaq::create([
            'document_id' => $doc->id, 'pregunta' => '¿Hay riego?', 'respuesta' => 'Sí.', 'paginas' => [1],
        ]);

        Http::fake(['*batchEmbedContents*' => Http::response(['embeddings' => [['values' => [1, 2, 3, 4]]]], 200)]);

        (new EmbedDocumentSectionsJob($doc->id))->handle();

        $section = DocumentSection::first();
        $faq     = DocumentFaq::first();
        $this->assertNotNull($section->embedding);
        $this->assertNotNull($faq->embedding);
        $this->assertSame([1.0, 2.0, 3.0, 4.0], CosineSimilarity::unpack($section->embedding));

        $doc->refresh();
        $this->assertTrue((bool) $doc->is_public);
        $this->assertSame('listo', $doc->analysis_status);
        $this->assertSame(100, $doc->analysis_progress);
    }

    public function test_sections_already_embedded_are_not_sent_again(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan']);
        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => null, 'texto' => 'ya embebido',
            'page_start' => 1, 'page_end' => 1, 'tokens' => 5, 'map_status' => 'listo',
            'embedding' => CosineSimilarity::pack([1, 1, 1, 1]),
        ]);

        Http::fake(['*batchEmbedContents*' => Http::response(['embeddings' => []], 200)]);

        (new EmbedDocumentSectionsJob($doc->id))->handle();

        Http::assertNothingSent();
        $this->assertTrue((bool) $doc->refresh()->is_public);
    }

    public function test_a_failed_embedding_call_marks_the_document_as_error_and_keeps_it_private(): void
    {
        $doc = KnowledgeDocument::create(['title' => 'Plan']);
        DocumentSection::create([
            'document_id' => $doc->id, 'orden' => 0, 'titulo' => null, 'texto' => 'x',
            'page_start' => 1, 'page_end' => 1, 'tokens' => 5, 'map_status' => 'listo',
        ]);
        Http::fake(['*batchEmbedContents*' => Http::response([], 500)]);

        try {
            (new EmbedDocumentSectionsJob($doc->id))->handle();
        } catch (\Throwable) {
            // esperado: el job relanza para que la cola lo reintente.
        }

        $doc->refresh();
        $this->assertSame('error', $doc->analysis_status);
        $this->assertFalse((bool) $doc->is_public);
    }
}
