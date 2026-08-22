<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * feat/cuotas-ia — límite duro de longitud de pregunta (500 chars, antes
 * 2000). Prueba vía HTTP real a /api/chat: $request->validate() falla ANTES
 * de que ChatController llame a CivicAIService::respond(), así que esto
 * nunca dispara una llamada real a Groq/Claude/OpenAI — a diferencia de
 * probar el camino exitoso completo (ver tests/Feature/AiProviderFailoverTest.php,
 * que sí necesita Http::fake() porque sí llega a llamar al LLM).
 *
 * Sin X-Tenant header: resuelve la BD por defecto (single-tenant local, ver
 * RAG_VACIO.md/DIAGNOSTICO_CHAT.md) — no hay tenant real, así que esto no
 * pasa por EnsureTenantQuota/ThrottleChatBySession con un tenant de verdad;
 * esos se prueban aparte y directo (TenantQuotaTest, ThrottleChatBySessionTest).
 */
class ChatHardLimitsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_rechaza_mensaje_de_mas_de_500_caracteres(): void
    {
        $response = $this->postJson('/api/chat', [
            'message' => str_repeat('a', 501),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('message');
    }

    public function test_acepta_mensaje_de_exactamente_500_caracteres_en_validacion(): void
    {
        // No aserta 200 (llegaría a llamar al LLM real) — solo confirma que
        // la validación de longitud no es la que bloquea en el límite exacto.
        $response = $this->postJson('/api/chat', [
            'message' => str_repeat('a', 500),
        ]);

        $response->assertJsonMissingValidationErrors('message');
    }

    public function test_rechaza_mensaje_vacio(): void
    {
        $response = $this->postJson('/api/chat', ['message' => '']);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('message');
    }
}
