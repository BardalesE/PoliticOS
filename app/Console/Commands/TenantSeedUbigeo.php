<?php

namespace App\Console\Commands;

use App\Services\TenantContext;
use Database\Seeders\UbigeoSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Siembra el catálogo de ubigeo (departamentos/provincias/distritos del INEI)
 * en la BD de uno o varios tenants. Es la tabla que usa el selector en cascada
 * de /admin/directorio y el filtro por lugar de la home pública.
 *
 * IDEMPOTENTE: si el tenant ya tiene departamentos cargados no toca nada, así
 * que es seguro dejarlo en el entrypoint de Render en cada arranque.
 *
 * Uso:
 *   php artisan tenant:seed-ubigeo politicosperu          # un tenant
 *   php artisan tenant:seed-ubigeo politicosperu otro     # varios
 *   php artisan tenant:seed-ubigeo --here                 # BD por defecto (single-tenant / local)
 */
class TenantSeedUbigeo extends Command
{
    protected $signature = 'tenant:seed-ubigeo
        {slugs?* : Slugs de los tenants a sembrar}
        {--here : Sembrar la BD por defecto en vez de un tenant}';

    protected $description = 'Siembra el ubigeo (INEI) en la BD de los tenants indicados. Idempotente.';

    public function handle(): int
    {
        if ($this->option('here')) {
            return $this->seedCurrent('(BD por defecto)') ? self::SUCCESS : self::FAILURE;
        }

        $slugs = array_filter((array) $this->argument('slugs'));
        if (! $slugs) {
            $this->error('Indica al menos un slug de tenant, o usa --here.');
            return self::FAILURE;
        }

        $exit = self::SUCCESS;
        foreach ($slugs as $slug) {
            $ran = false;
            try {
                TenantContext::run($slug, function () use ($slug, &$ran, &$exit) {
                    $ran = true;
                    if (! $this->seedCurrent($slug)) {
                        $exit = self::FAILURE;
                    }
                });
            } catch (\Throwable $e) {
                $this->error("Tenant {$slug}: {$e->getMessage()}");
                $exit = self::FAILURE;
                continue;
            }

            if (! $ran) {
                $this->error("Tenant {$slug}: no existe o está inactivo.");
                $exit = self::FAILURE;
            }
        }

        return $exit;
    }

    /** Siembra la conexión activa. false si falta la tabla o el seeder falla. */
    private function seedCurrent(string $label): bool
    {
        if (! Schema::hasTable('ubigeo_distritos')) {
            $this->error("{$label}: faltan las tablas de ubigeo — corre tenant:migrate primero.");
            return false;
        }

        $existing = DB::table('ubigeo_departamentos')->count();
        if ($existing > 0) {
            $this->info("{$label}: ubigeo ya cargado ({$existing} departamentos) — nada que hacer.");
            return true;
        }

        try {
            $seeder = new UbigeoSeeder();
            $seeder->setCommand($this);
            $seeder->run();
        } catch (\Throwable $e) {
            $this->error("{$label}: {$e->getMessage()}");
            return false;
        }

        return true;
    }
}
