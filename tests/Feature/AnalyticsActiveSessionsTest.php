<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * Fase 3 (analytics preciso): total_conversations/sessions.total contaban
 * solo por fecha de CREACIÓN de la sesión — pero las sesiones se reutilizan
 * (session_id persistido en el cliente, ver ChatController::resolveSession),
 * así que un visitante recurrente con actividad real este mes no se contaba
 * si su sesión se creó antes del periodo. Ver informe de QA.
 */
class AnalyticsActiveSessionsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_total_conversations_cuenta_sesiones_reutilizadas_como_activas(): void
    {
        // Sesión creada hace 2 meses (fuera del periodo "month", ~30 días)
        // pero con un mensaje nuevo HOY.
        $session = new ChatSession(['session_id' => 'reused-'.uniqid(), 'started_at' => now()->subMonths(2)]);
        $session->timestamps = false;
        $session->created_at = now()->subMonths(2);
        $session->updated_at = now()->subMonths(2);
        $session->save();

        ChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'user',
            'content'    => 'hola de nuevo',
        ]);

        $res = $this->getJson('/api/analytics/summary?period=month');
        $res->assertOk();

        $this->assertGreaterThanOrEqual(1, $res->json('total_conversations'));
    }
}
