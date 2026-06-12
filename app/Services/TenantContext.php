<?php

namespace App\Services;

use App\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Contexto de tenant fuera del ciclo HTTP (workers de cola, scheduler).
 *
 * ResolveTenant cambia la conexión MySQL por request, pero un job que corre
 * en `queue:work` o en el scheduler usa la DB por defecto. Este helper
 * replica ese cambio de conexión para procesos sin request:
 *
 *   - Los jobs capturan el slug en su constructor (TenantContext::currentSlug())
 *     y envuelven su handle() en TenantContext::run($slug, fn).
 *   - El scheduler itera tenants activos con TenantContext::forEachTenant().
 */
class TenantContext
{
    /** Slug del tenant activo en este proceso (null = DB por defecto). */
    public static function currentSlug(): ?string
    {
        return app()->bound('tenant') ? app('tenant')?->slug : null;
    }

    /**
     * Clave de caché aislada por tenant. Sin esto, con un store compartido
     * (Redis/database) los datos cacheados de un tenant se servirían a otro.
     */
    public static function cacheKey(string $key): string
    {
        return 'tenant:' . (self::currentSlug() ?? 'default') . ':' . $key;
    }

    /**
     * Ejecuta $callback con la conexión `mysql` apuntando a la DB del tenant
     * y el binding app('tenant') activo. Con slug null ejecuta sobre la DB
     * por defecto sin tocar nada. Restaura siempre el estado original.
     */
    public static function run(?string $slug, callable $callback): mixed
    {
        if (!$slug) {
            return $callback();
        }

        $tenant = Tenant::findBySlug($slug);
        if (!$tenant) {
            Log::warning('TenantContext: tenant no encontrado o inactivo, job omitido', ['slug' => $slug]);
            return null;
        }

        $originalConfig  = config('database.connections.mysql');
        $previousBinding = app()->bound('tenant') ? app('tenant') : null;

        config([
            'database.connections.mysql.database' => $tenant->db_name,
            'database.connections.mysql.host'     => $tenant->db_host,
            'database.connections.mysql.port'     => $tenant->db_port,
            'database.connections.mysql.username' => $tenant->db_user,
            'database.connections.mysql.password' => $tenant->db_password ?? '',
        ]);
        DB::purge('mysql');
        DB::reconnect('mysql');
        app()->instance('tenant', $tenant);

        try {
            return $callback();
        } finally {
            config(['database.connections.mysql' => $originalConfig]);
            DB::purge('mysql');
            app()->instance('tenant', $previousBinding);
        }
    }

    /**
     * Invoca $callback(?string $slug) una vez por cada tenant activo.
     * Sin tenants registrados (instalación single-tenant) invoca una sola
     * vez con null para operar sobre la DB por defecto.
     *
     * El callback decide si despacha un job (que internamente usa run())
     * o ejecuta inline envolviendo en TenantContext::run($slug, ...).
     */
    public static function forEachTenant(callable $callback): void
    {
        $slugs = [];
        try {
            $slugs = Tenant::where('is_active', true)->pluck('slug')->all();
        } catch (\Throwable $e) {
            // Tabla tenants inexistente: instalación single-tenant sin registry.
            Log::info('TenantContext: sin registro de tenants, usando DB por defecto');
        }

        if (empty($slugs)) {
            $callback(null);
            return;
        }

        foreach ($slugs as $slug) {
            try {
                $callback($slug);
            } catch (\Throwable $e) {
                Log::error('TenantContext: fallo procesando tenant', [
                    'slug'  => $slug,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
