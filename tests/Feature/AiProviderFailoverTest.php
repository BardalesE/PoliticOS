<?php

namespace Tests\Feature;

use App\Models\AiSetting;
use App\Models\CandidateProfile;
use App\Models\ChatSession;
use App\Services\CivicAIService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Fase 1 (chatbot ultra preciso y sin cortes): cadena de fallback de
 * providers de IA. Antes cualquier status != 2xx se trataba igual (un solo
 * intento, sin leer Retry-After) — ver CivicAIService::callAI/AiProviderException.
 * Cubre: 429 reintenta una vez respetando Retry-After antes de saltar al
 * siguiente provider; 401 salta inmediato sin reintentar (no cambia con el
 * tiempo); si todos fallan, la respuesta de descanso queda marcada
 * is_fallback (no vuelve a entrar como contexto del historial).
 */
class AiProviderFailoverTest extends TestCase
{
    use DatabaseTransactions;

    private function makeSession(): ChatSession
    {
        CandidateProfile::create([
            'name'      => 'Candidato de Prueba',
            'title'     => 'Alcalde',
            'location'  => 'Distrito de Prueba',
            'party'     => 'Partido de Prueba',
            'is_active' => true,
        ]);

        AiSetting::current()->update([
            'provider'           => 'groq',
            'fallback_provider'  => 'claude',
            'system_prompt'      => 'Eres un asistente de prueba.',
            'mode'               => 'campaign',
        ]);

        return ChatSession::create([
            'session_id' => 'test-'.uniqid(),
            'started_at' => now(),
        ]);
    }

    public function test_429_reintenta_una_vez_respetando_retry_after_y_luego_responde(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::sequence()
                ->push(['error' => ['message' => 'rate limited']], 429, ['Retry-After' => '0'])
                ->push(['choices' => [['message' => ['content' => 'Respuesta tras reintento']]]], 200),
        ]);

        $session = $this->makeSession();
        $result  = app(CivicAIService::class)->respond('Hola, cuéntame algo', $session);

        $this->assertSame('Respuesta tras reintento', $result['reply']);
        Http::assertSentCount(2); // 1er intento (429) + reintento (200), nunca llega a claude/openai
    }

    public function test_401_no_reintenta_y_salta_de_inmediato_al_siguiente_provider(): void
    {
        Http::fake([
            'api.groq.com/*'      => Http::response(['error' => ['message' => 'invalid api key']], 401),
            'api.anthropic.com/*' => Http::response(['content' => [['text' => 'Respuesta de Claude']]], 200),
        ]);

        $session = $this->makeSession();
        $result  = app(CivicAIService::class)->respond('Hola, cuéntame algo', $session);

        $this->assertSame('Respuesta de Claude', $result['reply']);
        // 1 intento a groq (sin reintento, porque 401 es permanente) + 1 a claude = 2
        Http::assertSentCount(2);
    }

    public function test_todos_los_providers_fallan_devuelve_respuesta_de_descanso_marcada(): void
    {
        Http::fake([
            'api.groq.com/*'      => Http::response(['error' => 'x'], 500),
            'api.anthropic.com/*' => Http::response(['error' => 'x'], 500),
            'api.openai.com/*'    => Http::response(['error' => 'x'], 500),
        ]);

        $session = $this->makeSession();
        $result  = app(CivicAIService::class)->respond('Hola, cuéntame algo', $session);

        $this->assertTrue($result['ai_resting'] ?? false);
        $this->assertStringContainsString('cerebrito digital', $result['reply']);
    }
}
