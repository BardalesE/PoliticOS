<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Autentica al servicio de ingesta (Python) con una key compartida.
 *
 * No usa Sanctum a propósito: personal_access_tokens vive en la BD de cada
 * tenant y ResolveTenant conmuta de BD según X-Tenant, así que un token
 * emitido en un tenant devuelve 401 en cualquier otro. La key vive en config
 * (BD-independiente) y vale para postear a cualquier tenant.
 */
class EnsureIngestKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = config('services.ingest.key');

        if (!$key || !hash_equals($key, (string) $request->header('X-Ingest-Key'))) {
            return response()->json(['message' => 'Acceso denegado.'], 401);
        }

        return $next($request);
    }
}
