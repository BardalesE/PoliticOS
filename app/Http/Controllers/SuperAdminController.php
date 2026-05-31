<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class SuperAdminController extends Controller
{
    // GET /api/superadmin/tenants
    public function listTenants(): JsonResponse
    {
        return response()->json(Tenant::orderByDesc('created_at')->paginate(20));
    }

    // POST /api/superadmin/tenants
    public function storeTenant(Request $request): JsonResponse
    {
        $data = $request->validate([
            'slug'        => ['required', 'string', 'max:60', 'unique:tenants,slug', 'regex:/^[a-z0-9\-]+$/'],
            'name'        => ['required', 'string', 'max:150'],
            'db_name'     => ['required', 'string', 'max:100'],
            'db_host'     => ['nullable', 'string', 'max:100'],
            'db_port'     => ['nullable', 'integer'],
            'db_user'     => ['nullable', 'string', 'max:100'],
            'db_password' => ['nullable', 'string', 'max:255'],
            'plan'        => ['nullable', 'in:starter,pro,elite'],
            'is_active'   => ['nullable', 'boolean'],
        ]);

        $tenant = Tenant::create($data);

        return response()->json($tenant, 201);
    }

    // PUT /api/superadmin/tenants/{id}
    public function updateTenant(Request $request, int $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);
        $data   = $request->validate([
            'name'        => ['sometimes', 'string', 'max:150'],
            'db_name'     => ['sometimes', 'string', 'max:100'],
            'db_host'     => ['nullable', 'string', 'max:100'],
            'db_port'     => ['nullable', 'integer'],
            'db_user'     => ['nullable', 'string', 'max:100'],
            'db_password' => ['nullable', 'string', 'max:255'],
            'plan'        => ['nullable', 'in:starter,pro,elite'],
            'is_active'   => ['nullable', 'boolean'],
        ]);
        $tenant->update($data);
        return response()->json($tenant);
    }

    // DELETE /api/superadmin/tenants/{id}
    public function destroyTenant(int $id): JsonResponse
    {
        Tenant::findOrFail($id)->delete();
        return response()->json(['deleted' => true]);
    }

    // POST /api/superadmin/tenants/provision
    public function provision(Request $request): JsonResponse
    {
        $data = $request->validate([
            'slug'           => ['required', 'string', 'max:60', 'unique:tenants,slug', 'regex:/^[a-z0-9\-]+$/'],
            'name'           => ['required', 'string', 'max:150'],
            'db_name'        => ['required', 'string', 'max:100'],
            'admin_email'    => ['required', 'email'],
            'admin_password' => ['required', 'string', 'min:8'],
            'plan'           => ['nullable', 'in:starter,pro,elite'],
            'db_host'        => ['nullable', 'string', 'max:100'],
            'db_port'        => ['nullable', 'integer'],
            'db_user'        => ['nullable', 'string', 'max:100'],
            'db_password'    => ['nullable', 'string'],
        ]);

        $args = [
            'slug'           => $data['slug'],
            'name'           => $data['name'],
            'db_name'        => $data['db_name'],
            'admin_email'    => $data['admin_email'],
            'admin_password' => $data['admin_password'],
            '--plan'         => $data['plan']    ?? 'starter',
            '--db-host'      => $data['db_host'] ?? config('database.connections.mysql.host', '127.0.0.1'),
            '--db-port'      => (string) ($data['db_port'] ?? config('database.connections.mysql.port', 3306)),
            '--db-user'      => $data['db_user'] ?? config('database.connections.mysql.username', 'root'),
            '--db-password'  => $data['db_password'] ?? config('database.connections.mysql.password', ''),
            '--force'        => true,
        ];

        $exitCode = Artisan::call('tenant:provision', $args);
        $output   = Artisan::output();

        if ($exitCode !== 0) {
            return response()->json([
                'message' => 'Error durante el provisionamiento.',
                'output'  => $output,
            ], 422);
        }

        $tenant = Tenant::where('slug', $data['slug'])->first();

        return response()->json([
            'tenant'  => $tenant,
            'message' => "Tenant '{$data['slug']}' provisionado exitosamente.",
            'output'  => $output,
        ], 201);
    }

    // GET /api/superadmin/tenants/{id}/stats
    public function tenantStats(int $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        // Conectar a la DB del tenant para obtener estadísticas
        config([
            'database.connections.tenant_stats.driver'   => 'mysql',
            'database.connections.tenant_stats.host'     => $tenant->db_host,
            'database.connections.tenant_stats.port'     => $tenant->db_port,
            'database.connections.tenant_stats.database' => $tenant->db_name,
            'database.connections.tenant_stats.username' => $tenant->db_user,
            'database.connections.tenant_stats.password' => $tenant->db_password,
            'database.connections.tenant_stats.charset'  => 'utf8mb4',
            'database.connections.tenant_stats.collation' => 'utf8mb4_unicode_ci',
        ]);

        try {
            $stats = [
                'chat_sessions' => DB::connection('tenant_stats')->table('chat_sessions')->count(),
                'chat_messages' => DB::connection('tenant_stats')->table('chat_messages')->count(),
                'proposals'     => DB::connection('tenant_stats')->table('proposals')->count(),
            ];
        } catch (\Throwable $e) {
            $stats = ['error' => 'No se pudo conectar a la base de datos del tenant'];
        } finally {
            DB::purge('tenant_stats');
        }

        return response()->json(['tenant' => $tenant, 'stats' => $stats]);
    }
}
