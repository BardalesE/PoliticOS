<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\TenantContext;
use Illuminate\Bus\Batchable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * La cola 'database' (y batching/failed_jobs) debe usar SIEMPRE la conexión
 * 'central', nunca 'mysql': TenantContext::run / ResolveTenant reapuntan
 * 'mysql' a la BD del tenant en curso, y el worker de cola (que corre fuera
 * de cualquier contexto de tenant) solo lee `central.jobs`. Antes del fix de
 * config/queue.php, un job despachado dentro de un tenant quedaba insertado
 * en la BD de ESE tenant y nunca lo procesaba nadie.
 *
 * Cola real (QUEUE_CONNECTION=database), sin sync ni Bus::fake: se dispara
 * un worker de verdad (Worker::runNextJob) contra tablas SQLite reales.
 */
class TenantAwareQueueCentralTest extends TestCase
{
    private string $tenantDbFile;

    protected function setUp(): void
    {
        parent::setUp();

        // Archivo real (no ':memory:') para que el purge/reconnect que hace
        // TenantContext::run al entrar y salir conserve los datos — igual que
        // un servidor MySQL real, a diferencia de un ':memory:' que se reinicia
        // en cada reconexión.
        $this->tenantDbFile = tempnam(sys_get_temp_dir(), 'pepa_tenant_db_');

        config([
            'database.default'              => 'central',
            'database.connections.central'  => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true],
            'database.connections.mysql'    => ['driver' => 'sqlite', 'database' => $this->tenantDbFile, 'prefix' => '', 'foreign_key_constraints' => true],
            'queue.default'                          => 'database',
            'queue.connections.database.connection'  => 'central',
            'queue.connections.database.table'       => 'jobs',
            'queue.connections.database.queue'       => 'default',
            'queue.connections.database.retry_after' => 60,
            'queue.batching.database'                => 'central',
            'queue.batching.table'                   => 'job_batches',
            'queue.failed.database'                  => 'central',
            'queue.failed.table'                     => 'failed_jobs',
        ]);
        DB::purge('central');
        DB::purge('mysql');

        $this->createQueueTables('central');
        $this->createQueueTables('mysql');

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

        Schema::connection('mysql')->create('markers', function (Blueprint $t) {
            $t->id();
            $t->string('value');
        });

        // El callback then() de un batch viaja serializado (job_batches.options)
        // y se reconstituye en una invocación aparte: una variable PHP capturada
        // por referencia (use (&$x)) no sobrevive esa ida y vuelta (se vuelve
        // una copia por valor). Para observar que el callback corrió de verdad
        // hace falta un efecto en la BD, no una variable local del test.
        Schema::connection('central')->create('then_marker', function (Blueprint $t) {
            $t->id();
            $t->string('note');
        });

        Tenant::create([
            'slug'      => 'acme',
            'name'      => 'Acme',
            'db_name'   => $this->tenantDbFile,
            // No-null: TenantContext::run() siempre escribe
            // 'database.connections.mysql.host', y un 'host' presente-pero-null
            // hace que Laravel lo trate como "sin hosts" y reviente
            // (ConnectionFactory::parseHosts) incluso con driver sqlite, que
            // de por sí ignora 'host'/'port'/'username'/'password'.
            'db_host'   => 'sqlite-host',
            'is_active' => true,
        ]);
    }

    protected function tearDown(): void
    {
        @unlink($this->tenantDbFile);
        parent::tearDown();
    }

    private function createQueueTables(string $connection): void
    {
        Schema::connection($connection)->create('jobs', function (Blueprint $t) {
            $t->id();
            $t->string('queue')->index();
            $t->longText('payload');
            $t->unsignedTinyInteger('attempts');
            $t->unsignedInteger('reserved_at')->nullable();
            $t->unsignedInteger('available_at');
            $t->unsignedInteger('created_at');
        });
        Schema::connection($connection)->create('job_batches', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->string('name');
            $t->integer('total_jobs');
            $t->integer('pending_jobs');
            $t->integer('failed_jobs');
            $t->longText('failed_job_ids');
            $t->mediumText('options')->nullable();
            $t->integer('cancelled_at')->nullable();
            $t->integer('created_at');
            $t->integer('finished_at')->nullable();
        });
        Schema::connection($connection)->create('failed_jobs', function (Blueprint $t) {
            $t->id();
            $t->string('uuid')->unique();
            $t->text('connection');
            $t->text('queue');
            $t->longText('payload');
            $t->longText('exception');
            $t->timestamp('failed_at')->useCurrent();
        });
    }

    /** Procesa un job real con el Worker de Laravel (sin loop infinito, sin sleep). */
    private function runWorkerOnce(): void
    {
        /** @var \Illuminate\Queue\Worker $worker */
        $worker = app('queue.worker');
        $worker->runNextJob('database', 'default', new WorkerOptions(maxTries: 3, timeout: 0, sleep: 0));
    }

    private function drainQueue(int $max = 25): void
    {
        for ($i = 0; $i < $max; $i++) {
            if (DB::connection('central')->table('jobs')->count() === 0) {
                return;
            }
            $this->runWorkerOnce();
        }
    }

    public function test_job_dispatched_inside_a_tenant_lands_in_central_jobs_not_in_the_tenant_db(): void
    {
        TenantContext::run('acme', function () {
            TenantMarkerJob::dispatch('acme', 'hola');
        });

        $this->assertSame(1, DB::connection('central')->table('jobs')->count());
        $this->assertSame(0, DB::connection('mysql')->table('jobs')->count());
    }

    public function test_bus_batch_dispatched_inside_a_tenant_registers_in_central_and_runs_its_callbacks(): void
    {
        TenantContext::run('acme', function () {
            Bus::batch([
                new TenantMarkerJob('acme', 'uno'),
                new TenantMarkerJob('acme', 'dos'),
            ])
                ->then(function () {
                    DB::connection('central')->table('then_marker')->insert(['note' => 'ok']);
                })
                ->dispatch();
        });

        $this->assertSame(1, DB::connection('central')->table('job_batches')->count());
        $this->assertSame(0, DB::connection('mysql')->table('job_batches')->count());

        $this->drainQueue();

        $this->assertSame(1, DB::connection('central')->table('then_marker')->count(), 'el callback then() del batch no corrió');
        $this->assertSame(2, DB::connection('mysql')->table('markers')->count());
    }

    public function test_the_worker_processes_the_job_and_it_writes_to_the_correct_tenant_db(): void
    {
        TenantContext::run('acme', function () {
            TenantMarkerJob::dispatch('acme', 'desde-el-worker');
        });

        $this->assertSame(0, DB::connection('mysql')->table('markers')->count());

        $this->drainQueue();

        $this->assertSame(1, DB::connection('mysql')->table('markers')->count());
        $this->assertSame('desde-el-worker', DB::connection('mysql')->table('markers')->value('value'));
    }
}

/**
 * Job mínimo que replica el patrón real (ProcessKnowledgeDocumentJob,
 * MapDocumentChunkJob, etc.): captura el slug del tenant y envuelve su
 * trabajo en TenantContext::run() dentro de handle().
 */
class TenantMarkerJob implements ShouldQueue
{
    use Batchable, Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public string $tenantSlug, public string $value) {}

    public function handle(): void
    {
        TenantContext::run($this->tenantSlug, function () {
            DB::connection('mysql')->table('markers')->insert(['value' => $this->value]);
        });
    }
}
