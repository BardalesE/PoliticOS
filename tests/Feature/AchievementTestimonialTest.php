<?php

namespace Tests\Feature;

use App\Models\Achievement;
use App\Models\Testimonial;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * Rediseño narrativo del sitio público (Fase A — capa de datos): Achievement
 * ("Obras destacadas") y Testimonial (testimonios ciudadanos) son modelos
 * nuevos, sin nada previo que reusar (confirmado por auditoría: 0
 * resultados de "testimon" en todo el repo antes de esta fase).
 */
class AchievementTestimonialTest extends TestCase
{
    use DatabaseTransactions;

    private function adminUser(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    // ─── Achievement ────────────────────────────────────────────────

    public function test_index_publico_solo_devuelve_activos_ordenados(): void
    {
        Achievement::create(['title' => 'Oculto', 'is_active' => false, 'sort_order' => 0]);
        Achievement::create(['title' => 'Segundo', 'is_active' => true, 'sort_order' => 2]);
        Achievement::create(['title' => 'Primero', 'is_active' => true, 'sort_order' => 1]);

        $res = $this->getJson('/api/achievements');
        $res->assertOk();
        $titles = collect($res->json())->pluck('title')->all();

        $this->assertSame(['Primero', 'Segundo'], $titles);
    }

    public function test_admin_puede_crear_actualizar_y_eliminar_una_obra(): void
    {
        $user = $this->adminUser();

        $create = $this->actingAs($user, 'sanctum')->postJson('/api/admin/achievements', [
            'title' => 'Renovación del Parque Central',
            'metric_value' => '3',
            'metric_label' => 'parques recuperados',
        ]);
        $create->assertCreated();
        $id = $create->json('id');

        $update = $this->actingAs($user, 'sanctum')->putJson("/api/admin/achievements/{$id}", [
            'title' => 'Renovación del Parque Central (fase 2)',
        ]);
        $update->assertOk()->assertJsonPath('title', 'Renovación del Parque Central (fase 2)');

        $delete = $this->actingAs($user, 'sanctum')->deleteJson("/api/admin/achievements/{$id}");
        $delete->assertOk();
        $this->assertDatabaseMissing('achievements', ['id' => $id]);
    }

    public function test_crear_obra_sin_titulo_falla_validacion(): void
    {
        $res = $this->actingAs($this->adminUser(), 'sanctum')->postJson('/api/admin/achievements', []);
        $res->assertStatus(422)->assertJsonValidationErrors(['title']);
    }

    // ─── Testimonial ────────────────────────────────────────────────

    public function test_index_publico_de_testimonios_solo_activos(): void
    {
        Testimonial::create(['name' => 'Oculta', 'quote' => 'x', 'is_active' => false]);
        Testimonial::create(['name' => 'Visible', 'quote' => 'Excelente candidata', 'is_active' => true]);

        $res = $this->getJson('/api/testimonials');
        $res->assertOk();
        $names = collect($res->json())->pluck('name')->all();

        $this->assertSame(['Visible'], $names);
    }

    public function test_admin_puede_crear_y_eliminar_un_testimonio(): void
    {
        $user = $this->adminUser();

        $create = $this->actingAs($user, 'sanctum')->postJson('/api/admin/testimonials', [
            'name' => 'Rosa Fernández',
            'quote' => 'Marina escuchó mi problema.',
        ]);
        $create->assertCreated();
        $id = $create->json('id');

        $delete = $this->actingAs($user, 'sanctum')->deleteJson("/api/admin/testimonials/{$id}");
        $delete->assertOk();
        $this->assertDatabaseMissing('testimonials', ['id' => $id]);
    }

    public function test_crear_testimonio_sin_quote_falla_validacion(): void
    {
        $res = $this->actingAs($this->adminUser(), 'sanctum')->postJson('/api/admin/testimonials', [
            'name' => 'Alguien',
        ]);
        $res->assertStatus(422)->assertJsonValidationErrors(['quote']);
    }
}
