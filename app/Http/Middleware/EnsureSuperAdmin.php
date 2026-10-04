<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $key   = config('superadmin.key');
        $llave = 'sa-fallos:' . $request->ip();
        $max   = max(1, (int) config('seguridad.max_intentos', 5));

        // Fuerza bruta de la clave: tras N fallos la IP queda bloqueada un rato,
        // aunque luego acierte (así no sirve probar miles de claves).
        if (RateLimiter::tooManyAttempts($llave, $max)) {
            return response()->json([
                'message' => 'Demasiados intentos fallidos. Intenta más tarde.',
                'retry_after' => RateLimiter::availableIn($llave),
            ], 429);
        }

        if (!$key || !hash_equals($key, (string) $request->header('X-Super-Admin-Key'))) {
            if ($request->header('X-Super-Admin-Key') !== null) {
                RateLimiter::hit($llave, 60 * max(1, (int) config('seguridad.bloqueo_minutos', 15)));
                Log::warning('seguridad: clave de superadmin incorrecta', ['ip' => $request->ip(), 'ruta' => $request->path()]);
            }

            return response()->json(['message' => 'Acceso denegado.'], 403);
        }

        RateLimiter::clear($llave);

        return $next($request);
    }
}
