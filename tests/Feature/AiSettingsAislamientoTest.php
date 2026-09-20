<?php

namespace Tests\Feature;

use App\Models\AiSetting;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Configuración de IA por candidato:
 *  - el admin de un candidato (tenant) solo puede tocar el botón del chat;
 *    el prompt/modelo/keys los edita el superadmin con el tenant explícito;
 *  - un tenant no puede registrarse sobre la BD central ni sobre la de otro.
 *
 * SQLite en memoria: `central` (tabla tenants) y la conexión por defecto
 * (ai_settings) son BDs distintas, igual que en producción.
 */
class AiSettingsAislamientoTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $sqlite = ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true];
        config([
            'app.tenant_slug'                => null,
            'database.default'               => 'sqlite',
            'database.connections.sqlite'    => $sqlite,
            'database.connections.central'   => $sqlite,
            'superadmin.key'                 => 'clave-super',
        ]);
        DB::purge('sqlite');
        DB::purge('central');

        // La regla `unique:tenants,slug` de las validaciones usa la conexión por
        // defecto (en producción es la misma BD que `central`); en el test son dos
        // SQLite en memoria, así que la tabla va en ambas.
        Schema::create('tenants', function (Blueprint $t) {
            $t->id();
            $t->string('slug')->unique();
        });
        Schema::connection('central')->create('tenants', function (Blueprint $t) {
            $t->id();
            $t->string('slug')->unique();
            $t->string('name');
            $t->string('db_name');
            $t->string('db_host')->nullable();
            $t->integer('db_port')->nullable();
            $t->string('db_user')->nullable();
            $t->string('db_password')->nullable();
            $t->string('plan')->default('starter');
            $t->boolean('is_active')->default(true);
            $t->json('custom_features')->nullable();
            $t->string('admin_email')->nullable();
            $t->text('admin_password_hint')->nullable();
            $t->timestamp('password_changed_at')->nullable();
            $t->text('credential_log')->nullable();
            $t->timestamps();
        });

        Schema::create('ai_settings', function (Blueprint $t) {
            $t->id();
            $t->string('provider')->default('groq');
            $t->text('api_key')->nullable();
            $t->string('model')->default('llama-3.3-70b-versatile');
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
            $t->timestamps();
        });
    }

    private function tenant(array $over = []): Tenant
    {
        return Tenant::create($over + [
            'slug' => 'rigo', 'name' => 'Rigoberto', 'db_name' => 'bdpolitic_rigo',
            'db_host' => 'db.example', 'db_port' => 3306, 'is_active' => true,
        ]);
    }

    private function actAsAdmin(): void
    {
        $user = new User();
        $user->role = 'admin';
        Sanctum::actingAs($user);
    }

    private function sa(): array
    {
        return ['X-Super-Admin-Key' => 'clave-super'];
    }

    // ── Admin de candidato: solo el botón del chat ───────────────────

    public function test_tenant_admin_cannot_change_prompt_model_or_keys(): void
    {
        $this->tenant();
        AiSetting::current()->update(['system_prompt' => 'PROMPT ORIGINAL', 'model' => 'llama-3.3-70b-versatile']);
        $this->actAsAdmin();

        $this->withHeaders(['X-Tenant' => 'rigo'])->putJson('/api/admin/ai-settings', [
            'system_prompt' => 'PROMPT HACKEADO',
            'model'         => 'gpt-4o',
            'provider'      => 'openai',
            'api_key'       => 'sk-robada',
            'mode'          => 'pepa',
            'chat_subtitle' => 'Habla con Rigo',
            'chat_btn_color' => '#FF0000',
        ])->assertOk()->assertJsonPath('restricted', true);

        $s = AiSetting::first();
        $this->assertSame('PROMPT ORIGINAL', $s->system_prompt);
        $this->assertSame('llama-3.3-70b-versatile', $s->model);
        $this->assertSame('groq', $s->provider);
        $this->assertNull($s->api_key);
        $this->assertSame('campaign', $s->mode);
        // …pero lo de apariencia sí se guarda.
        $this->assertSame('Habla con Rigo', $s->chat_subtitle);
        $this->assertSame('#FF0000', $s->chat_btn_color);
    }

    public function test_show_flags_tenant_admins_as_restricted(): void
    {
        $this->tenant();
        $this->actAsAdmin();

        $this->withHeaders(['X-Tenant' => 'rigo'])->getJson('/api/admin/ai-settings')
            ->assertOk()->assertJsonPath('restricted', true);
    }

    public function test_single_tenant_install_keeps_full_access(): void
    {
        $this->actAsAdmin();

        $this->putJson('/api/admin/ai-settings', ['system_prompt' => 'MI PROMPT', 'model' => 'gpt-4o'])
            ->assertOk()->assertJsonPath('restricted', false);

        $this->assertSame('MI PROMPT', AiSetting::first()->system_prompt);
        $this->assertTrue((bool) AiSetting::first()->system_prompt_customizado);
    }

    // ── Superadmin: IA por tenant, con el tenant en la URL ───────────

    public function test_superadmin_endpoints_require_the_key(): void
    {
        $t = $this->tenant();

        $this->getJson("/api/superadmin/tenants/{$t->id}/ai-settings")->assertForbidden();
        $this->putJson("/api/superadmin/tenants/{$t->id}/ai-settings", ['system_prompt' => 'x'])->assertForbidden();
    }

    public function test_superadmin_edits_the_prompt_of_the_tenant_in_the_url(): void
    {
        $t = $this->tenant();

        $this->withHeaders($this->sa())->putJson("/api/superadmin/tenants/{$t->id}/ai-settings", [
            'system_prompt' => 'Eres el asistente de Rigoberto.',
            'model'         => 'llama-3.1-8b-instant',
        ])->assertOk()
            ->assertJsonPath('tenant.slug', 'rigo')
            ->assertJsonPath('system_prompt', 'Eres el asistente de Rigoberto.')
            ->assertJsonPath('restricted', false);

        $this->assertSame('Eres el asistente de Rigoberto.', AiSetting::first()->system_prompt);
        $this->assertTrue((bool) AiSetting::first()->system_prompt_customizado);

        $this->withHeaders($this->sa())->getJson("/api/superadmin/tenants/{$t->id}/ai-settings")
            ->assertOk()->assertJsonPath('model', 'llama-3.1-8b-instant');
    }

    public function test_superadmin_response_never_exposes_the_api_key(): void
    {
        $t = $this->tenant();

        $res = $this->withHeaders($this->sa())->putJson("/api/superadmin/tenants/{$t->id}/ai-settings", ['api_key' => 'sk-secreta'])
            ->assertOk()->assertJsonPath('has_own_api_key', true);

        $this->assertStringNotContainsString('sk-secreta', $res->getContent());
    }

    public function test_superadmin_cannot_open_inactive_tenants_settings(): void
    {
        $t = $this->tenant(['is_active' => false]);

        $this->withHeaders($this->sa())->getJson("/api/superadmin/tenants/{$t->id}/ai-settings")
            ->assertStatus(422);
    }

    // ── Nunca dos tenants sobre la misma base ────────────────────────

    public function test_cannot_register_a_tenant_on_another_tenants_database(): void
    {
        $this->tenant();

        $this->withHeaders($this->sa())->postJson('/api/superadmin/tenants', [
            'slug' => 'otro', 'name' => 'Otro', 'db_name' => 'bdpolitic_rigo', 'db_host' => 'db.example', 'db_port' => 3306,
        ])->assertStatus(422)
            ->assertJsonPath('errors.db_name.0', fn ($m) => str_contains($m, "ya la usa el tenant 'rigo'"));

        $this->assertSame(1, Tenant::count());
    }

    public function test_same_db_name_on_a_different_server_is_allowed(): void
    {
        $this->tenant();

        $this->withHeaders($this->sa())->postJson('/api/superadmin/tenants', [
            'slug' => 'otro', 'name' => 'Otro', 'db_name' => 'bdpolitic_rigo', 'db_host' => 'otro-servidor.example', 'db_port' => 3306,
        ])->assertCreated();
    }

    public function test_cannot_register_a_tenant_on_the_central_database(): void
    {
        config(['database.connections.central.database' => 'politicos', 'database.connections.central.host' => 'db.example', 'database.connections.central.port' => 3306]);

        $this->withHeaders($this->sa())->postJson('/api/superadmin/tenants', [
            'slug' => 'central', 'name' => 'X', 'db_name' => 'politicos', 'db_host' => 'db.example', 'db_port' => 3306,
        ])->assertStatus(422);

        $this->assertSame(0, Tenant::count());
    }

    public function test_moving_a_tenant_onto_another_ones_database_is_rejected(): void
    {
        $this->tenant();
        $b = $this->tenant(['slug' => 'b', 'name' => 'B', 'db_name' => 'bdpolitic_b']);

        $this->withHeaders($this->sa())->putJson("/api/superadmin/tenants/{$b->id}", ['db_name' => 'bdpolitic_rigo'])
            ->assertStatus(422);

        $this->assertSame('bdpolitic_b', $b->fresh()->db_name);
    }

    public function test_audit_flags_tenants_that_share_a_database(): void
    {
        config(['database.connections.central.database' => 'politicos']);
        // Datos sucios preexistentes (creados antes de la validación): dos tenants, una BD.
        $this->tenant(['slug' => 'a', 'db_name' => 'compartida']);
        $this->tenant(['slug' => 'b', 'db_name' => 'compartida']);
        $this->tenant(['slug' => 'c', 'db_name' => 'bdpolitic_c']);

        $res = $this->withHeaders($this->sa())->getJson('/api/superadmin/tenants-audit')->assertOk();

        $this->assertEqualsCanonicalizing(['a', 'b'], $res->json('problems'));
        $rowA = collect($res->json('tenants'))->firstWhere('slug', 'a');
        $this->assertSame(['b'], $rowA['shared_with']);
        $this->assertArrayHasKey('prompt_hash', $rowA['ai']);
    }
}
