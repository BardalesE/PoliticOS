<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Calificaciones de la plataforma: resumen en vivo, moderación de comentarios
 * (nada sale a la home sin aprobación del superadmin) y panel de superadmin.
 */
class CalificacionesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'database.connections.central' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
            'superadmin.key' => 'clave-super',
        ]);
        DB::purge('central');
        (require database_path('migrations/2026_09_26_000001_create_platform_feedback_table.php'))->up();
        (require database_path('migrations/2026_10_04_000001_add_publicado_to_platform_feedback.php'))->up();
        Cache::flush();
    }

    private function sa(): array
    {
        return ['X-Super-Admin-Key' => 'clave-super'];
    }

    private function calificar(int $stars, ?string $comment = null): void
    {
        $this->postJson('/api/feedback', ['stars' => $stars, 'comment' => $comment, 'candidate_slug' => 'rigo'])->assertCreated();
    }

    public function test_summary_trae_promedio_distribucion_y_ultimos_7_dias(): void
    {
        $this->calificar(5, 'Muy útil');
        $this->calificar(5);
        $this->calificar(2, 'No cargó');

        $this->getJson('/api/feedback/summary')->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('average', 4)
            ->assertJsonPath('distribucion.5', 2)
            ->assertJsonPath('distribucion.2', 1)
            ->assertJsonPath('distribucion.1', 0)
            ->assertJsonPath('ultimos_7_dias', 3)
            ->assertJsonPath('con_comentario', 2);
    }

    public function test_los_comentarios_no_salen_al_publico_sin_aprobacion(): void
    {
        $this->calificar(5, 'Excelente plataforma');
        $this->getJson('/api/feedback/publicos')->assertOk()->assertJsonCount(0, 'data');

        $id = DB::connection('central')->table('platform_feedback')->value('id');
        $this->withHeaders($this->sa())->putJson("/api/superadmin/feedback/{$id}", ['publicado' => true])->assertOk();

        $this->getJson('/api/feedback/publicos')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.comment', 'Excelente plataforma')
            ->assertJsonMissingPath('data.0.candidate_slug');   // sin datos de contexto en lo público
    }

    public function test_no_se_publica_una_calificacion_sin_comentario(): void
    {
        $this->calificar(4);
        $id = DB::connection('central')->table('platform_feedback')->value('id');

        $this->withHeaders($this->sa())->putJson("/api/superadmin/feedback/{$id}", ['publicado' => true])->assertStatus(422);
    }

    public function test_panel_superadmin_filtra_y_borra_y_exige_clave(): void
    {
        $this->calificar(1, 'Insulto');
        $this->calificar(5, 'Bien');

        $this->getJson('/api/superadmin/feedback')->assertStatus(403);

        $res = $this->withHeaders($this->sa())->getJson('/api/superadmin/feedback?stars=1')->assertOk();
        $this->assertSame(1, $res->json('total'));
        $this->assertSame('Insulto', $res->json('data.0.comment'));
        $this->assertSame(['rigo'], $res->json('candidatos'));
        $this->assertSame(2, $res->json('resumen.total'));

        $id = $res->json('data.0.id');
        $this->withHeaders($this->sa())->deleteJson("/api/superadmin/feedback/{$id}")->assertOk();
        $this->getJson('/api/feedback/summary')->assertJsonPath('total', 1);
    }
}
