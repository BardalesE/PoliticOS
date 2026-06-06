<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class ResolveTenant
{
    public function handle(Request $request, Closure $next): Response
    {
        // Siempre bind 'tenant' a null por defecto para evitar BindingResolutionException
        // en controllers que hacen app('tenant') en modo single-tenant.
        app()->instance('tenant', null);

        $slug = $this->resolveSlug($request);

        if (!$slug) {
            return $next($request); // Single-tenant: usa la DB por defecto
        }

        $tenant = Tenant::where('slug', $slug)->where('is_active', true)->first();

        if (!$tenant) {
            return response()->json(['message' => 'Tenant no encontrado.'], 404);
        }

        // Cambiar la conexión MySQL a la DB del tenant
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
        $request->attributes->set('tenant', $tenant);

        return $next($request);
    }

    private function resolveSlug(Request $request): ?string
    {
        // 1. Header explícito (desarrollo local o frontend sin subdominios)
        if ($request->hasHeader('X-Tenant')) {
            return strtolower(trim($request->header('X-Tenant')));
        }

        // 2. Subdominio (producción): james.politicos.pe → "james"
        // ⚠ Una IP como 159.89.87.18 tiene 4 partes separadas por "." y se
        //   interpretaría incorrectamente como subdomain "159". filter_var lo evita.
        $host = $request->getHost();
        if (!filter_var($host, FILTER_VALIDATE_IP)) {
            $parts = explode('.', $host);
            if (count($parts) >= 3) {
                $sub = strtolower($parts[0]);
                if (!in_array($sub, ['www', 'app', 'api'])) {
                    return $sub;
                }
            }
        }

        // 3. Query param ?tenant=james (local Y producción — útil en IP directa)
        if ($request->query('tenant')) {
            return strtolower($request->query('tenant'));
        }

        // 4. Config var (producción single-tenant).
        // Usa config() y no env() para que funcione con config:cache activo.
        return config('app.tenant_slug') ?: null;
    }
}
