<?php

namespace App\Http\Middleware;

use App\Services\GeoIPService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Paneles solo desde los países permitidos (ADMIN_ALLOWED_COUNTRIES, por defecto PE):
 * /api/admin/*, /api/superadmin/* y /api/auth/login. El chat y la web pública no se tocan.
 *
 * Si no se puede saber el país (GeoIP caído), se deja pasar y se registra: preferimos
 * no dejar fuera al dueño del sistema por una falla del proveedor de GeoIP.
 */
class AdminGeoFence
{
    public function __construct(private GeoIPService $geo) {}

    public function handle(Request $request, Closure $next): Response
    {
        $permitidos = (array) config('seguridad.admin_paises', []);

        if ($permitidos === [] || ! $this->esZonaRestringida($request) || app()->environment('local')) {
            return $next($request);
        }

        $pais = $this->pais($request);

        if ($pais !== null && ! in_array($pais, $permitidos, true)) {
            Log::warning('seguridad: acceso a panel desde país no permitido', [
                'pais' => $pais, 'ip' => $request->ip(), 'ruta' => $request->path(),
            ]);

            return response()->json(['message' => 'Acceso no disponible desde tu ubicación.'], 403);
        }

        if ($pais === null) {
            Log::notice('seguridad: país desconocido en acceso a panel (se permite)', ['ip' => $request->ip(), 'ruta' => $request->path()]);
        }

        return $next($request);
    }

    private function esZonaRestringida(Request $request): bool
    {
        return $request->is('api/admin', 'api/admin/*', 'api/superadmin', 'api/superadmin/*', 'api/auth/login');
    }

    private function pais(Request $request): ?string
    {
        $header = (string) config('seguridad.country_header');
        if ($header !== '') {
            $c = strtoupper(trim((string) $request->headers->get($header, '')));
            if (preg_match('/^[A-Z]{2}$/', $c) && $c !== 'XX') {
                return $c;
            }
        }

        try {
            $c = $this->geo->resolve((string) $request->ip())['country'] ?? null;
        } catch (\Throwable) {
            $c = null;
        }

        return is_string($c) && $c !== '' ? strtoupper($c) : null;
    }
}
