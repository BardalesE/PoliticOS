<?php

namespace Tests\Feature;

use App\Models\CandidateProfile;
use App\Models\KnowledgeDocument;
use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Directorio público de candidatos: regla de visibilidad + alta manual admin.
 *
 * Corre sobre SQLite en memoria. Las tablas de ubigeo y las columnas de
 * directorio salen de las migraciones REALES; candidate_profiles y
 * knowledge_documents se crean con el subconjunto mínimo de columnas porque su
 * historial de migraciones incluye SQL específico de MySQL.
 */
class DirectorioTest extends TestCase
{
    private UbigeoDistrito $sanGregorio;   // Cajamarca > San Miguel > San Gregorio
    private UbigeoDistrito $sanMiguel;     // Cajamarca > San Miguel > San Miguel
    private UbigeoDistrito $trujillo;      // La Libertad > Trujillo > Trujillo

    protected function setUp(): void
    {
        parent::setUp();

        config([
            // Modo single-tenant: que el test no dependa del APP_TENANT_SLUG del .env
            // (ResolveTenant consultaría la BD central en MySQL).
            'app.tenant_slug' => null,
            'database.default' => 'sqlite',
            'database.connections.sqlite' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true,
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
            $t->json('pages')->nullable();
            $t->string('topic', 40)->nullable();
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->string('source_url', 500)->nullable();
            $t->string('source_type', 20)->nullable();
            $t->unsignedBigInteger('file_size')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('pending');
            $t->text('error_message')->nullable();
            $t->timestamps();
        });

        foreach ([
            '2026_09_16_000001_create_ubigeo_departamentos_table',
            '2026_09_16_000002_create_ubigeo_provincias_table',
            '2026_09_16_000003_create_ubigeo_distritos_table',
            '2026_09_16_000004_add_distrito_id_to_candidate_profiles_table',
            '2026_09_17_231310_add_directorio_fields_to_candidate_profiles_table',
            '2026_09_30_000001_create_candidato_regidores_table',
            '2026_09_30_000002_add_ambito_to_candidate_profiles_table',
        ] as $migration) {
            (require database_path("migrations/{$migration}.php"))->up();
        }

        $caj = UbigeoDepartamento::create(['departamento' => 'CAJAMARCA', 'ubigeo' => '06']);
        $lib = UbigeoDepartamento::create(['departamento' => 'LA LIBERTAD', 'ubigeo' => '13']);
        $sm  = UbigeoProvincia::create(['provincia' => 'SAN MIGUEL', 'ubigeo' => '0612', 'departamento_id' => $caj->id]);
        $tru = UbigeoProvincia::create(['provincia' => 'TRUJILLO', 'ubigeo' => '1301', 'departamento_id' => $lib->id]);

        $this->sanGregorio = UbigeoDistrito::create(['distrito' => 'SAN GREGORIO', 'ubigeo' => '061206', 'provincia_id' => $sm->id, 'departamento_id' => $caj->id]);
        $this->sanMiguel   = UbigeoDistrito::create(['distrito' => 'SAN MIGUEL', 'ubigeo' => '061201', 'provincia_id' => $sm->id, 'departamento_id' => $caj->id]);
        $this->trujillo    = UbigeoDistrito::create(['distrito' => 'TRUJILLO', 'ubigeo' => '130101', 'provincia_id' => $tru->id, 'departamento_id' => $lib->id]);
    }

    private function candidato(array $over = [], ?UbigeoDistrito $distrito = null, ?string $docStatus = 'ready'): CandidateProfile
    {
        static $n = 0;
        $n++;
        $distrito ??= $this->sanGregorio;

        $c = CandidateProfile::create($over + [
            'name' => "Candidato {$n}", 'title' => 'Candidato a Alcalde', 'party' => 'Partido X',
            'location' => 'x', 'distrito_id' => $distrito->id, 'slug' => "candidato-{$n}",
            'estado_publicacion' => 'publicado', 'tipo_cuenta' => 'publico_gratuito',
        ]);

        if ($docStatus !== null) {
            $this->documento($c, ['status' => $docStatus]);
        }

        return $c;
    }

    private function documento(CandidateProfile $c, array $over = []): KnowledgeDocument
    {
        return KnowledgeDocument::create($over + [
            'title' => 'Plan de Gobierno', 'candidate_id' => $c->id, 'file_url' => 'https://x/plan.pdf',
            'content' => 'TEXTO COMPLETO SECRETO DEL RAG', 'status' => 'ready', 'is_active' => true,
        ]);
    }

    private function actAs(string $role): void
    {
        $user = new User();
        $user->role = $role;
        Sanctum::actingAs($user);
    }

    // ── Regla de visibilidad ─────────────────────────────────────────

    public function test_ubicaciones_is_empty_without_candidates(): void
    {
        $this->getJson('/api/directorio/ubicaciones')
            ->assertOk()
            ->assertExactJson(['departamentos' => [], 'total_candidatos' => 0, 'total_distritos' => 0]);
    }

    public function test_only_published_candidates_with_a_ready_document_light_up_a_place(): void
    {
        $this->candidato(['estado_publicacion' => 'borrador']);                       // borrador
        $this->candidato([], null, null);                                             // sin documentos
        $this->candidato([], null, 'pending');                                        // documento sin procesar
        $this->candidato([], null, 'failed');                                         // documento fallido
        $inactivo = $this->candidato([], null, null);                                 // documento inactivo
        $this->documento($inactivo, ['is_active' => false]);
        $this->candidato(['slug' => null]);                                           // sin URL pública

        $this->getJson('/api/directorio/ubicaciones')->assertOk()->assertJsonPath('departamentos', []);
    }

    public function test_ubicaciones_builds_the_tree_with_counts_only_for_enabled_places(): void
    {
        $this->candidato([], $this->sanGregorio);
        $this->candidato([], $this->sanGregorio);
        $this->candidato([], $this->sanMiguel);
        $this->candidato(['estado_publicacion' => 'borrador'], $this->trujillo);   // La Libertad NO debe aparecer

        $r = $this->getJson('/api/directorio/ubicaciones')->assertOk();

        $r->assertJsonPath('total_candidatos', 3)
          ->assertJsonPath('total_distritos', 2)
          ->assertJsonCount(1, 'departamentos')
          ->assertJsonPath('departamentos.0.nombre', 'CAJAMARCA')
          ->assertJsonPath('departamentos.0.candidatos', 3)
          ->assertJsonPath('departamentos.0.provincias.0.nombre', 'SAN MIGUEL')
          ->assertJsonPath('departamentos.0.provincias.0.candidatos', 3)
          ->assertJsonCount(2, 'departamentos.0.provincias.0.distritos')
          ->assertJsonPath('departamentos.0.provincias.0.distritos.0.nombre', 'SAN GREGORIO')
          ->assertJsonPath('departamentos.0.provincias.0.distritos.0.candidatos', 2)
          ->assertJsonPath('departamentos.0.provincias.0.distritos.1.nombre', 'SAN MIGUEL');
    }

    public function test_place_disappears_when_its_last_document_is_deleted(): void
    {
        $c = $this->candidato();
        $this->getJson('/api/directorio/ubicaciones')->assertJsonPath('total_distritos', 1);

        $c->documents()->delete();

        $this->getJson('/api/directorio/ubicaciones')->assertJsonPath('total_distritos', 0);
    }

    public function test_candidatos_can_be_filtered_by_place(): void
    {
        $sg = $this->candidato(['name' => 'Ana San Gregorio'], $this->sanGregorio);
        $this->candidato(['name' => 'Beto San Miguel'], $this->sanMiguel);
        $this->candidato(['name' => 'Carla Trujillo'], $this->trujillo);

        $this->getJson('/api/directorio/candidatos')->assertJsonCount(3, 'data');

        $this->getJson('/api/directorio/candidatos?distrito_id=' . $this->sanGregorio->id)
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', $sg->slug);

        $this->getJson('/api/directorio/candidatos?provincia_id=' . $this->sanGregorio->provincia_id)
            ->assertJsonCount(2, 'data');

        $this->getJson('/api/directorio/candidatos?departamento_id=' . $this->trujillo->departamento_id)
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Carla Trujillo');
    }

    public function test_public_responses_never_leak_private_fields(): void
    {
        $c = $this->candidato(['whatsapp_number' => '999999999', 'forbidden_topics' => ['secreto']]);

        $lista = $this->getJson('/api/directorio/candidatos')->assertOk();
        $ficha = $this->getJson("/api/directorio/candidatos/{$c->slug}")->assertOk();

        foreach ([$lista->getContent(), $ficha->getContent()] as $body) {
            $this->assertStringNotContainsString('999999999', $body);
            $this->assertStringNotContainsString('forbidden_topics', $body);
            $this->assertStringNotContainsString('TEXTO COMPLETO SECRETO', $body);
        }
        $ficha->assertJsonPath('documentos.0.title', 'Plan de Gobierno')
              ->assertJsonMissingPath('documentos.0.content');
    }

    public function test_ficha_of_an_unpublished_candidate_is_404(): void
    {
        $c = $this->candidato(['estado_publicacion' => 'borrador']);

        $this->getJson("/api/directorio/candidatos/{$c->slug}")->assertNotFound();
    }

    // ── Admin: alta manual y publicación ─────────────────────────────

    public function test_admin_endpoints_require_an_admin(): void
    {
        $this->getJson('/api/admin/directorio/candidatos')->assertUnauthorized();

        $this->actAs('editor');
        $this->getJson('/api/admin/directorio/candidatos')->assertForbidden();
    }

    public function test_admin_creates_a_draft_with_slug_location_and_free_account(): void
    {
        $this->actAs('admin');

        $r = $this->postJson('/api/admin/directorio/candidatos', [
            'name' => 'Rogelio Camilo', 'title' => 'Candidato a Alcalde', 'party' => 'Partido X',
            'distrito_id' => $this->sanGregorio->id,
        ])->assertCreated();

        $r->assertJsonPath('slug', 'rogelio-camilo-san-gregorio')
          ->assertJsonPath('location', 'San Gregorio, San Miguel, Cajamarca')
          ->assertJsonPath('estado_publicacion', 'borrador')
          ->assertJsonPath('tipo_cuenta', 'publico_gratuito')
          ->assertJsonPath('is_active', false)
          ->assertJsonPath('visible', false);

        // Mismo nombre y distrito → slug único
        $this->postJson('/api/admin/directorio/candidatos', [
            'name' => 'Rogelio Camilo', 'title' => 'Candidato a Alcalde', 'party' => 'Otro',
            'distrito_id' => $this->sanGregorio->id,
        ])->assertCreated()->assertJsonPath('slug', 'rogelio-camilo-san-gregorio-2');
    }

    public function test_admin_marks_a_profile_as_completed_and_the_badge_is_public_but_neutral(): void
    {
        $this->actAs('admin');
        $gratis  = $this->candidato(['name' => 'Aaa Gratis']);
        $cliente = $this->candidato(['name' => 'Zzz Cliente']);

        $this->putJson("/api/admin/directorio/candidatos/{$cliente->id}", ['tipo_cuenta' => 'cliente_pago'])
            ->assertOk()->assertJsonPath('tipo_cuenta', 'cliente_pago');

        $this->putJson("/api/admin/directorio/candidatos/{$cliente->id}", ['tipo_cuenta' => 'vip'])
            ->assertUnprocessable()->assertJsonValidationErrors(['tipo_cuenta']);

        $this->getJson("/api/directorio/candidatos/{$cliente->slug}")->assertOk()->assertJsonPath('perfil_completado', true);
        $this->getJson("/api/directorio/candidatos/{$gratis->slug}")->assertOk()->assertJsonPath('perfil_completado', false);

        // Neutralidad: el sello no adelanta al cliente en el listado.
        $lista = $this->getJson("/api/directorio/candidatos?distrito_id={$this->sanGregorio->id}")->assertOk()->json('data');
        $this->assertSame(['Aaa Gratis', 'Zzz Cliente'], array_column($lista, 'name'));
    }

    public function test_admin_validates_required_fields_and_distrito(): void
    {
        $this->actAs('admin');

        $this->postJson('/api/admin/directorio/candidatos', ['name' => 'Solo nombre'])
            ->assertUnprocessable()->assertJsonValidationErrors(['title', 'party', 'distrito_id']);

        $this->postJson('/api/admin/directorio/candidatos', [
            'name' => 'X', 'title' => 'Y', 'party' => 'Z', 'distrito_id' => 99999,
        ])->assertUnprocessable()->assertJsonValidationErrors(['distrito_id']);
    }

    public function test_cannot_publish_without_a_ready_document(): void
    {
        $this->actAs('admin');
        $c = $this->candidato(['estado_publicacion' => 'borrador'], null, 'pending');

        $this->postJson("/api/admin/directorio/candidatos/{$c->id}/publicar")
            ->assertUnprocessable()
            ->assertJsonPath('faltan.0', 'al menos un documento procesado (Hoja de Vida o Plan de Gobierno)');

        $this->assertSame('borrador', $c->fresh()->estado_publicacion);
    }

    public function test_publish_then_unpublish_toggles_public_visibility(): void
    {
        $this->actAs('admin');
        $c = $this->candidato(['estado_publicacion' => 'borrador']);

        $this->getJson('/api/directorio/ubicaciones')->assertJsonPath('total_distritos', 0);

        $this->postJson("/api/admin/directorio/candidatos/{$c->id}/publicar")
            ->assertOk()->assertJsonPath('visible', true);
        $this->getJson('/api/directorio/ubicaciones')->assertJsonPath('total_distritos', 1);

        $this->postJson("/api/admin/directorio/candidatos/{$c->id}/despublicar")
            ->assertOk()->assertJsonPath('visible', false);
        $this->getJson('/api/directorio/ubicaciones')->assertJsonPath('total_distritos', 0);
    }

    public function test_assigning_a_distrito_to_an_existing_profile_gives_it_a_stable_slug(): void
    {
        $this->actAs('admin');
        // Candidato preexistente de un tenant reutilizado como directorio: sin slug ni distrito.
        $c = CandidateProfile::create([
            'name' => 'Daniel Monzón', 'title' => 'Candidato', 'party' => 'P', 'location' => 'San Gregorio',
        ]);

        $this->putJson("/api/admin/directorio/candidatos/{$c->id}", ['distrito_id' => $this->sanGregorio->id])
            ->assertOk()->assertJsonPath('slug', 'daniel-monzon-san-gregorio');

        // Cambiar el nombre después NO cambia la URL pública
        $this->putJson("/api/admin/directorio/candidatos/{$c->id}", ['name' => 'Daniel R. Monzón'])
            ->assertOk()->assertJsonPath('slug', 'daniel-monzon-san-gregorio');
    }

    public function test_admin_never_changes_is_active_and_cannot_delete_an_active_candidate(): void
    {
        $this->actAs('admin');
        $activo = $this->candidato(['is_active' => true]);

        $this->putJson("/api/admin/directorio/candidatos/{$activo->id}", ['name' => 'Nuevo nombre'])->assertOk();
        $this->assertTrue($activo->fresh()->is_active);

        $this->deleteJson("/api/admin/directorio/candidatos/{$activo->id}")->assertUnprocessable();
        $this->assertNotNull(CandidateProfile::find($activo->id));
    }

    public function test_admin_list_is_ordered_by_place_and_carries_its_documents_without_rag_text(): void
    {
        $this->actAs('admin');
        $sinLugar = $this->candidato(['name' => 'Aaa Sin Lugar', 'distrito_id' => null, 'slug' => null], null, null);
        $tru      = $this->candidato(['name' => 'Bbb Trujillo'], $this->trujillo);
        $sg2      = $this->candidato(['name' => 'Zzz Gregorio'], $this->sanGregorio);
        $sg1      = $this->candidato(['name' => 'Aaa Gregorio'], $this->sanGregorio);
        $this->documento($sg1, ['title' => 'Propuestas de campaña', 'status' => 'failed', 'error_message' => 'PDF escaneado']);

        $data = $this->getJson('/api/admin/directorio/candidatos')->assertOk()->json('data');

        // Cajamarca (San Gregorio: A, Z) › La Libertad › sin distrito al final
        $this->assertSame(['Aaa Gregorio', 'Zzz Gregorio', 'Bbb Trujillo', 'Aaa Sin Lugar'], array_column($data, 'name'));
        $this->assertSame('CAJAMARCA', $data[0]['departamento']);
        $this->assertSame('SAN MIGUEL', $data[0]['provincia']);
        $this->assertSame('SAN GREGORIO', $data[0]['distrito']);

        $docs = $data[0]['documentos'];
        $this->assertSame(['Plan de Gobierno', 'Propuestas de campaña'], array_column($docs, 'title'));
        $this->assertSame('PDF escaneado', $docs[1]['error_message']);
        $this->assertArrayNotHasKey('content', $docs[0]);
        $this->assertSame([], $data[3]['documentos']);
    }

    public function test_admin_manages_the_regidores_list_and_links_their_hoja_de_vida(): void
    {
        $this->actAs('admin');
        $c    = $this->candidato(['name' => 'Daniel Monzon']);
        $otro = $this->candidato(['name' => 'Otro']);

        $r = $this->postJson("/api/admin/directorio/candidatos/{$c->id}/regidores", [
            'nombres' => ['  Ana   Pérez ', 'Luis Quispe', ''],
        ])->assertCreated();
        $this->assertSame(['Ana Pérez', 'Luis Quispe'], array_column($r->json('regidores'), 'nombre'));
        $this->assertSame([1, 2], array_column($r->json('regidores'), 'orden'));

        $this->postJson("/api/admin/directorio/candidatos/{$c->id}/regidores", ['nombre' => 'Rosa Díaz'])
            ->assertCreated()->assertJsonPath('regidores.2.orden', 3);

        $ana   = $r->json('regidores.0.id');
        $hv    = $this->documento($c, ['title' => 'Hoja de Vida — Regidor 1: Ana Pérez', 'topic' => 'hoja_de_vida']);
        $ajeno = $this->documento($otro, ['title' => 'Hoja de vida ajena']);

        $this->putJson("/api/admin/directorio/regidores/{$ana}", ['knowledge_document_id' => $ajeno->id])
            ->assertUnprocessable();
        $this->putJson("/api/admin/directorio/regidores/{$ana}", ['knowledge_document_id' => $hv->id, 'orden' => 5])
            ->assertOk()->assertJsonPath('regidores.2.knowledge_document_id', $hv->id);

        // Aparece en el listado admin
        $fila = collect($this->getJson('/api/admin/directorio/candidatos')->json('data'))->firstWhere('id', $c->id);
        $this->assertCount(3, $fila['regidores']);

        // Borrar al regidor saca su Hoja de Vida del chat (se desactiva, no se borra)
        $this->deleteJson("/api/admin/directorio/regidores/{$ana}")->assertOk()->assertJsonCount(2, 'regidores');
        $this->assertFalse((bool) $hv->fresh()->is_active);
    }

    public function test_public_ficha_lists_regidores_apart_and_never_links_their_hoja_de_vida(): void
    {
        $c  = $this->candidato(['name' => 'Daniel Monzon']);
        $hv = $this->documento($c, ['title' => 'Hoja de Vida — Regidor 1: Ana', 'topic' => 'hoja_de_vida']);
        $c->regidores()->create(['nombre' => 'Ana', 'orden' => 1, 'knowledge_document_id' => $hv->id]);
        $c->regidores()->create(['nombre' => 'Luis', 'orden' => 2]);

        $r = $this->getJson("/api/directorio/candidatos/{$c->slug}")->assertOk();

        $this->assertSame(['Plan de Gobierno'], array_column($r->json('documentos'), 'title'));
        $this->assertSame(['Ana', 'Luis'], array_column($r->json('regidores'), 'nombre'));
        $this->assertTrue($r->json('regidores.0.hoja_de_vida'));
        $this->assertFalse($r->json('regidores.1.hoja_de_vida'));
        $this->assertStringNotContainsString('knowledge_document_id', $r->getContent());
    }

    public function test_deleting_a_candidate_orphans_its_documents_instead_of_deleting_them(): void
    {
        $this->actAs('admin');
        $c   = $this->candidato();
        $doc = $c->documents()->first();

        $this->deleteJson("/api/admin/directorio/candidatos/{$c->id}")->assertOk();

        $this->assertNull(CandidateProfile::find($c->id));
        $this->assertNull($doc->fresh()->candidate_id);
    }

    public function test_admin_list_reports_readiness(): void
    {
        $this->actAs('admin');
        $this->candidato(['estado_publicacion' => 'borrador'], null, 'processing');

        $this->getJson('/api/admin/directorio/candidatos')
            ->assertOk()
            ->assertJsonPath('data.0.documentos_total', 1)
            ->assertJsonPath('data.0.documentos_listos', 0)
            ->assertJsonPath('data.0.documentos_procesando', 1)
            ->assertJsonPath('data.0.documentos_fallidos', 0)
            ->assertJsonPath('data.0.visible', false);
    }

    // ── Ubigeo (dropdowns en cascada) ────────────────────────────────

    public function test_ubigeo_cascade_endpoints(): void
    {
        $this->getJson('/api/ubigeo/departamentos')->assertOk()->assertJsonCount(2)
            ->assertJsonPath('0.nombre', 'CAJAMARCA');

        $this->getJson('/api/ubigeo/provincias?departamento_id=' . $this->sanGregorio->departamento_id)
            ->assertOk()->assertJsonCount(1)->assertJsonPath('0.nombre', 'SAN MIGUEL');

        $this->getJson('/api/ubigeo/distritos?provincia_id=' . $this->sanGregorio->provincia_id)
            ->assertOk()->assertJsonCount(2)->assertJsonPath('0.nombre', 'SAN GREGORIO');

        $this->getJson('/api/ubigeo/provincias')->assertUnprocessable();
    }

    // ── Chat acotado por candidato (chips de candidatos) ─────────────

    public function test_rag_search_can_be_scoped_to_one_candidate(): void
    {
        $ana  = $this->candidato(['name' => 'Ana', 'slug' => 'ana'], null, null);
        $luis = $this->candidato(['name' => 'Luis', 'slug' => 'luis'], null, null);
        $this->documento($ana,  ['title' => 'Plan Ana',  'content' => 'Ana propone un canal de riego para los agricultores.']);
        $this->documento($luis, ['title' => 'Plan Luis', 'content' => 'Luis propone riego tecnificado y reservorios.']);

        $svc = new \App\Services\MySQLFulltextEmbeddings();

        // Sin acotar: FULLTEXT no existe en SQLite → cae al LIKE de respaldo y trae a ambos.
        $todos = collect($svc->search('riego agricultores', 5))->pluck('title')->all();
        $this->assertEqualsCanonicalizing(['Plan Ana', 'Plan Luis'], $todos);

        // Acotado: solo los documentos de Luis.
        $luisSolo = collect($svc->search('riego agricultores', 5, ['candidate_id' => $luis->id]))->pluck('title')->all();
        $this->assertSame(['Plan Luis'], $luisSolo);
    }

    public function test_rag_understands_desague_as_sanitation_vocabulary(): void
    {
        $c = $this->candidato(['name' => 'Daniel', 'slug' => 'daniel'], null, null);
        $this->documento($c, [
            'title'   => 'Propuestas de campaña — Daniel',
            'content' => 'SALUD Y BIENESTAR',
            'pages'   => [
                'AGRICULTURA. Construcción de mini reservorios y riego tecnificado.',
                'SALUD. Gestionar la instalación de biodigestores para toda la población que lo requiera.',
            ],
        ]);

        $out = (new \App\Services\MySQLFulltextEmbeddings())->search('¿desagüe?', 3, ['candidate_id' => $c->id]);

        $this->assertNotEmpty($out, 'Una pregunta por "desagüe" debe encontrar la propuesta de biodigestores');
        $this->assertSame(2, $out[0]['page']);
        $this->assertStringContainsString('biodigestores', $out[0]['excerpt']);
    }

    public function test_general_question_about_proposals_serves_content_pages_not_covers_or_hoja_de_vida(): void
    {
        $c = $this->candidato(['name' => 'Daniel', 'slug' => 'daniel'], null, null);
        $relleno = str_repeat(' Mejorar los servicios del distrito para todas las familias.', 8);
        $this->documento($c, [
            'title' => 'Hoja de Vida — Daniel', 'topic' => 'hoja_de_vida', 'content' => 'x',
            'pages' => ['FORMATO UNICO DE DECLARACION JURADA DE HOJA DE VIDA. DATOS PERSONALES' . $relleno],
        ]);
        $this->documento($c, [
            'title' => 'Propuestas de campaña — Daniel', 'content' => 'x',
            'pages' => [
                'PROPUESTAS MUNICIPALES San Gregorio. 1. AGRICULTURA 2. SALUD',
                'AGRICULTURA Y MEDIO AMBIENTE. Construcción de mini reservorios. Riego tecnificado.' . $relleno,
                'SALUD. Gestionar la instalación de biodigestores. Contratación de enfermeras.' . $relleno,
            ],
        ]);

        $svc = new \App\Services\MySQLFulltextEmbeddings();
        foreach (['tus propuestas', '¿qué propone?', 'propuestas'] as $q) {
            $out = $svc->search($q, 3, ['candidate_id' => $c->id]);
            $this->assertNotEmpty($out, $q);
            $titles = array_column($out, 'title');
            $this->assertNotContains('Hoja de Vida — Daniel', $titles, "{$q}: la HV no responde por propuestas");
            $pages = array_column($out, 'page');
            $this->assertNotContains(1, $pages, "{$q}: la portada no trae propuestas");
            $this->assertStringContainsString('reservorios', implode(' ', array_column($out, 'excerpt')), $q);
        }

        // "¿quién es?" sí debe traer la hoja de vida.
        $quien = array_column($svc->search('¿quién es?', 3, ['candidate_id' => $c->id]), 'title');
        $this->assertContains('Hoja de Vida — Daniel', $quien);
    }

    public function test_quien_es_reads_the_whole_hoja_de_vida_and_the_ficha_fixes_the_cargo(): void
    {
        $c = $this->candidato(['name' => 'Daniel', 'slug' => 'daniel', 'title' => 'Candidato a Alcalde Distrital', 'party' => 'Avanza Pais'], null, null);
        $relleno = str_repeat(' texto del formato del JNE.', 12);
        $this->documento($c, [
            'title' => 'Hoja de Vida — Daniel', 'topic' => 'hoja_de_vida', 'content' => 'x',
            'pages' => [
                'DATOS PERSONALES. CARGO AL QUE POSTULA ALCALDE DISTRITAL REGIDOR PROVINCIAL REGIDOR DISTRITAL' . $relleno,
                'CARGOS DE ELECCION POPULAR REGIDOR(A) DISTRITAL FRENTE REGIONAL DE CAJAMARCA DESDE 2022 HASTA 2026' . $relleno,
                'FECHA EN QUE TERMINO DE LLENAR LOS DATOS' . $relleno,
            ],
        ]);
        $this->documento($c, [
            'title' => 'Plan de Gobierno — Daniel', 'topic' => 'plan_de_gobierno', 'content' => 'x',
            'pages' => ['Diagnostico del distrito' . $relleno, 'Propuestas de riego' . $relleno],
        ]);

        $out = (new \App\Services\MySQLFulltextEmbeddings())->search('¿quién es?', 3, ['candidate_id' => $c->id]);
        $hvPages = array_column(array_filter($out, fn ($e) => $e['title'] === 'Hoja de Vida — Daniel'), 'page');
        $this->assertContains(2, $hvPages, 'La página 2 (cargos de elección) debe llegar al modelo');

        // La ficha le dice al modelo el cargo real, no la lista de casillas.
        $ai = new \App\Services\CivicAIService(new \App\Services\MySQLFulltextEmbeddings());
        $ai->scopeToCandidate($c->fresh());
        $m = new \ReflectionMethod($ai, 'fichaCandidato');
        $m->setAccessible(true);
        $ficha = $m->invoke($ai);
        $this->assertStringContainsString('Postula a: Candidato a Alcalde Distrital', $ficha);
        $this->assertStringContainsString('casillas', $ficha);
    }

    public function test_casillas_block_always_reaches_the_model_even_if_the_window_is_mid_page(): void
    {
        $c = $this->candidato(['name' => 'Daniel', 'slug' => 'daniel'], null, null);
        $bloque = \App\Services\PdfPageExtractor::bloqueCasillas([
            'EDUCACIÓN BÁSICA REGULAR — ¿CUENTA CON ESTUDIOS SECUNDARIOS?: SÍ',
            'CARGOS DE ELECCIÓN POPULAR — CARGO 1: REGIDOR(A) DISTRITAL',
        ]);
        $this->documento($c, [
            'title' => 'Hoja de Vida — Daniel', 'topic' => 'hoja_de_vida', 'content' => 'x',
            'pages' => [$bloque . "\n" . str_repeat('texto de relleno del formato. ', 300) . ' III. FORMACIÓN ACADÉMICA estudios secundarios'],
        ]);

        $out = (new \App\Services\MySQLFulltextEmbeddings())->search('¿qué estudios tiene?', 3, ['candidate_id' => $c->id]);

        $this->assertNotEmpty($out);
        $this->assertStringStartsWith('CASILLAS MARCADAS EN ESTA PÁGINA', $out[0]['excerpt']);
        $this->assertStringContainsString('SECUNDARIOS?: SÍ', $out[0]['excerpt']);
        $this->assertStringContainsString('FORMACIÓN ACADÉMICA', $out[0]['excerpt'], 'y además la ventana relevante');
    }

    public function test_regional_and_provincial_candidates_reach_every_voter_below_them(): void
    {
        $this->actAs('admin');
        $caj = $this->sanGregorio->departamento_id;
        $sm  = $this->sanGregorio->provincia_id;

        // Alta: gobernador (solo departamento) y alcalde provincial (hasta provincia).
        $gob = $this->postJson('/api/admin/directorio/candidatos', [
            'name' => 'Gobernador Uno', 'title' => 'Candidato a Gobernador Regional', 'party' => 'P', 'departamento_id' => $caj,
        ])->assertCreated()
          ->assertJsonPath('ambito', 'regional')
          ->assertJsonPath('distrito_id', null)
          ->assertJsonPath('location', 'Cajamarca')
          ->assertJsonPath('slug', 'gobernador-uno-cajamarca');

        $prov = $this->postJson('/api/admin/directorio/candidatos', [
            'name' => 'Alcalde Prov', 'title' => 'Candidato a Alcalde Provincial', 'party' => 'P', 'provincia_id' => $sm,
        ])->assertCreated()
          ->assertJsonPath('ambito', 'provincial')
          ->assertJsonPath('departamento_id', $caj)
          ->assertJsonPath('location', 'San Miguel, Cajamarca');

        foreach ([$gob->json('id'), $prov->json('id')] as $id) {
            $this->documento(CandidateProfile::find($id));
            $this->postJson("/api/admin/directorio/candidatos/{$id}/publicar")->assertOk()->assertJsonPath('visible', true);
        }
        $this->candidato(['name' => 'Distrital SG'], $this->sanGregorio);
        $this->candidato(['name' => 'Distrital Trujillo'], $this->trujillo);

        $nombres = fn (array $f) => array_column($this->getJson('/api/directorio/candidatos?' . http_build_query($f))->json('data'), 'name');

        // Quien vota en San Gregorio ve a su alcalde distrital, al provincial y al gobernador.
        $this->assertEqualsCanonicalizing(['Alcalde Prov', 'Distrital SG', 'Gobernador Uno'], $nombres(['distrito_id' => $this->sanGregorio->id]));
        // En San Miguel distrito (misma provincia) no aparece el distrital de San Gregorio.
        $this->assertEqualsCanonicalizing(['Alcalde Prov', 'Gobernador Uno'], $nombres(['distrito_id' => $this->sanMiguel->id]));
        // En Trujillo (otra región) ninguno de Cajamarca.
        $this->assertSame(['Distrital Trujillo'], $nombres(['distrito_id' => $this->trujillo->id]));
        // Elegir solo la región muestra todo lo de la región.
        $this->assertEqualsCanonicalizing(['Alcalde Prov', 'Distrital SG', 'Gobernador Uno'], $nombres(['departamento_id' => $caj]));

        // El árbol de la home marca la región y la provincia aunque no haya distrito.
        $cajNodo = collect($this->getJson('/api/directorio/ubicaciones')->json('departamentos'))->firstWhere('nombre', 'CAJAMARCA');
        $this->assertSame(1, $cajNodo['regionales']);
        $this->assertSame(3, $cajNodo['candidatos']);
        $this->assertSame(1, $cajNodo['provincias'][0]['provinciales']);
    }

    private function scopeOf(\App\Services\CivicAIService $ai): array
    {
        $r = new \ReflectionObject($ai);
        $id = $r->getProperty('scopeCandidateId');   $id->setAccessible(true);
        $nm = $r->getProperty('scopeCandidateName'); $nm->setAccessible(true);

        return [$id->getValue($ai), $nm->getValue($ai)];
    }

    private function applyScope(string $slug): array
    {
        $ai = new \App\Services\CivicAIService(new \App\Services\MySQLFulltextEmbeddings());
        $controller = new \App\Http\Controllers\ChatController($ai);
        $m = new \ReflectionMethod($controller, 'applyCandidateScope');
        $m->setAccessible(true);
        $m->invoke($controller, $slug);

        return $this->scopeOf($ai);
    }

    public function test_chat_scope_accepts_only_candidates_visible_in_the_directory(): void
    {
        $visible = $this->candidato(['name' => 'Visible', 'slug' => 'visible']);
        $this->candidato(['name' => 'Borrador', 'slug' => 'borrador', 'estado_publicacion' => 'borrador']);
        $this->candidato(['name' => 'Sin doc', 'slug' => 'sin-doc'], null, null);

        $this->assertSame([$visible->id, 'Visible'], $this->applyScope('visible'));
        $this->assertSame([null, null], $this->applyScope('borrador'));
        $this->assertSame([null, null], $this->applyScope('sin-doc'));
        $this->assertSame([null, null], $this->applyScope('no-existe'));
    }
}
