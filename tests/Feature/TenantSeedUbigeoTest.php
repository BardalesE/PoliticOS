<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * tenant:seed-ubigeo --here: siembra el INEI en la BD activa, es idempotente y
 * falla con un mensaje claro si faltan las tablas. (La ruta por slug reutiliza
 * TenantContext::run, que ya cubre MySQL en producción; aquí se prueba el núcleo.)
 */
class TenantSeedUbigeoTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.tenant_slug' => null,
            'database.default' => 'sqlite',
            'database.connections.sqlite' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true,
            ],
        ]);
        DB::purge('sqlite');
    }

    private function migrateUbigeo(): void
    {
        foreach ([
            '2026_09_16_000001_create_ubigeo_departamentos_table',
            '2026_09_16_000002_create_ubigeo_provincias_table',
            '2026_09_16_000003_create_ubigeo_distritos_table',
        ] as $migration) {
            (require database_path("migrations/{$migration}.php"))->up();
        }
    }

    public function test_seeds_the_full_catalog_and_second_run_is_a_noop(): void
    {
        $this->migrateUbigeo();

        $this->artisan('tenant:seed-ubigeo', ['--here' => true])->assertExitCode(0);

        $this->assertSame(25, DB::table('ubigeo_departamentos')->count());
        $this->assertGreaterThan(1800, DB::table('ubigeo_distritos')->count());

        $distritos = DB::table('ubigeo_distritos')->count();

        // Segundo arranque de Render: no duplica ni falla por PK.
        $this->artisan('tenant:seed-ubigeo', ['--here' => true])
            ->expectsOutputToContain('ya cargado')
            ->assertExitCode(0);
        $this->assertSame($distritos, DB::table('ubigeo_distritos')->count());
    }

    public function test_fails_clearly_when_the_tables_are_missing(): void
    {
        $this->assertFalse(Schema::hasTable('ubigeo_distritos'));

        $this->artisan('tenant:seed-ubigeo', ['--here' => true])
            ->expectsOutputToContain('tenant:migrate')
            ->assertExitCode(1);
    }

    public function test_requires_a_slug_or_here(): void
    {
        $this->artisan('tenant:seed-ubigeo')->assertExitCode(1);
    }
}
