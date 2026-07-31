<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\IntelAlert;
use App\Services\IntelligenceService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * Auditoría de calidad (Fase 10, skill database-optimizer): generateAlerts()
 * hacía un COUNT() por iteración del foreach de topics candidatos a "viral"
 * (N queries para N topics) — se reemplazó por una sola query agrupada antes
 * del loop. Estos tests cubren que la detección de tema viral sigue
 * funcionando igual tras el cambio, y que no se re-genera la misma alerta
 * en llamadas repetidas (semántica de firstOrCreate).
 */
class IntelligenceGenerateAlertsTest extends TestCase
{
    use DatabaseTransactions;

    private function chatSession(): ChatSession
    {
        return ChatSession::create(['session_id' => 'test-'.uniqid(), 'started_at' => now()]);
    }

    private function messageAt(ChatSession $session, string $topic, \DateTimeInterface $at): void
    {
        $m = new ChatMessage([
            'session_id' => $session->id,
            'role'       => 'user',
            'content'    => 'mensaje de prueba',
            'topic'      => $topic,
        ]);
        $m->timestamps = false;
        $m->created_at = $at;
        $m->updated_at = $at;
        $m->save();
    }

    public function test_detecta_tema_viral_cuando_supera_5x_el_promedio_semanal(): void
    {
        $session = $this->chatSession();

        // Baseline: 6 mensajes de "seguridad" en días 2-7 de la semana previa.
        for ($i = 2; $i <= 7; $i++) {
            $this->messageAt($session, 'seguridad', now()->subDays($i));
        }

        // Últimas 24h: 60 mensajes de "seguridad" (> umbral de 50 Y > 5x el
        // promedio semanal) -> debe disparar alerta viral_topic. El promedio
        // semanal ($weeklyCounts) usa la ventana completa de 7 días, que
        // incluye estos mismos mensajes recientes (igual que el código
        // original antes del fix de N+1 — no se cambió esa semántica, solo
        // cómo se calcula) -> weeklyAvg = (6 + 60) / 7 ≈ 9.43/día.
        for ($i = 0; $i < 60; $i++) {
            $this->messageAt($session, 'seguridad', now()->subMinutes($i));
        }

        // Un topic que NO debe calificar: solo 10 menciones en 24h (< umbral 50).
        for ($i = 0; $i < 10; $i++) {
            $this->messageAt($session, 'salud', now()->subMinutes($i));
        }

        app(IntelligenceService::class)->generateAlerts();

        $alert = IntelAlert::where('type', 'viral_topic')->first();

        $this->assertNotNull($alert, 'Debe crear una alerta de tema viral para "seguridad".');
        $this->assertSame('seguridad', $alert->payload['topic']);
        $this->assertSame(60, $alert->payload['count']);
        $this->assertSame(round(66 / 7, 2), round($alert->payload['avg'], 2));
        $this->assertNull(
            IntelAlert::where('type', 'viral_topic')->where('payload->topic', 'salud')->first(),
            'Un topic bajo el umbral no debe generar alerta.'
        );
    }

    public function test_no_duplica_la_alerta_en_llamadas_repetidas(): void
    {
        $session = $this->chatSession();

        for ($i = 2; $i <= 7; $i++) {
            $this->messageAt($session, 'educacion', now()->subDays($i));
        }
        for ($i = 0; $i < 55; $i++) {
            $this->messageAt($session, 'educacion', now()->subMinutes($i));
        }

        $service = app(IntelligenceService::class);
        $service->generateAlerts();
        $service->generateAlerts(); // segunda corrida — no debe duplicar

        $this->assertSame(
            1,
            IntelAlert::where('type', 'viral_topic')->where('payload->topic', 'educacion')->count()
        );
    }
}
