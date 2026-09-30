<?php

namespace Tests\Unit;

use App\Services\CivicAIService;
use PHPUnit\Framework\TestCase;

/** Prompt caching: solo las instrucciones fijas se cachean; el contexto del RAG va aparte. */
class ClaudePromptCacheTest extends TestCase
{
    private function split(string $prompt): array
    {
        $m = new \ReflectionMethod(CivicAIService::class, 'claudeSystem');
        $m->setAccessible(true);
        $ai = (new \ReflectionClass(CivicAIService::class))->newInstanceWithoutConstructor();

        return $m->invoke($ai, $prompt);
    }

    public function test_fixed_instructions_are_cached_and_rag_context_is_not(): void
    {
        $b = $this->split("REGLAS FIJAS\n\n--- CONTEXTO DISPONIBLE PARA ESTA RESPUESTA ---\n[S1] plan\n--- FIN CONTEXTO ---");

        $this->assertCount(2, $b);
        $this->assertSame('REGLAS FIJAS', $b[0]['text']);
        $this->assertSame(['type' => 'ephemeral'], $b[0]['cache_control']);
        $this->assertStringContainsString('[S1] plan', $b[1]['text']);
        $this->assertArrayNotHasKey('cache_control', $b[1]);
    }

    public function test_prompt_without_context_is_a_single_cached_block(): void
    {
        $b = $this->split('SOLO REGLAS');

        $this->assertCount(1, $b);
        $this->assertSame('SOLO REGLAS', $b[0]['text']);
    }
}
