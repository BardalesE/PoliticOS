<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Control de cuota de IA por tenant (feat/cuotas-ia). Corre antes del
 * endpoint de chat — bloquea con 429 si el tenant agotó su cuota mensual
 * (mensajes_usados >= mensajes_incluidos) o fue suspendido manualmente
 * (estado_cuota != 'activo').
 *
 * NO incrementa nada acá: el incremento solo debe pasar si la llamada al
 * LLM fue exitosa, y eso recién se sabe después de correr CivicAIService —
 * ver Tenant::recordSuccessfulMessage(), llamado desde ChatController tras
 * construir la respuesta.
 *
 * Fail-open sin tenant resuelto: mismo criterio que CheckPlanFeature — en
 * modo single-tenant, ResolveTenant.php deja `tenant` en null a propósito
 * ("Single-tenant: usa la DB por defecto"), y ahí no existe fila de Tenant
 * contra la cual chequear cuota.
 */
class EnsureTenantQuota
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenant = app('tenant');
        if (!$tenant) {
            return $next($request);
        }

        if (!$tenant->hasQuotaAvailable()) {
            return response()->json([
                'message' => 'El asistente alcanzó su límite mensual de consultas.',
            ], 429);
        }

        return $next($request);
    }
}
