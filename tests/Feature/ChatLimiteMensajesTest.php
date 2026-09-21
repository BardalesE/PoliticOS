<?php

namespace Tests\Feature;

use App\Models\AiSetting;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\CitizenProfile;
use App\Models\Tenant;
use App\Models\User;
use App\Services\ChatQuotaService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Tope de mensajes del chat público: por conversación (10–50, lo fija el
 * superadmin), por visitante en 24 h y por red. Se corta ANTES de llamar a la IA.
 */
class ChatLimiteMensajesTest extends TestCase
{
    private const V1 = '11111111-1111-4111-8111-111111111111';
    private const V2 = '22222222-2222-4222-8222-222222222222';

    protected function setUp(): void
    {
        parent::setUp();

        $sqlite = ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false];
        config([
            'app.tenant_slug' => null,
            'database.default' => 'sqlite',
            'database.connections.sqlite' => $sqlite,
            'database.connections.central' => $sqlite,
            'superadmin.key' => 'clave-super',
        ]);
        DB::purge('sqlite');
        DB::purge('central');

        Schema::create('ai_settings', function (Blueprint $t) {
            $t->id();
            $t->string('provider')->default('groq');
            $t->text('api_key')->nullable();
            $t->string('model')->default('openai/gpt-oss-120b');
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
            $t->unsignedSmallInteger('max_messages_per_session')->default(20);
            $t->unsignedSmallInteger('registration_bonus_messages')->default(50);
            $t->timestamps();
        });
        Schema::create('chat_sessions', function (Blueprint $t) {
            $t->id();
            $t->string('session_id')->unique();
            $t->string('ip')->nullable();
            $t->string('user_agent')->nullable();
            $t->timestamp('started_at')->nullable();
            $t->string('visitor_uuid')->nullable();
            $t->string('referrer')->nullable();
            $t->string('utm_source')->nullable();
            $t->string('utm_medium')->nullable();
            $t->string('utm_campaign')->nullable();
            $t->boolean('consent_data_capture')->default(false);
            $t->timestamp('consent_at')->nullable();
            $t->string('device_type')->nullable();
            $t->string('geo_country')->nullable();
            $t->timestamp('blocked_at')->nullable();
            $t->integer('nonsense_count')->default(0);
            $t->timestamps();
        });
        Schema::create('chat_messages', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('session_id');
            $t->string('role');
            $t->text('content')->nullable();
            $t->timestamps();
        });
        Schema::create('citizen_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('visitor_uuid')->nullable();
            $t->string('name')->nullable();
            $t->timestamps();
        });
        Schema::create('visitor_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('visitor_uuid')->unique();
            $t->integer('visits_count')->default(0);
            $t->timestamp('first_seen_at')->nullable();
            $t->timestamp('last_seen_at')->nullable();
            $t->timestamps();
        });
    }

    private function makeSession(string $id = 's1', string $visitor = self::V1, string $ip = '10.0.0.1'): ChatSession
    {
        return ChatSession::create(['session_id' => $id, 'visitor_uuid' => $visitor, 'ip' => $ip, 'started_at' => now()]);
    }

    private function userMessages(ChatSession $s, int $n, ?\DateTimeInterface $at = null): void
    {
        for ($i = 0; $i < $n; $i++) {
            $m = ChatMessage::create(['session_id' => $s->id, 'role' => 'user', 'content' => "m{$i}"]);
            if ($at) {
                $m->forceFill(['created_at' => $at])->save();
            }
        }
    }

    private function svc(): ChatQuotaService
    {
        return app(ChatQuotaService::class);
    }

    // ── Rango 10–50 ──────────────────────────────────────────────────

    public function test_limit_defaults_to_20_and_is_clamped_to_10_50(): void
    {
        $s = AiSetting::current();
        $this->assertSame(20, $s->sessionMessageLimit());

        foreach ([[3, 10], [10, 10], [37, 37], [50, 50], [500, 50]] as [$stored, $expected]) {
            $s->max_messages_per_session = $stored;
            $this->assertSame($expected, $s->sessionMessageLimit(), "guardado {$stored}");
        }
    }

    // ── Por conversación ─────────────────────────────────────────────

    public function test_session_is_open_until_the_limit_then_blocked(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10]);
        $s = $this->makeSession();

        $this->userMessages($s, 9);
        $q = $this->svc()->evaluate($s);
        $this->assertNull($q['blocked']);
        $this->assertSame(1, $q['remaining']);

        $this->userMessages($s, 1);
        $q = $this->svc()->evaluate($s);
        $this->assertSame('session', $q['blocked']);
        $this->assertSame(0, $q['remaining']);
        $this->assertTrue($q['can_unlock']);
    }

    public function test_leaving_data_unlocks_the_registration_bonus(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10, 'registration_bonus_messages' => 50]);
        $s = $this->makeSession();
        $this->userMessages($s, 10);
        $this->assertSame('session', $this->svc()->evaluate($s)['blocked']);

        CitizenProfile::create(['visitor_uuid' => self::V1, 'name' => 'Ana']);

        $q = $this->svc()->evaluate($s);
        $this->assertNull($q['blocked']);
        $this->assertSame(60, $q['max'], '10 iniciales + 50 al registrarse');
        $this->assertSame(50, $q['remaining']);
        $this->assertSame(50, $q['bonus']);
        $this->assertTrue($q['registered']);

        $this->userMessages($s, 50);
        $q = $this->svc()->evaluate($s);
        $this->assertSame('session', $q['blocked']);
        $this->assertFalse($q['can_unlock'], 'ya dejó sus datos: no se ofrece de nuevo');
    }

    public function test_bonus_is_configurable_and_clamped_to_10_100(): void
    {
        $s = AiSetting::current();
        $this->assertSame(50, $s->registrationBonus());

        foreach ([[3, 10], [10, 10], [75, 75], [100, 100], [900, 100]] as [$stored, $expected]) {
            $s->registration_bonus_messages = $stored;
            $this->assertSame($expected, $s->registrationBonus(), "guardado {$stored}");
        }
    }

    public function test_exhausted_message_promises_the_configured_bonus(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10, 'registration_bonus_messages' => 50]);
        $s = $this->makeSession('s-msg');
        $this->userMessages($s, 10);

        $res = $this->postJson('/api/chat', ['message' => 'x', 'session_id' => 's-msg', 'visitor_id' => self::V1, 'initialized' => true])->assertOk();

        $this->assertStringContainsString('50 mensajes más', $res->json('reply'));
    }

    public function test_limits_endpoint_exposes_only_the_two_numbers(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10, 'registration_bonus_messages' => 50]);

        $this->getJson('/api/chat/limits')->assertOk()->assertExactJson(['base' => 10, 'bonus' => 50]);
    }

    public function test_someone_elses_registration_does_not_unlock_me(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10]);
        CitizenProfile::create(['visitor_uuid' => self::V2, 'name' => 'Otro']);
        $s = $this->makeSession('s1', self::V1);
        $this->userMessages($s, 10);

        $this->assertSame('session', $this->svc()->evaluate($s)['blocked']);
    }

    // ── Anti-evasión: conversación nueva ≠ reinicio ilimitado ────────

    public function test_new_conversations_share_the_daily_visitor_cap(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10]);

        // 3 conversaciones agotadas (10 c/u = 30 = 3N) del mismo visitante.
        foreach (['a', 'b', 'c'] as $id) {
            $this->userMessages($this->makeSession($id), 10);
        }

        $fresh = $this->makeSession('d');
        $q = $this->svc()->evaluate($fresh);
        $this->assertSame('daily', $q['blocked']);
        $this->assertFalse($q['can_unlock']);
        $this->assertFalse($q['can_new_session'] === true && $q['blocked'] === null);
        $this->assertNotNull($q['resets_at']);
    }

    public function test_daily_cap_forgets_messages_older_than_24_hours(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10]);
        foreach (['a', 'b', 'c'] as $id) {
            $this->userMessages($this->makeSession($id), 10, now()->subHours(25));
        }

        $this->assertNull($this->svc()->evaluate($this->makeSession('d'))['blocked']);
    }

    public function test_network_cap_stops_someone_rotating_visitor_ids(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10, 'registration_bonus_messages' => 50]);

        // 5(N+B) = 300 mensajes desde la misma IP repartidos entre muchos "visitantes".
        for ($i = 0; $i < 30; $i++) {
            $v = sprintf('aaaaaaaa-aaaa-4aaa-8aaa-%012d', $i);
            $this->userMessages($this->makeSession("r{$i}", $v, '203.0.113.9'), 10);
        }

        $q = $this->svc()->evaluate($this->makeSession('nuevo', self::V2, '203.0.113.9'));
        $this->assertSame('network', $q['blocked']);
    }

    public function test_a_team_behind_one_ip_is_not_blocked_by_normal_use(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 20, 'registration_bonus_messages' => 50]);

        // 8 personas de una oficina con 15 mensajes c/u = 120 < 5(N+B) (350).
        for ($i = 0; $i < 8; $i++) {
            $v = sprintf('bbbbbbbb-bbbb-4bbb-8bbb-%012d', $i);
            $this->userMessages($this->makeSession("p{$i}", $v, '198.51.100.7'), 15);
        }

        $this->assertNull($this->svc()->evaluate($this->makeSession('p9', self::V2, '198.51.100.7'))['blocked']);
    }

    // ── HTTP: se corta antes de la IA ────────────────────────────────

    public function test_http_chat_returns_exhausted_message_without_calling_the_ai(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10]);
        $s = $this->makeSession('s-http');
        $this->userMessages($s, 10);

        $res = $this->postJson('/api/chat', [
            'message' => 'hola otra vez', 'session_id' => 's-http', 'visitor_id' => self::V1, 'initialized' => true,
        ])->assertOk();

        $this->assertStringContainsString('Mensajes agotados', $res->json('reply'));
        $res->assertJsonPath('quota.blocked', 'session')
            ->assertJsonPath('quota.can_unlock', true)
            ->assertJsonPath('quota.max', 10);

        // No se guardó el mensaje rechazado (no hubo IA, no hubo costo).
        $this->assertSame(10, ChatMessage::where('session_id', $s->id)->count());
    }

    public function test_client_visitor_id_is_adopted_by_an_existing_session(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10]);
        $s = $this->makeSession('s-adopt', self::V2);   // creada con un UUID aleatorio del servidor
        $this->userMessages($s, 10);

        $this->postJson('/api/chat', ['message' => 'x', 'session_id' => 's-adopt', 'visitor_id' => self::V1, 'initialized' => true])
            ->assertOk();

        $this->assertSame(self::V1, $s->fresh()->visitor_uuid);
    }

    public function test_invalid_visitor_id_is_ignored(): void
    {
        AiSetting::current()->update(['max_messages_per_session' => 10]);
        $s = $this->makeSession('s-bad', self::V1);
        $this->userMessages($s, 10);

        $this->postJson('/api/chat', ['message' => 'x', 'session_id' => 's-bad', 'visitor_id' => "'; DROP TABLE x;--", 'initialized' => true])
            ->assertOk()->assertJsonPath('quota.blocked', 'session');
        $this->assertSame(self::V1, $s->fresh()->visitor_uuid);
    }

    // ── Quién lo configura ───────────────────────────────────────────

    public function test_superadmin_sets_the_limit_and_the_range_is_enforced(): void
    {
        Schema::connection('central')->create('tenants', function (Blueprint $t) {
            $t->id(); $t->string('slug'); $t->string('name'); $t->string('db_name');
            $t->string('db_host')->nullable(); $t->integer('db_port')->nullable();
            $t->string('db_user')->nullable(); $t->string('db_password')->nullable();
            $t->string('plan')->default('starter'); $t->boolean('is_active')->default(true);
            $t->json('custom_features')->nullable(); $t->string('admin_email')->nullable();
            $t->text('admin_password_hint')->nullable(); $t->timestamp('password_changed_at')->nullable();
            $t->text('credential_log')->nullable(); $t->timestamps();
        });
        $tenant = Tenant::create(['slug' => 'rigo', 'name' => 'Rigo', 'db_name' => 'bdpolitic_rigo', 'db_host' => 'h', 'db_port' => 3306]);
        $url = "/api/superadmin/tenants/{$tenant->id}/ai-settings";
        $h = ['X-Super-Admin-Key' => 'clave-super'];

        $this->withHeaders($h)->putJson($url, ['max_messages_per_session' => 35])
            ->assertOk()->assertJsonPath('max_messages_per_session', 35);
        $this->assertSame(35, AiSetting::first()->sessionMessageLimit());

        $this->withHeaders($h)->putJson($url, ['max_messages_per_session' => 9])->assertStatus(422);
        $this->withHeaders($h)->putJson($url, ['max_messages_per_session' => 51])->assertStatus(422);

        $this->withHeaders($h)->putJson($url, ['registration_bonus_messages' => 50])
            ->assertOk()->assertJsonPath('registration_bonus_messages', 50);
        $this->withHeaders($h)->putJson($url, ['registration_bonus_messages' => 9])->assertStatus(422);
        $this->withHeaders($h)->putJson($url, ['registration_bonus_messages' => 101])->assertStatus(422);
    }

    public function test_a_candidate_admin_cannot_raise_their_own_limit(): void
    {
        Schema::create('tenants', fn (Blueprint $t) => $t->id());
        Schema::connection('central')->create('tenants', function (Blueprint $t) {
            $t->id(); $t->string('slug'); $t->string('name'); $t->string('db_name');
            $t->string('db_host')->nullable(); $t->integer('db_port')->nullable();
            $t->string('db_user')->nullable(); $t->string('db_password')->nullable();
            $t->string('plan')->default('starter'); $t->boolean('is_active')->default(true);
            $t->json('custom_features')->nullable(); $t->string('admin_email')->nullable();
            $t->text('admin_password_hint')->nullable(); $t->timestamp('password_changed_at')->nullable();
            $t->text('credential_log')->nullable(); $t->timestamps();
        });
        Tenant::create(['slug' => 'rigo', 'name' => 'Rigo', 'db_name' => 'bdpolitic_rigo', 'db_host' => 'h', 'db_port' => 3306]);
        AiSetting::current()->update(['max_messages_per_session' => 10]);

        $user = new User();
        $user->role = 'admin';
        Sanctum::actingAs($user);

        $this->withHeaders(['X-Tenant' => 'rigo'])->putJson('/api/admin/ai-settings', ['max_messages_per_session' => 50, 'registration_bonus_messages' => 100, 'chat_subtitle' => 'Hola'])
            ->assertOk();

        $this->assertSame(10, AiSetting::first()->sessionMessageLimit());
        $this->assertSame(50, AiSetting::first()->registrationBonus());
    }
}
