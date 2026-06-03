<?php

namespace App\Http\Controllers;

use App\Models\PlanFeatures;
use App\Models\Tenant;
use App\Services\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    // GET /api/admin/plan — plan y features del tenant activo
    public function adminShow(): JsonResponse
    {
        $tenant = app('tenant');
        if (!$tenant) {
            return response()->json([
                'plan'     => 'elite',
                'label'    => 'Elite (single-tenant)',
                'price'    => 0,
                'features' => PlanFeatures::forPlan('elite')?->features ?? PlanFeatures::defaults(),
            ]);
        }

        $pf       = PlanFeatures::forPlan($tenant->plan);
        $features = PlanService::resolveFeatures($tenant);

        return response()->json([
            'plan'     => $tenant->plan,
            'label'    => $pf?->label ?? ucfirst($tenant->plan),
            'price'    => $pf?->price ?? 0,
            'features' => $features,
        ]);
    }

    // GET /api/superadmin/plans
    public function listPlans(): JsonResponse
    {
        return response()->json(
            PlanFeatures::orderBy('price')->get()
        );
    }

    // PUT /api/superadmin/plans/{id}
    public function updatePlan(Request $request, int $id): JsonResponse
    {
        $pf   = PlanFeatures::findOrFail($id);
        $data = $request->validate([
            'label'     => ['sometimes', 'string', 'max:80'],
            'price'     => ['sometimes', 'numeric', 'min:0'],
            'features'  => ['sometimes', 'array'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $pf->update($data);
        return response()->json($pf->fresh());
    }

    // GET /api/superadmin/tenants/{id}/plan
    public function tenantPlan(int $id): JsonResponse
    {
        $tenant   = Tenant::findOrFail($id);
        $pf       = PlanFeatures::forPlan($tenant->plan);
        $features = PlanService::resolveFeatures($tenant);

        return response()->json([
            'tenant_id'       => $tenant->id,
            'plan'            => $tenant->plan,
            'label'           => $pf?->label ?? ucfirst($tenant->plan),
            'custom_features' => $tenant->custom_features,
            'features'        => $features,
        ]);
    }

    // PUT /api/superadmin/tenants/{id}/plan
    public function updateTenantPlan(Request $request, int $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);
        $data   = $request->validate([
            'plan'            => ['required', 'in:starter,pro,elite,custom'],
            'custom_features' => ['nullable', 'array'],
        ]);

        $tenant->update([
            'plan'            => $data['plan'],
            'custom_features' => $data['plan'] === 'custom' ? ($data['custom_features'] ?? null) : null,
        ]);

        return response()->json($tenant->fresh());
    }
}
