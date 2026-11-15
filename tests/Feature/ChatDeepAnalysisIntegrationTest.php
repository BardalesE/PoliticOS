<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Services\Embeddings\CosineSimilarity;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Extremo a extremo (POST /api/chat) de la Fase 2: un tenant de un solo
 * candidato (sin candidate_slug — el caso real que motivó la Fase 1/2, un
 * plan de 200+ páginas en el chat del propio candidato) responde con el
 * menú SIN llamar a ningún proveedor de IA, y queda registrado en
 * chat_messages.response_type para la analítica del panel.
 */
class ChatDeepAnalysisIntegrationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // AnalyzeMessageJob (sentiment/emotion/...) es un subsistema aparte,
        // sin relación con la Fase 2 — se fakea para no tener que replicar su
        // esquema completo de chat_sessions/chat_messages aquí.
        Queue::fake();

        $sqlite = ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false];
        config([
            'app.tenant_slug' => null,
            'database.default' => 'sqlite',
            'database.connections.sqlite' => $sqlite,
            'database.connections.central' => $sqlite,
            'ingest.embeddings.driver' => 'gemini',
            'ingest.embeddings.gemini.api_key' => 'test-key',
            'ingest.embeddings.gemini.dimensions' => 4,
            'ingest.query.faq_similarity_threshold' => 0.85,
        ]);
        DB::purge('sqlite');
        DB::purge('central');

        Schema::create('ai_settings', function (Blueprint $t) {
            $t->id();
            $t->string('provider')->default('groq');
            $t->text('api_key')->nullable();
            $t->string('model')->default('openai/gpt-oss-120b');
            $t->integer('max_tokens')->default(1200);
            $t->float('temperature')->default(0.4);
            $t->string('fallback_provider')->nullable();
            $t->longText('system_prompt')->nullable();
            $t->boolean('system_prompt_customizado')->default(false);
            $t->string('mode')->default('campaign');
            $t->string('chat_subtitle')->nullable();
            $t->string('chat_btn_text')->nullable();
            $t->string('chat_btn_image_url')->nullable();
            $t->string('chat_btn_shape')->nullable();
            $t->string('chat_btn_color')->nullable();
            $t->string('chat_btn_size')->nullable();
            $t->string('chat_btn_position')->nullable();
            $t->integer('attack_spike_threshold')->default(10);
            $t->unsignedSmallInteger('max_messages_per_session')->default(20);
            $t->unsignedSmallInteger('registration_bonus_messages')->default(50);
            $t->timestamps();
        });
        Schema::create('chat_sessions', function (Blueprint $t) {
            $t->id();
            $t->string('session_id')->unique();
            $t->string('ip')->nullable();
            $t->string('user_agent')->nullable();
            $t->timestamp('started_at')->nullable();
            $t->string('visitor_uuid')->nullable();
            $t->string('referrer')->nullable();
            $t->string('utm_source')->nullable();
            $t->string('utm_medium')->nullable();
            $t->string('utm_campaign')->nullable();
            $t->boolean('consent_data_capture')->default(false);
            $t->timestamp('consent_at')->nullable();
            $t->string('device_type')->nullable();
            $t->string('geo_country')->nullable();
            $t->timestamp('blocked_at')->nullable();
            $t->integer('nonsense_count')->default(0);
            $t->timestamps();
        });
        Schema::create('chat_messages', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('session_id');
            $t->string('role');
            $t->text('content')->nullable();
            $t->string('topic')->nullable();
            $t->text('media')->nullable();
            $t->boolean('attack_detected')->default(false);
            $t->string('attack_category')->nullable();
            $t->json('pepa_metadata')->nullable();
            $t->boolean('is_fallback')->default(false);
            $t->json('citations')->nullable();
            $t->string('response_type', 10)->nullable();
            $t->float('sentiment')->nullable();
            $t->string('emotion')->nullable();
            $t->string('intent')->nullable();
            $t->json('concerns')->nullable();
            $t->string('district_mentioned')->nullable();
            $t->json('proposals_detected')->nullable();
            $t->json('problems_mentioned')->nullable();
            $t->json('analysis_raw')->nullable();
            $t->unsignedBigInteger('candidate_profile_id')->nullable();
            $t->timestamps();
        });
        Schema::create('topics', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->json('keywords')->nullable();
            $t->boolean('is_active')->default(true);
            $t->integer('sort_order')->default(0);
            $t->timestamps();
        });
        Schema::create('districts', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->json('keywords')->nullable();
            $t->boolean('is_active')->default(true);
            $t->integer('sort_order')->default(0);
            $t->timestamps();
        });
        Schema::create('attack_responses', function (Blueprint $t) {
            $t->id();
            $t->string('category');
            $t->json('keywords')->nullable();
            $t->text('template')->nullable();
            $t->string('deflection_topic')->nullable();
            $t->integer('times_used')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        Schema::create('candidate_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        $candidateId = DB::table('candidate_profiles')->insertGetId(['name' => 'Ana Pérez', 'is_active' => true]);
        Schema::create('citizen_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('visitor_uuid')->nullable();
            $t->string('name')->nullable();
            $t->timestamps();
        });
        Schema::create('visitor_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('visitor_uuid')->unique();
            $t->integer('visits_count')->default(0);
            $t->timestamp('first_seen_at')->nullable();
            $t->timestamp('last_seen_at')->nullable();
            $t->timestamps();
        });
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

        $docId = DB::table('knowledge_documents')->insertGetId([
            'title' => 'Plan de Gobierno', 'candidate_id' => $candidateId, 'is_public' => true,
            'is_active' => true, 'status' => 'ready', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DocumentAnalysis::create([
            'document_id' => $docId,
            'resumen_ejecutivo' => 'El plan prioriza agua potable, salud y educación para todo el distrito.',
            'indice_estructurado' => [['titulo' => 'Agua y saneamiento', 'orden' => 1], ['titulo' => 'Salud', 'orden' => 2]],
            'version' => 1,
        ]);
        DocumentFaq::create([
            'document_id' => $docId, 'candidate_id' => $candidateId,
            'pregunta' => '¿Hay canal de riego?', 'respuesta' => 'Sí, el plan propone el canal de riego Agua Blanca.',
            'paginas' => [42], 'embedding' => CosineSimilarity::pack([1, 0, 0, 0]),
        ]);
    }

    private function enviar(string $msg, string $sid = 's-deep'): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/chat', ['message' => $msg, 'session_id' => $sid, 'initialized' => true]);
    }

    public function test_a_vague_question_returns_the_menu_without_calling_any_ai_provider(): void
    {
        Http::fake();
        ChatSession::create(['session_id' => 's-deep', 'ip' => '10.0.0.1', 'started_at' => now()]);

        $res = $this->enviar('Resume el plan')->assertOk();

        Http::assertNothingSent();
        $this->assertStringContainsString('inteligencia artificial', $res->json('reply'));
        $this->assertStringContainsString('agua potable, salud y educación', $res->json('reply'));

        $assistantMsg = ChatMessage::where('role', 'assistant')->latest('id')->first();
        $this->assertSame('menu', $assistantMsg->response_type);
    }

    public function test_a_question_matching_a_faq_returns_the_cached_answer_without_calling_any_ai_provider(): void
    {
        Http::fake(['*batchEmbedContents*' => Http::response(['embeddings' => [['values' => [1, 0, 0, 0]]]], 200)]);
        ChatSession::create(['session_id' => 's-deep', 'ip' => '10.0.0.1', 'started_at' => now()]);

        $res = $this->enviar('¿Hay canal de riego o no?')->assertOk();

        $this->assertSame('Sí, el plan propone el canal de riego Agua Blanca.', $res->json('reply'));

        $assistantMsg = ChatMessage::where('role', 'assistant')->latest('id')->first();
        $this->assertSame('faq', $assistantMsg->response_type);

        Http::assertSentCount(1); // solo el embed de Gemini — ningún proveedor de chat (Groq/Claude/OpenAI)
    }
}
