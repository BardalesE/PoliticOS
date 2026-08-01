<?php

namespace App\Http\Middleware;

use App\Services\PlanService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPlanFeature
{
    // admin route prefix → feature key
    private const ROUTE_FEATURES = [
        'api/admin/proposals'        => 'proposals',
        'api/admin/videos'           => 'media',
        'api/admin/gallery'          => 'media',
        'api/admin/campaign-videos'  => 'media',
        'api/admin/events'           => 'events',
        'api/admin/team-members'     => 'team',
        'api/admin/external-signals' => 'external_signals',
        'api/admin/intelligence'     => 'intelligence',
        'api/admin/attack-responses' => 'attack_responses',
        'api/admin/livestreams'      => 'livestream',
        'api/admin/knowledge'        => 'knowledge',
        'api/admin/surveys'          => 'surveys',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $tenant = app('tenant');
        // Auditoría de calidad (Fase 16): se evaluó hacer esto fail-closed,
        // pero se revirtió tras probarlo contra el navegador real —
        // ResolveTenant.php:26-28 deja `tenant` en null A PROPÓSITO en modo
        // single-tenant (sin X-Tenant/subdominio/?tenant=/APP_TENANT_SLUG):
        // "Single-tenant: usa la DB por defecto". En ese modo no existe fila
        // de Tenant contra la cual chequear un plan, así que fail-open aquí
        // es el comportamiento correcto, no una brecha. La resolución de
        // tenant multi-tenant real SÍ falla de forma segura (404 explícito
        // en ResolveTenant.php:33) antes de llegar siquiera a este middleware.
        if (!$tenant) return $next($request);

        foreach (self::ROUTE_FEATURES as $path => $feature) {
            if ($request->is("{$path}*")) {
                if (!PlanService::isEnabled($tenant, $feature)) {
                    return response()->json([
                        'message'          => 'Esta función no está disponible en tu plan actual.',
                        'feature'          => $feature,
                        'current_plan'     => $tenant->plan,
                        'required_plan'    => PlanService::requiredPlanFor($feature),
                        'upgrade_required' => true,
                    ], 403);
                }
                break;
            }
        }

        return $next($request);
    }
}
