<?php

namespace Tests\Feature;

use App\Mail\OtpCodeMail;
use App\Models\CitizenProfile;
use App\Models\ContactVerification;
use App\Services\Verification\ContactVerificationService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Verificación por código (OTP) de correo y WhatsApp antes de aceptar un lead.
 */
class VerificacionLeadsTest extends TestCase
{
    private const V1 = '11111111-1111-4111-8111-111111111111';
    private const V2 = '22222222-2222-4222-8222-222222222222';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.tenant_slug' => null,
            'database.default' => 'sqlite',
            'database.connections.sqlite' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false,
            ],
            'verification.enabled' => true,
            'verification.whatsapp.token' => null,
            'verification.whatsapp.phone_number_id' => null,
            'verification.whatsapp.template' => null,
        ]);
        DB::purge('sqlite');
        RateLimiter::clear('x');

        Schema::create('contact_verifications', function (Blueprint $t) {
            $t->id();
            $t->string('channel', 12);
            $t->string('contact', 255);
            $t->string('visitor_uuid', 36)->nullable();
            $t->string('code_hash', 64);
            $t->unsignedTinyInteger('attempts')->default(0);
            $t->string('ip', 45)->nullable();
            $t->timestamp('expires_at');
            $t->timestamp('verified_at')->nullable();
            $t->timestamp('consumed_at')->nullable();
            $t->timestamps();
        });
        Schema::create('citizen_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('visitor_uuid', 36)->nullable();
            $t->string('name', 150)->nullable();
            $t->string('phone_whatsapp', 20)->nullable();
            $t->timestamp('phone_verified_at')->nullable();
            $t->string('email', 255)->nullable();
            $t->timestamp('email_verified_at')->nullable();
            $t->string('dni', 20)->nullable();
            $t->string('district', 100)->nullable();
            $t->string('age_range', 20)->nullable();
            $t->string('occupation', 100)->nullable();
            $t->string('voting_intention')->nullable();
            $t->unsignedInteger('points_balance')->default(0);
            $t->string('referral_code', 16)->nullable();
            $t->string('referred_by_code', 16)->nullable();
            $t->string('source')->default('chat');
            $t->boolean('consented')->default(false);
            $t->timestamp('consent_at')->nullable();
            $t->string('consent_ip', 45)->nullable();
            $t->boolean('is_verified')->default(false);
            $t->integer('duplicate_score')->default(0);
            $t->decimal('browser_lat', 10, 7)->nullable();
            $t->decimal('browser_lng', 10, 7)->nullable();
            $t->float('browser_accuracy')->nullable();
            $t->timestamp('browser_location_at')->nullable();
            $t->string('location_district')->nullable();
            $t->string('location_province')->nullable();
            $t->string('location_department')->nullable();
            $t->string('location_address')->nullable();
            $t->timestamp('location_geocoded_at')->nullable();
            $t->timestamps();
        });
        Schema::create('citizen_points', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('citizen_profile_id');
            $t->string('action');
            $t->integer('points');
            $t->json('metadata')->nullable();
            $t->timestamps();
        });

        Mail::fake();
        RateLimiter::clear('otp:x');
    }

    /** Pide un código de correo y devuelve el código en claro capturado del mail. */
    private function requestEmailCode(string $email = 'ana@example.com', string $visitor = self::V1): string
    {
        $this->postJson('/api/citizen/verify/start', [
            'channel' => 'email', 'contact' => $email, 'visitor_uuid' => $visitor,
        ])->assertOk()->assertJson(['status' => 'sent']);

        $code = null;
        Mail::assertSent(OtpCodeMail::class, function (OtpCodeMail $m) use (&$code) {
            $code = $m->code;

            return true;
        });

        return $code;
    }

    private function verifyEmail(string $email = 'ana@example.com', string $visitor = self::V1): void
    {
        $code = $this->requestEmailCode($email, $visitor);
        $this->postJson('/api/citizen/verify/confirm', [
            'channel' => 'email', 'contact' => $email, 'code' => $code, 'visitor_uuid' => $visitor,
        ])->assertOk()->assertJson(['status' => 'verified']);
    }

    private function register(array $over = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/citizen/register', array_merge([
            'name' => 'Ana Torres', 'email' => 'ana@example.com', 'visitor_uuid' => self::V1,
            'source' => 'chat', 'consent' => true,
        ], $over));
    }

    public function test_config_reports_email_active_and_whatsapp_off_until_configured(): void
    {
        $this->getJson('/api/citizen/verify/config')
            ->assertOk()
            ->assertJson(['enabled' => true, 'channels' => ['email' => true, 'whatsapp' => false]]);
    }

    public function test_correct_code_verifies_and_registration_is_accepted(): void
    {
        $this->verifyEmail();

        $this->register()->assertCreated()->assertJson(['status' => 'registered']);

        $p = CitizenProfile::first();
        $this->assertNotNull($p->email_verified_at);
        $this->assertTrue($p->is_verified);
        $this->assertSame('ana@example.com', $p->email);
        $this->assertNull($p->dni);
    }

    public function test_registration_without_verifying_is_rejected(): void
    {
        $this->register()->assertStatus(422)->assertJson(['reason' => 'contact_not_verified']);
        $this->assertSame(0, CitizenProfile::count());
    }

    public function test_email_is_required_when_the_channel_is_active(): void
    {
        $this->register(['email' => null])->assertStatus(422)->assertJson(['reason' => 'contact_required']);
    }

    public function test_wrong_code_shows_error_and_allows_retry_with_the_right_one(): void
    {
        $code = $this->requestEmailCode();
        $wrong = $code === '000000' ? '111111' : '000000';

        $this->postJson('/api/citizen/verify/confirm', [
            'channel' => 'email', 'contact' => 'ana@example.com', 'code' => $wrong, 'visitor_uuid' => self::V1,
        ])->assertStatus(422)->assertJson(['reason' => 'invalid_code']);

        $this->postJson('/api/citizen/verify/confirm', [
            'channel' => 'email', 'contact' => 'ana@example.com', 'code' => $code, 'visitor_uuid' => self::V1,
        ])->assertOk();
    }

    public function test_code_is_blocked_after_max_attempts_even_with_the_right_code(): void
    {
        $code = $this->requestEmailCode();
        $wrong = $code === '000000' ? '111111' : '000000';

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/citizen/verify/confirm', [
                'channel' => 'email', 'contact' => 'ana@example.com', 'code' => $wrong, 'visitor_uuid' => self::V1,
            ])->assertStatus(422);
        }

        $this->postJson('/api/citizen/verify/confirm', [
            'channel' => 'email', 'contact' => 'ana@example.com', 'code' => $code, 'visitor_uuid' => self::V1,
        ])->assertStatus(429)->assertJson(['reason' => 'too_many_attempts']);
    }

    public function test_expired_code_is_rejected(): void
    {
        $code = $this->requestEmailCode();
        ContactVerification::query()->update(['expires_at' => now()->subMinute()]);

        $this->postJson('/api/citizen/verify/confirm', [
            'channel' => 'email', 'contact' => 'ana@example.com', 'code' => $code, 'visitor_uuid' => self::V1,
        ])->assertStatus(422)->assertJson(['reason' => 'expired']);
    }

    public function test_code_is_stored_hashed_never_in_clear(): void
    {
        $code = $this->requestEmailCode();
        $this->assertNotSame($code, ContactVerification::first()->code_hash);
        $this->assertSame(64, strlen(ContactVerification::first()->code_hash));
    }

    public function test_resend_cooldown_is_enforced(): void
    {
        $this->requestEmailCode();

        $this->postJson('/api/citizen/verify/start', [
            'channel' => 'email', 'contact' => 'ana@example.com', 'visitor_uuid' => self::V1,
        ])->assertStatus(429)->assertJson(['reason' => 'cooldown']);
    }

    public function test_verification_of_one_visitor_cannot_be_used_by_another(): void
    {
        $this->verifyEmail('ana@example.com', self::V1);

        $this->register(['visitor_uuid' => self::V2])
            ->assertStatus(422)->assertJson(['reason' => 'contact_not_verified']);
    }

    public function test_verification_is_single_use(): void
    {
        $this->verifyEmail();
        $this->register()->assertCreated();

        // Otro perfil no puede reutilizar el mismo código ya consumido.
        $this->register(['name' => 'Otra', 'visitor_uuid' => self::V1])->assertStatus(422);
    }

    public function test_verifying_a_contact_does_not_reveal_if_it_is_already_registered(): void
    {
        CitizenProfile::create(['name' => 'Beto', 'email' => 'ana@example.com', 'visitor_uuid' => self::V2, 'consented' => true]);

        $this->verifyEmail('ana@example.com', self::V1);
        $res = $this->register();

        $res->assertOk()->assertJson(['status' => 'ok']);
        $this->assertArrayNotHasKey('citizen_id', $res->json());
        $this->assertSame(1, CitizenProfile::count());
    }

    public function test_invalid_email_is_rejected_on_start(): void
    {
        $this->postJson('/api/citizen/verify/start', [
            'channel' => 'email', 'contact' => 'no-es-correo', 'visitor_uuid' => self::V1,
        ])->assertStatus(422)->assertJson(['reason' => 'invalid_contact']);
        Mail::assertNothingSent();
    }

    public function test_per_ip_limit_blocks_code_pumping(): void
    {
        config(['verification.limits.per_ip' => ['max' => 3, 'minutes' => 60]]);

        foreach (['a@x.com', 'b@x.com', 'c@x.com'] as $i => $mail) {
            $this->postJson('/api/citizen/verify/start', [
                'channel' => 'email', 'contact' => $mail, 'visitor_uuid' => "0000000{$i}-1111-4111-8111-111111111111",
            ])->assertOk();
        }

        $this->postJson('/api/citizen/verify/start', [
            'channel' => 'email', 'contact' => 'd@x.com', 'visitor_uuid' => '00000009-1111-4111-8111-111111111111',
        ])->assertStatus(429)->assertJson(['reason' => 'rate_limited']);
    }

    public function test_whatsapp_channel_sends_template_and_normalizes_peruvian_numbers(): void
    {
        config([
            'verification.whatsapp.token' => 'tok',
            'verification.whatsapp.phone_number_id' => '123',
            'verification.whatsapp.template' => 'codigo_verificacion',
        ]);
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid']]], 200)]);

        $this->postJson('/api/citizen/verify/start', [
            'channel' => 'whatsapp', 'contact' => '987 654 321', 'visitor_uuid' => self::V1,
        ])->assertOk()->assertJson(['status' => 'sent']);

        Http::assertSent(function ($req) {
            return str_contains($req->url(), '/123/messages')
                && $req['to'] === '51987654321'
                && $req['template']['name'] === 'codigo_verificacion'
                && preg_match('/^\d{6}$/', $req['template']['components'][0]['parameters'][0]['text']) === 1;
        });
    }

    public function test_whatsapp_send_failure_returns_error_and_leaves_no_pending_code(): void
    {
        config([
            'verification.whatsapp.token' => 'tok',
            'verification.whatsapp.phone_number_id' => '123',
            'verification.whatsapp.template' => 'codigo_verificacion',
        ]);
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['code' => 131026]], 400)]);

        $this->postJson('/api/citizen/verify/start', [
            'channel' => 'whatsapp', 'contact' => '987654321', 'visitor_uuid' => self::V1,
        ])->assertStatus(503)->assertJson(['reason' => 'send_failed']);

        $this->assertSame(0, ContactVerification::count());
    }

    public function test_registration_requires_both_channels_when_whatsapp_is_configured(): void
    {
        config([
            'verification.whatsapp.token' => 'tok',
            'verification.whatsapp.phone_number_id' => '123',
            'verification.whatsapp.template' => 'codigo_verificacion',
        ]);
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'w']]], 200)]);

        $this->verifyEmail();
        $this->register(['phone_whatsapp' => '987654321'])
            ->assertStatus(422)->assertJson(['reason' => 'contact_not_verified']);

        $this->postJson('/api/citizen/verify/start', [
            'channel' => 'whatsapp', 'contact' => '987654321', 'visitor_uuid' => self::V1,
        ])->assertOk();
        $waCode = null;
        Http::assertSent(function ($req) use (&$waCode) {
            $waCode = $req['template']['components'][0]['parameters'][0]['text'];

            return true;
        });
        $this->postJson('/api/citizen/verify/confirm', [
            'channel' => 'whatsapp', 'contact' => '987654321', 'code' => $waCode, 'visitor_uuid' => self::V1,
        ])->assertOk();

        $this->register(['phone_whatsapp' => '987654321'])->assertCreated()->assertJson(['status' => 'registered']);
        $p = CitizenProfile::first();
        $this->assertSame('51987654321', $p->phone_whatsapp);
        $this->assertNotNull($p->phone_verified_at);
        $this->assertNotNull($p->email_verified_at);
    }

    public function test_verification_disabled_keeps_previous_behavior(): void
    {
        config(['verification.enabled' => false]);

        $this->getJson('/api/citizen/verify/config')->assertJson(['enabled' => false]);
        $this->register()->assertCreated()->assertJson(['status' => 'registered']);
        $this->assertFalse(CitizenProfile::first()->is_verified);
    }

    public function test_mailer_log_in_production_disables_email_requirement(): void
    {
        config(['mail.default' => 'log']);
        $this->app['env'] = 'production';

        $this->assertNotContains(ContactVerificationService::EMAIL, app(ContactVerificationService::class)->activeChannels());
    }
}
