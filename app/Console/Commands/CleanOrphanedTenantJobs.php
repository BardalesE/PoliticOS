<?php

namespace App\Console\Commands;

use App\Services\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Borra filas huérfanas en `jobs`/`job_batches`/`failed_jobs` de cada BD de
 * tenant.
 *
 * Antes del fix de config/queue.php, la cola 'database' usaba la conexión
 * 'mysql' (que TenantContext::run/ResolveTenant reapuntan a la BD del tenant
 * en curso) en vez de 'central' fija: un job despachado dentro de un tenant
 * terminaba insertado en la tabla `jobs` de ESA BD, pero el worker de cola
 * (que corre fuera de cualquier contexto de tenant) solo lee la tabla `jobs`
 * de `central`. Esos jobs quedaron huérfanos — nunca los va a tomar nadie.
 *
 * Idempotente: tras correr una vez (y con el fix ya desplegado) no debería
 * encontrar nada en los arranques siguientes. No toca la BD central/por
 * defecto (ahí la cola sí funciona).
 */
class CleanOrphanedTenantJobs extends Command
{
    protected $signature = 'queue:clean-tenant-orphans
        {--dry-run : Solo contar filas huérfanas, sin borrarlas}';

    protected $description = 'Borra jobs/job_batches/failed_jobs huérfanos en la BD de cada tenant (ver config/queue.php).';

    private const TABLES = ['jobs', 'job_batches', 'failed_jobs'];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $total  = 0;

        TenantContext::forEachTenant(function (?string $slug) use ($dryRun, &$total) {
            // Instalación single-tenant: no hay BD de tenant separada de la
            // que lee el worker, así que no hay nada "huérfano" que limpiar.
            if ($slug === null) {
                return;
            }

            TenantContext::run($slug, function () use ($slug, $dryRun, &$total) {
                $found = [];
                foreach (self::TABLES as $table) {
                    if (!Schema::hasTable($table)) {
                        continue;
                    }
                    $count = DB::table($table)->count();
                    if ($count > 0) {
                        $found[$table] = $count;
                    }
                }

                if (empty($found)) {
                    return;
                }

                $label = $dryRun ? 'encontrado(s)' : 'eliminado(s)';
                foreach ($found as $table => $count) {
                    $this->line("  {$slug}.{$table}: {$count} fila(s) {$label}");
                    if (!$dryRun) {
                        DB::table($table)->truncate();
                    }
                }
                $total += array_sum($found);
            });
        });

        $this->info($dryRun
            ? "Total huérfanos encontrados: {$total}"
            : "Total huérfanos eliminados: {$total}");

        return self::SUCCESS;
    }
}
