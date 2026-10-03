<?php

namespace Tests\Unit;

use App\Models\AiSetting;
use App\Services\CivicAIService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Respaldo gratuito de IA (2026-10-03, caídas de Groq): Cerebras → Gemini →
 * OpenRouter → Mistral al final de la cadena, solo con key, y enfriamiento del
 * proveedor caído para que el vecino no espere su falla en cada mensaje.
 */
class IaRespaldoGratuitoTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $sqlite = ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''];
        config([
            'database.default' => 'sqlite', 'database.connections.sqlite' => $sqlite,
            'cache.default' => 'array',
            'services.ai.groq_key' => 'gk', 'services.ai.claude_key' => null, 'services.ai.openai_key' => null,
            'services.ai.respaldo_orden' => 'cerebras,gemini,openrouter,mistral',
            'services.ai.respaldo.cerebras.key' => 'ck',
            'services.ai.respaldo.gemini.key' => 'gm',
            'services.ai.respaldo.openrouter.key' => null,
            'services.ai.respaldo.mistral.key' => 'mk',
        ]);
        DB::purge('sqlite');
        Cache::flush();
    }

    protected function tearDown(): void
    {
        // AiUsage memoriza "¿hay tabla ai_usage?" por conexión; esta BD en memoria no la
        // tiene y no debe contaminar a los tests que vienen después (DirectorioTest).
        (new \ReflectionProperty(\App\Services\AiUsage::class, 'tablaPorConexion'))->setValue(null, []);
        parent::tearDown();
    }

    private function svc(): CivicAIService
    {
        $svc = app(CivicAIService::class);
        $cfg = new AiSetting(['provider' => 'groq', 'fallback_provider' => null, 'mode' => 'campaign', 'temperature' => 0.2, 'max_tokens' => 1200]);
        (new \ReflectionProperty($svc, 'config'))->setValue($svc, $cfg);

        return $svc;
    }

    private function invocar(CivicAIService $svc, string $method, ...$args)
    {
        $m = new \ReflectionMethod($svc, $method);

        return $m->invoke($svc, ...$args);
    }

    public function test_cadena_agrega_respaldos_con_key_en_orden(): void
    {
        // groq primero; claude/openai sin key se descartan; openrouter sin key no entra.
        $this->assertSame(['groq', 'cerebras', 'gemini', 'mistral'], $this->invocar($this->svc(), 'usableProviders'));
    }

    public function test_proveedor_enfriado_pasa_al_final(): void
    {
        Cache::put('ai:enfriando:groq', true, 60);
        $this->assertSame(['cerebras', 'gemini', 'mistral', 'groq'], $this->invocar($this->svc(), 'usableProviders'));
    }

    public function test_groq_caido_responde_cerebras_y_groq_queda_enfriado(): void
    {
        Http::fake([
            'api.groq.com/*'     => Http::response(['error' => 'down'], 503),
            'api.cerebras.ai/*'  => Http::response(['choices' => [['message' => ['content' => 'Respuesta de Cerebras']]]], 200),
        ]);
        $svc = $this->svc();
        $c = new \App\Models\CandidateProfile(['name' => 'X']);
        (new \ReflectionProperty($svc, 'candidate'))->setValue($svc, $c);
        (new \ReflectionProperty($svc, 'scopeCandidate'))->setValue($svc, $c);
        (new \ReflectionProperty($svc, 'systemPromptTemplate'))->setValue($svc, 'Prompt de prueba.');

        $reply = $this->invocar($svc, 'callAI', 'hola', '', [], ['segment' => 'x', 'concerns' => [], 'district' => null], null,
            new \App\Models\ChatSession(['session_id' => 's']), null);

        $this->assertSame('Respuesta de Cerebras', $reply);
        $this->assertTrue((bool) Cache::get('ai:enfriando:groq'));
        Http::assertSent(fn ($r) => str_contains($r->url(), 'api.cerebras.ai') && $r['model'] === 'gpt-oss-120b'
            && $r->hasHeader('Authorization', 'Bearer ck'));
    }

    public function test_401_no_enfria(): void
    {
        Http::fake([
            'api.groq.com/*'    => Http::response(['error' => 'bad key'], 401),
            'api.cerebras.ai/*' => Http::response(['choices' => [['message' => ['content' => 'ok']]]], 200),
        ]);
        $svc = $this->svc();
        $c = new \App\Models\CandidateProfile(['name' => 'X']);
        (new \ReflectionProperty($svc, 'candidate'))->setValue($svc, $c);
        (new \ReflectionProperty($svc, 'scopeCandidate'))->setValue($svc, $c);
        (new \ReflectionProperty($svc, 'systemPromptTemplate'))->setValue($svc, 'Prompt de prueba.');
        $this->invocar($svc, 'callAI', 'hola', '', [], ['segment' => 'x', 'concerns' => [], 'district' => null], null,
            new \App\Models\ChatSession(['session_id' => 's']), null);

        $this->assertNull(Cache::get('ai:enfriando:groq'));
    }
}
