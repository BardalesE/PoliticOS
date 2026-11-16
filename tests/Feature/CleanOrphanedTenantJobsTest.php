<?php

namespace Tests\Feature;

use App\Models\Tenant;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Punto 7: limpieza, en el arranque, de los jobs que quedaron huérfanos en la
 * tabla `jobs` (y job_batches/failed_jobs) de cada BD de tenant por el bug de
 * config/queue.php (la cola usaba 'mysql' en vez de 'central').
 */
class CleanOrphanedTenantJobsTest extends TestCase
{
    private string $tenantDbFile;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantDbFile = tempnam(sys_get_temp_dir(), 'pepa_orphans_');

        config([
            // 'mysql' (no 'central') es la conexión por defecto real de la app
            // (ver .env / config/database.php): TenantContext::run solo
            // reapunta 'mysql', así que los DB::table()/Schema sin conexión
            // explícita deben resolver ahí para replicar el comportamiento real.
            'database.default'             => 'mysql',
            'database.connections.central' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true],
            'database.connections.mysql'   => ['driver' => 'sqlite', 'database' => $this->tenantDbFile, 'prefix' => '', 'foreign_key_constraints' => true],
        ]);
        DB::purge('central');
        DB::purge('mysql');

        Schema::connection('central')->create('tenants', function (Blueprint $t) {
            $t->id();
            $t->string('slug')->unique();
            $t->string('name')->default('Tenant de prueba');
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

        foreach (['jobs', 'job_batches', 'failed_jobs'] as $table) {
            // Mismo shape da igual para el test — solo nos importa count()/truncate().
            Schema::connection('mysql')->create($table, function (Blueprint $t) {
                $t->id();
                $t->string('payload')->nullable();
            });
        }

        // db_host no-null: TenantContext::run() siempre escribe
        // 'database.connections.mysql.host', y Laravel's ConnectionFactory
        // trata un 'host' presente-pero-null como "sin hosts" y revienta
        // (createPdoResolverWithHosts) incluso para el driver sqlite, que
        // de por sí ignora 'host'. Con un valor no-null evitamos ese camino.
        Tenant::create(['slug' => 'acme', 'name' => 'Acme', 'db_name' => $this->tenantDbFile, 'db_host' => 'sqlite-host', 'is_active' => true]);
    }

    protected function tearDown(): void
    {
        @unlink($this->tenantDbFile);
        parent::tearDown();
    }

    public function test_removes_orphaned_rows_from_every_queue_table_in_the_tenant_db(): void
    {
        DB::connection('mysql')->table('jobs')->insert(['payload' => 'huerfano-1']);
        DB::connection('mysql')->table('jobs')->insert(['payload' => 'huerfano-2']);
        DB::connection('mysql')->table('job_batches')->insert(['payload' => 'batch-huerfano']);
        DB::connection('mysql')->table('failed_jobs')->insert(['payload' => 'failed-huerfano']);

        $this->artisan('queue:clean-tenant-orphans')->assertExitCode(0);

        $this->assertSame(0, DB::connection('mysql')->table('jobs')->count());
        $this->assertSame(0, DB::connection('mysql')->table('job_batches')->count());
        $this->assertSame(0, DB::connection('mysql')->table('failed_jobs')->count());
    }

    public function test_dry_run_counts_but_does_not_delete(): void
    {
        DB::connection('mysql')->table('jobs')->insert(['payload' => 'huerfano']);

        $this->artisan('queue:clean-tenant-orphans', ['--dry-run' => true])->assertExitCode(0);

        $this->assertSame(1, DB::connection('mysql')->table('jobs')->count());
    }

    public function test_is_a_no_op_when_there_is_nothing_orphaned(): void
    {
        $this->artisan('queue:clean-tenant-orphans')->assertExitCode(0);

        $this->assertSame(0, DB::connection('mysql')->table('jobs')->count());
    }
}
