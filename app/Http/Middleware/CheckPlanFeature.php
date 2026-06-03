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
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $tenant = app('tenant');
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
