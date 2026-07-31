<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Services\IntelligenceService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * Fase 3 (analytics preciso): attackFeed()['total_week'] contaba con
 * ->count() de PHP sobre colecciones ya truncadas por ->limit($limit) para
 * el feed — con más ataques que $limit en la semana, el total mostraba un
 * techo silencioso de 2×$limit en vez del conteo real. Ver informe de QA.
 */
class IntelligenceAttackFeedTest extends TestCase
{
    use DatabaseTransactions;

    public function test_total_week_cuenta_todos_los_ataques_no_solo_los_del_feed_limitado(): void
    {
        $session = ChatSession::create(['session_id' => 'test-'.uniqid(), 'started_at' => now()]);

        // Más ataques que el límite pedido para el feed (10), para confirmar
        // que total_week los cuenta TODOS vía SQL COUNT(*).
        for ($i = 0; $i < 15; $i++) {
            ChatMessage::create([
                'session_id'      => $session->id,
                'role'            => 'user',
                'content'         => "ataque de prueba {$i}",
                'attack_detected' => true,
                'attack_category' => 'personal',
            ]);
        }

        $result = app(IntelligenceService::class)->attackFeed(limit: 10);

        $this->assertSame(15, $result['total_week']);
        $this->assertCount(10, $result['feed']); // el feed sí respeta el límite
    }
}
