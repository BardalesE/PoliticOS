<?php

namespace App\Console\Commands;

use App\Services\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

/**
 * Corre las migraciones pendientes en la base de datos de CADA tenant activo.
 *
 * El `php artisan migrate` normal solo cubre el schema por defecto/central:
 * las BDs de los tenants (registradas en la tabla `tenants` de la conexión
 * central) quedan fuera y hay que migrarlas una por una vía TenantContext.
 * Este comando cierra ese gap — el entrypoint de Render lo ejecuta en cada
 * arranque (idempotente), y en local se corre a mano tras crear una migración.
 *
 * Uso:
 *   php artisan tenant:migrate --force
 */
class TenantMigrate extends Command
{
    protected $signature = 'tenant:migrate
        {--force : Ejecutar en producción sin confirmación (igual que migrate --force)}';

    protected $description = 'Ejecuta php artisan migrate en la BD de cada tenant activo (vía TenantContext).';

    public function handle(): int
    {
        $exit = self::SUCCESS;

        TenantContext::forEachTenant(function (?string $slug) use (&$exit) {
            if ($slug === null) {
                // Instalación single-tenant sin registry: la BD por defecto ya
                // la cubre el `migrate` normal, aquí no hay nada que hacer.
                $this->info('Sin tenants registrados — solo existe la BD por defecto.');
                return;
            }

            $this->info("── Tenant: {$slug}");
            TenantContext::run($slug, function () use ($slug, &$exit) {
                try {
                    Artisan::call(
                        'migrate',
                        ['--force' => (bool) $this->option('force')],
                        $this->output
                    );
                } catch (\Throwable $e) {
                    // No abortar el loop: los demás tenants deben migrarse igual.
                    $this->error("Tenant {$slug}: {$e->getMessage()}");
                    $exit = self::FAILURE;
                }
            });
        });

        return $exit;
    }
}
