<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Autentica al cron externo (GitHub Actions, ver .github/workflows/scheduler.yml)
 * que dispara POST /api/system/run-scheduler cada 5 min. En Render (plan
 * gratis) no hay Cron Job nativo ni worker persistente para correr
 * `schedule:run` — este endpoint reemplaza a un cron real del servidor sin
 * costo adicional. Mismo patrón que EnsureIngestKey: key en config, no
 * depende de la BD de ningún tenant.
 */
class EnsureSchedulerKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = config('services.scheduler.key');

        if (!$key || !hash_equals($key, (string) $request->header('X-Scheduler-Key'))) {
            return response()->json(['message' => 'Acceso denegado.'], 401);
        }

        return $next($request);
    }
}
