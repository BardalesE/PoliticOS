<?php

namespace Tests\Feature;

use App\Models\AiSetting;
use App\Models\CandidateProfile;
use App\Models\CandidateSupportVote;
use App\Models\ChatMessage;
use App\Models\KnowledgeDocument;
use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;
use App\Models\User;
use App\Models\VisitorSegment;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Segmentador por zona del chat (distrito → solo ese distrito; provincia → todos
 * sus distritos; departamento → todo el departamento), mini encuesta de apoyo
 * sí/no y dashboard agregado.
 */
class SegmentacionTest extends TestCase
{
    private const V1 = '11111111-1111-4111-8111-111111111111';
    private const V2 = '22222222-2222-4222-8222-222222222222';

    private UbigeoDistrito $sanGregorio;   // Cajamarca > San Miguel
    private UbigeoDistrito $sanMiguel;     // Cajamarca > San Miguel
    private UbigeoDistrito $cajamarca;     // Cajamarca > Cajamarca (otra provincia, mismo depto)
    private UbigeoDistrito $trujillo;      // La Libertad

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.tenant_slug' => null,
            'database.default' => 'sqlite',
            'database.connections.sqlite' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false,
            ],
        ]);
        DB::purge('sqlite');

        Schema::create('candidate_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('name', 150);
            $t->string('title', 200);
            $t->string('location', 150);
            $t->string('party', 100);
            $t->string('list_number', 10)->default('1');
            $t->text('bio')->nullable();
            $t->string('tagline', 300)->nullable();
            $t->string('photo_url', 500)->nullable();
            $t->string('tiktok_url', 500)->nullable();
            $t->string('facebook_url', 500)->nullable();
            $t->string('instagram_url', 500)->nullable();
            $t->string('whatsapp_number', 20)->nullable();
            $t->boolean('is_active')->default(false);
            $t->json('forbidden_topics')->nullable();
            $t->timestamps();
        });
        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->text('description')->nullable();
            $t->string('file_url')->nullable();
            $t->longText('content')->nullable();
            $t->string('topic', 40)->nullable();
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->string('source_url', 500)->nullable();
            $t->string('source_type', 20)->nullable();
            $t->unsignedBigInteger('file_size')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('pending');
            $t->timestamps();
        });
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
            $t->timestamps();
        });
        Schema::create('chat_messages', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('session_id');
            $t->string('role');
            $t->text('content')->nullable();
            $t->timestamps();
        });

        foreach ([
            '2026_09_16_000001_create_ubigeo_departamentos_table',
            '2026_09_16_000002_create_ubigeo_provincias_table',
            '2026_09_16_000003_create_ubigeo_distritos_table',
            '2026_09_16_000004_add_distrito_id_to_candidate_profiles_table',
            '2026_09_17_231310_add_directorio_fields_to_candidate_profiles_table',
            '2026_09_21_000001_create_chat_segmentation_tables',
        ] as $migration) {
            (require database_path("migrations/{$migration}.php"))->up();
        }

        $caj = UbigeoDepartamento::create(['departamento' => 'CAJAMARCA', 'ubigeo' => '06']);
        $lib = UbigeoDepartamento::create(['departamento' => 'LA LIBERTAD', 'ubigeo' => '13']);
        $sm  = UbigeoProvincia::create(['provincia' => 'SAN MIGUEL', 'ubigeo' => '0612', 'departamento_id' => $caj->id]);
        $cj  = UbigeoProvincia::create(['provincia' => 'CAJAMARCA', 'ubigeo' => '0601', 'departamento_id' => $caj->id]);
        $tru = UbigeoProvincia::create(['provincia' => 'TRUJILLO', 'ubigeo' => '1301', 'departamento_id' => $lib->id]);

        $this->sanGregorio = UbigeoDistrito::create(['distrito' => 'SAN GREGORIO', 'ubigeo' => '061206', 'provincia_id' => $sm->id, 'departamento_id' => $caj->id]);
        $this->sanMiguel   = UbigeoDistrito::create(['distrito' => 'SAN MIGUEL', 'ubigeo' => '061201', 'provincia_id' => $sm->id, 'departamento_id' => $caj->id]);
        $this->cajamarca   = UbigeoDistrito::create(['distrito' => 'CAJAMARCA', 'ubigeo' => '060101', 'provincia_id' => $cj->id, 'departamento_id' => $caj->id]);
        $this->trujillo    = UbigeoDistrito::create(['distrito' => 'TRUJILLO', 'ubigeo' => '130101', 'provincia_id' => $tru->id, 'departamento_id' => $lib->id]);

        ChatMessage::$scopedCandidateId = null;
    }

    protected function tearDown(): void
    {
        ChatMessage::$scopedCandidateId = null;
        parent::tearDown();
    }

    private function candidato(string $name, UbigeoDistrito $d): CandidateProfile
    {
        $c = CandidateProfile::create([
            'name' => $name, 'title' => 'Alcalde', 'party' => 'X', 'location' => 'x',
            'distrito_id' => $d->id, 'slug' => strtolower(str_replace(' ', '-', $name)),
            'estado_publicacion' => 'publicado', 'tipo_cuenta' => 'publico_gratuito',
        ]);
        KnowledgeDocument::create(['title' => 'Plan', 'candidate_id' => $c->id, 'status' => 'ready', 'is_active' => true]);

        return $c;
    }

    private function poll(bool $on = true): void
    {
        AiSetting::current()->update(['support_poll_enabled' => $on]);
    }

    private function zona(string $visitor, UbigeoDistrito $d)
    {
        return $this->putJson('/api/segmentacion/zona', ['visitor_id' => $visitor, 'distrito_id' => $d->id]);
    }

    // ── Segmentador ──────────────────────────────────────────────────

    private function zonaNivel(string $visitor, array $ids)
    {
        return $this->putJson('/api/segmentacion/zona', ['visitor_id' => $visitor] + $ids);
    }

    private function nombres($res): array
    {
        return collect($res->json('candidatos'))->pluck('name')->sort()->values()->all();
    }

    private function sembrar(): void
    {
        $this->candidato('Ana Gregorio', $this->sanGregorio);      // Cajamarca > San Miguel > San Gregorio
        $this->candidato('Beto Miguel', $this->sanMiguel);         // Cajamarca > San Miguel > San Miguel
        $this->candidato('Carla Miguel', $this->sanMiguel);
        $this->candidato('Dario Cajamarca', $this->cajamarca);     // Cajamarca > Cajamarca > Cajamarca
        $this->candidato('Gina Trujillo', $this->trujillo);        // La Libertad
    }

    public function test_district_shows_only_that_districts_candidates_even_if_just_one(): void
    {
        $this->sembrar();

        $res = $this->zona(self::V1, $this->sanGregorio)->assertOk();

        $this->assertSame(['Ana Gregorio'], $this->nombres($res));
        $this->assertSame('distrito', $res->json('zona.nivel'));
        $this->assertSame('SAN GREGORIO', $res->json('zona.distrito'));
        $this->assertSame('SAN MIGUEL', $res->json('zona.provincia'));
        $this->assertSame('CAJAMARCA', $res->json('zona.departamento'));
    }

    public function test_district_with_several_candidates_lists_all_of_them_without_a_cap(): void
    {
        foreach (range(1, 7) as $i) {
            $this->candidato("Cand {$i}", $this->sanMiguel);
        }
        $this->candidato('De otro distrito', $this->sanGregorio);

        $res = $this->zona(self::V1, $this->sanMiguel)->assertOk();

        $this->assertCount(7, $res->json('candidatos'));
        $this->assertNotContains('De otro distrito', $this->nombres($res));
    }

    public function test_province_shows_candidates_of_all_its_districts_and_no_other_province(): void
    {
        $this->sembrar();

        $res = $this->zonaNivel(self::V1, ['provincia_id' => $this->sanMiguel->provincia_id])->assertOk();

        $this->assertSame(['Ana Gregorio', 'Beto Miguel', 'Carla Miguel'], $this->nombres($res));
        $this->assertSame('provincia', $res->json('zona.nivel'));
        $this->assertNull($res->json('zona.distrito'));
        $this->assertSame('SAN MIGUEL', $res->json('zona.provincia'));
        $this->assertSame('CAJAMARCA', $res->json('zona.departamento'));
    }

    public function test_department_shows_every_candidate_of_the_department_and_no_other(): void
    {
        $this->sembrar();

        $res = $this->zonaNivel(self::V1, ['departamento_id' => $this->sanMiguel->departamento_id])->assertOk();

        $this->assertSame(['Ana Gregorio', 'Beto Miguel', 'Carla Miguel', 'Dario Cajamarca'], $this->nombres($res));
        $this->assertSame('departamento', $res->json('zona.nivel'));
        $this->assertNull($res->json('zona.provincia'));
        $this->assertNull($res->json('zona.distrito'));
    }

    public function test_parents_are_derived_from_the_most_specific_level(): void
    {
        $this->zonaNivel(self::V1, ['distrito_id' => $this->sanGregorio->id])->assertOk();

        $seg = VisitorSegment::first();
        $this->assertSame($this->sanGregorio->id, $seg->distrito_id);
        $this->assertSame($this->sanGregorio->provincia_id, $seg->provincia_id);
        $this->assertSame($this->sanGregorio->departamento_id, $seg->departamento_id);

        // Un ID de departamento inconsistente no pisa a la provincia elegida.
        $this->zonaNivel(self::V1, ['provincia_id' => $this->cajamarca->provincia_id, 'departamento_id' => $this->trujillo->departamento_id])->assertOk();
        $seg = VisitorSegment::first();
        $this->assertNull($seg->distrito_id);
        $this->assertSame($this->cajamarca->provincia_id, $seg->provincia_id);
        $this->assertSame($this->cajamarca->departamento_id, $seg->departamento_id);
    }

    public function test_only_published_candidates_with_ready_documents_appear(): void
    {
        $this->candidato('Publicado', $this->sanGregorio);
        $b = $this->candidato('Borrador', $this->sanGregorio);
        $b->update(['estado_publicacion' => 'borrador']);

        $res = $this->zona(self::V1, $this->sanGregorio)->assertOk();

        $this->assertSame(['Publicado'], $this->nombres($res));
    }

    public function test_zone_is_remembered_per_visitor_and_restored_by_get(): void
    {
        $this->candidato('Ana Gregorio', $this->sanGregorio);
        $this->zona(self::V1, $this->sanGregorio)->assertOk();

        $this->getJson('/api/segmentacion/zona?visitor_id='.self::V1)
            ->assertOk()->assertJsonPath('zona.distrito_id', $this->sanGregorio->id)
            ->assertJsonCount(1, 'candidatos');

        // Otro visitante no hereda la zona.
        $this->getJson('/api/segmentacion/zona?visitor_id='.self::V2)
            ->assertOk()->assertJsonPath('zona', null)->assertJsonCount(0, 'candidatos');

        $this->assertSame(1, VisitorSegment::count());
    }

    public function test_changing_zone_updates_the_same_row(): void
    {
        $this->zona(self::V1, $this->sanGregorio)->assertOk();
        $this->zona(self::V1, $this->trujillo)->assertOk();

        $this->assertSame(1, VisitorSegment::count());
        $this->assertSame($this->trujillo->id, VisitorSegment::first()->distrito_id);
    }

    public function test_rejects_unknown_district(): void
    {
        $this->putJson('/api/segmentacion/zona', ['visitor_id' => self::V1, 'distrito_id' => 99999])->assertStatus(422);
        $this->putJson('/api/segmentacion/zona', ['visitor_id' => self::V1, 'provincia_id' => 99999])->assertStatus(422);
        $this->putJson('/api/segmentacion/zona', ['visitor_id' => self::V1, 'departamento_id' => 99999])->assertStatus(422);
        $this->putJson('/api/segmentacion/zona', ['visitor_id' => self::V1])->assertStatus(422);
        $this->assertSame(0, VisitorSegment::count());
    }

    // ── Mini encuesta sí / no ────────────────────────────────────────

    public function test_vote_is_forbidden_when_the_poll_is_disabled(): void
    {
        $c = $this->candidato('Ana Gregorio', $this->sanGregorio);

        $this->postJson('/api/segmentacion/apoyo', ['visitor_id' => self::V1, 'candidate_slug' => $c->slug, 'supports' => true])
            ->assertForbidden();

        $this->assertSame(0, CandidateSupportVote::count());
    }

    public function test_one_vote_per_visitor_and_candidate_and_it_is_editable(): void
    {
        $this->poll();
        $c = $this->candidato('Ana Gregorio', $this->sanGregorio);
        $this->zona(self::V1, $this->sanGregorio);

        $vote = fn (bool $s) => $this->postJson('/api/segmentacion/apoyo', [
            'visitor_id' => self::V1, 'candidate_slug' => $c->slug, 'supports' => $s,
        ]);

        $vote(true)->assertOk()->assertJsonPath("votos.{$c->slug}", true);
        $vote(false)->assertOk()->assertJsonPath("votos.{$c->slug}", false);

        $this->assertSame(1, CandidateSupportVote::count());
        $row = CandidateSupportVote::first();
        $this->assertFalse($row->supports);
        // Foto fija de la zona del visitante al votar.
        $this->assertSame($this->sanGregorio->id, $row->distrito_id);
        $this->assertSame($this->sanGregorio->departamento_id, $row->departamento_id);

        // Otro visitante suma otro voto.
        $this->postJson('/api/segmentacion/apoyo', ['visitor_id' => self::V2, 'candidate_slug' => $c->slug, 'supports' => true])->assertOk();
        $this->assertSame(2, CandidateSupportVote::count());
    }

    public function test_vote_for_unknown_or_unpublished_candidate_is_rejected(): void
    {
        $this->poll();
        $c = $this->candidato('Ana Gregorio', $this->sanGregorio);
        $c->update(['estado_publicacion' => 'borrador']);

        $this->postJson('/api/segmentacion/apoyo', ['visitor_id' => self::V1, 'candidate_slug' => $c->slug, 'supports' => true])->assertNotFound();
        $this->postJson('/api/segmentacion/apoyo', ['visitor_id' => self::V1, 'candidate_slug' => 'no-existe', 'supports' => true])->assertNotFound();
        $this->postJson('/api/segmentacion/apoyo', ['visitor_id' => self::V1, 'candidate_slug' => 'x', 'supports' => 'quizas'])->assertStatus(422);
        $this->assertSame(0, CandidateSupportVote::count());
    }

    public function test_public_api_never_exposes_other_peoples_votes(): void
    {
        $this->poll();
        $c = $this->candidato('Ana Gregorio', $this->sanGregorio);
        $this->zona(self::V1, $this->sanGregorio);
        $this->postJson('/api/segmentacion/apoyo', ['visitor_id' => self::V2, 'candidate_slug' => $c->slug, 'supports' => true])->assertOk();

        $res = $this->getJson('/api/segmentacion/zona?visitor_id='.self::V1)->assertOk();

        $this->assertSame([], (array) $res->json('votos'));
        $this->assertStringNotContainsString(self::V2, $res->getContent());
    }

    // ── Consultas por candidato ──────────────────────────────────────

    public function test_user_messages_inherit_the_scoped_candidate_but_assistant_ones_do_not(): void
    {
        $c = $this->candidato('Ana Gregorio', $this->sanGregorio);

        ChatMessage::$scopedCandidateId = $c->id;
        $u = ChatMessage::create(['session_id' => 1, 'role' => 'user', 'content' => 'hola']);
        $a = ChatMessage::create(['session_id' => 1, 'role' => 'assistant', 'content' => 'hola']);

        ChatMessage::$scopedCandidateId = null;
        $sin = ChatMessage::create(['session_id' => 1, 'role' => 'user', 'content' => 'otra']);

        $this->assertSame($c->id, $u->fresh()->candidate_profile_id);
        $this->assertNull($a->fresh()->candidate_profile_id);
        $this->assertNull($sin->fresh()->candidate_profile_id);
    }

    // ── Dashboard admin ──────────────────────────────────────────────

    public function test_dashboard_requires_admin(): void
    {
        $this->getJson('/api/admin/segmentacion/resumen')->assertUnauthorized();
    }

    public function test_dashboard_aggregates_visitors_votes_and_consultations(): void
    {
        $this->poll();
        $ana  = $this->candidato('Ana Gregorio', $this->sanGregorio);
        $beto = $this->candidato('Beto Trujillo', $this->trujillo);

        $this->zona(self::V1, $this->sanGregorio);
        $this->zona(self::V2, $this->sanGregorio);
        $this->zona('33333333-3333-4333-8333-333333333333', $this->trujillo);

        $vote = fn (string $v, CandidateProfile $c, bool $s) => $this->postJson('/api/segmentacion/apoyo', [
            'visitor_id' => $v, 'candidate_slug' => $c->slug, 'supports' => $s,
        ])->assertOk();
        $vote(self::V1, $ana, true);
        $vote(self::V2, $ana, false);
        $vote('33333333-3333-4333-8333-333333333333', $beto, true);

        ChatMessage::$scopedCandidateId = $ana->id;
        ChatMessage::create(['session_id' => 1, 'role' => 'user', 'content' => 'a']);
        ChatMessage::create(['session_id' => 1, 'role' => 'user', 'content' => 'b']);
        ChatMessage::$scopedCandidateId = null;
        ChatMessage::create(['session_id' => 1, 'role' => 'user', 'content' => 'sin candidato']);

        $user = new User();
        $user->role = 'admin';
        Sanctum::actingAs($user);

        $res = $this->getJson('/api/admin/segmentacion/resumen')->assertOk();

        $this->assertSame(3, $res->json('kpis.visitantes_con_zona'));
        $this->assertSame(2, $res->json('kpis.consultas'));          // el mensaje sin candidato no cuenta
        $this->assertSame(3, $res->json('kpis.votos'));
        $this->assertSame(2, $res->json('kpis.apoyo_si'));
        $this->assertSame(1, $res->json('kpis.apoyo_no'));
        $this->assertCount(14, $res->json('serie'));
        $this->assertSame(3, collect($res->json('serie'))->sum('visitantes'));

        $zonas = collect($res->json('zonas'))->keyBy('place');
        $this->assertSame(2, $zonas['CAJAMARCA']['visitantes']);
        $this->assertSame(1, $zonas['CAJAMARCA']['si']);
        $this->assertSame(1, $zonas['CAJAMARCA']['no']);
        $this->assertSame(1, $zonas['LA LIBERTAD']['visitantes']);

        $cands = collect($res->json('candidatos'))->keyBy('name');
        $this->assertSame(2, $cands['Ana Gregorio']['consultas']);
        $this->assertSame(50, $cands['Ana Gregorio']['pct_si']);
        $this->assertSame(100, $cands['Beto Trujillo']['pct_si']);

        // Drill-down: provincias de Cajamarca.
        $prov = $this->getJson('/api/admin/segmentacion/resumen?nivel=provincia&parent_id='.$this->sanGregorio->departamento_id)->assertOk();
        $this->assertSame(['SAN MIGUEL'], collect($prov->json('zonas'))->pluck('place')->all());

        // Filtrado por candidato: solo sus votos por zona.
        $solo = $this->getJson('/api/admin/segmentacion/resumen?candidate_id='.$beto->id)->assertOk();
        $z = collect($solo->json('zonas'))->keyBy('place');
        $this->assertSame(0, $z['CAJAMARCA']['si'] + $z['CAJAMARCA']['no']);
        $this->assertSame(1, $z['LA LIBERTAD']['si']);
    }

    public function test_dashboard_exposes_no_individual_visitor_data(): void
    {
        $this->poll();
        $c = $this->candidato('Ana Gregorio', $this->sanGregorio);
        $this->zona(self::V1, $this->sanGregorio);
        $this->postJson('/api/segmentacion/apoyo', ['visitor_id' => self::V1, 'candidate_slug' => $c->slug, 'supports' => true])->assertOk();

        $user = new User();
        $user->role = 'admin';
        Sanctum::actingAs($user);

        $body = $this->getJson('/api/admin/segmentacion/resumen')->assertOk()->getContent();

        $this->assertStringNotContainsString(self::V1, $body);
        $this->assertStringNotContainsString('visitor_uuid', $body);
    }

    // ── Interruptor del superadmin ───────────────────────────────────

    public function test_poll_switch_is_not_editable_by_candidate_admins(): void
    {
        $this->assertNotContains('support_poll_enabled', AiSetting::TENANT_EDITABLE);
    }

    public function test_single_tenant_admin_can_toggle_the_poll_and_it_validates(): void
    {
        $user = new User();
        $user->role = 'admin';
        Sanctum::actingAs($user);

        $this->putJson('/api/admin/ai-settings', ['support_poll_enabled' => true])->assertOk();
        $this->assertTrue((bool) AiSetting::first()->support_poll_enabled);

        $this->putJson('/api/admin/ai-settings', ['support_poll_enabled' => 'quizas'])->assertStatus(422);
    }
}
