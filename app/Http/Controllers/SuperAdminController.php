<?php

namespace App\Http\Controllers;

use App\Models\AiSetting;
use App\Models\Tenant;
use App\Services\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

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
            'db_name'     => ['required', 'string', 'max:64', 'regex:/^[a-zA-Z_][a-zA-Z0-9_]{1,63}$/'],
            'db_host'     => ['nullable', 'string', 'max:100'],
            'db_port'     => ['nullable', 'integer'],
            'db_user'     => ['nullable', 'string', 'max:100'],
            'db_password' => ['nullable', 'string', 'max:255'],
            'plan'        => ['nullable', 'in:starter,pro,elite,custom'],
            'is_active'   => ['nullable', 'boolean'],
        ]);

        if ($conflict = $this->databaseConflict($data['db_name'], $data['db_host'] ?? null, $data['db_port'] ?? null)) {
            return response()->json(['message' => $conflict, 'errors' => ['db_name' => [$conflict]]], 422);
        }

        $tenant = Tenant::create($data);

        return response()->json($tenant, 201);
    }

    // PUT /api/superadmin/tenants/{id}
    public function updateTenant(Request $request, int $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);
        $data   = $request->validate([
            'name'        => ['sometimes', 'string', 'max:150'],
            'db_name'     => ['sometimes', 'string', 'max:64', 'regex:/^[a-zA-Z_][a-zA-Z0-9_]{1,63}$/'],
            'db_host'     => ['nullable', 'string', 'max:100'],
            'db_port'     => ['nullable', 'integer'],
            'db_user'     => ['nullable', 'string', 'max:100'],
            'db_password' => ['nullable', 'string', 'max:255'],
            'plan'        => ['nullable', 'in:starter,pro,elite,custom'],
            'is_active'   => ['nullable', 'boolean'],
        ]);
        if (isset($data['db_name']) || array_key_exists('db_host', $data) || array_key_exists('db_port', $data)) {
            $conflict = $this->databaseConflict(
                $data['db_name'] ?? $tenant->db_name,
                array_key_exists('db_host', $data) ? $data['db_host'] : $tenant->db_host,
                array_key_exists('db_port', $data) ? $data['db_port'] : $tenant->db_port,
                $tenant->id,
            );
            if ($conflict) {
                return response()->json(['message' => $conflict, 'errors' => ['db_name' => [$conflict]]], 422);
            }
        }

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
            'db_name'        => ['required', 'string', 'max:64', 'regex:/^[a-zA-Z_][a-zA-Z0-9_]{1,63}$/'],
            'admin_email'    => ['required', 'email'],
            'admin_password' => ['required', 'string', 'min:8'],
            'plan'           => ['nullable', 'in:starter,pro,elite'],
            'db_host'        => ['nullable', 'string', 'max:100'],
            'db_port'        => ['nullable', 'integer'],
            'db_user'        => ['nullable', 'string', 'max:100'],
            'db_password'    => ['nullable', 'string'],
        ]);

        if ($conflict = $this->databaseConflict($data['db_name'], $data['db_host'] ?? null, $data['db_port'] ?? null)) {
            return response()->json(['message' => $conflict, 'errors' => ['db_name' => [$conflict]]], 422);
        }

        $args = [
            'slug'           => $data['slug'],
            'name'           => $data['name'],
            'db_name'        => $data['db_name'],
            'admin_email'    => $data['admin_email'],
            'admin_password' => $data['admin_password'],
            '--plan'         => $data['plan']    ?? 'starter',
            '--db-host'      => $data['db_host'] ?? config('database.connections.mysql.host', '127.0.0.1'),
            '--db-port'      => (string) ($data['db_port'] ?? config('database.connections.mysql.port', 3306)),
            '--db-user'      => config('database.connections.mysql.username', 'politicos_user'),
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

    // GET /api/superadmin/tenants/{id}/credentials
    public function getCredentials(int $id, \Illuminate\Http\Request $request): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $log   = json_decode($tenant->credential_log ?? '[]', true) ?: [];
        $log[] = ['action' => 'viewed', 'ip' => $request->ip(), 'timestamp' => now()->toIso8601String()];
        $log   = array_slice($log, -20);
        $tenant->update(['credential_log' => json_encode($log)]);

        // Solo se comprueba que el hint sea descifrable; la contraseña en claro
        // nunca sale de aquí — únicamente resetPassword devuelve una nueva.
        $hasPassword = false;
        if ($tenant->admin_password_hint) {
            try {
                \Illuminate\Support\Facades\Crypt::decrypt($tenant->admin_password_hint);
                $hasPassword = true;
            } catch (\Throwable) {}
        }

        return response()->json([
            'admin_email'         => $tenant->admin_email,
            'has_password'        => $hasPassword,
            'password_changed'    => !is_null($tenant->password_changed_at),
            'password_changed_at' => $tenant->password_changed_at,
            'admin_url'           => config('app.frontend_url', 'http://localhost:3000') . "/admin/login?tenant={$tenant->slug}",
            'chatbot_url'         => config('app.frontend_url', 'http://localhost:3000') . "?tenant={$tenant->slug}",
            'credential_log'      => array_reverse($log),
        ]);
    }

    // POST /api/superadmin/tenants/{id}/reset-password
    public function resetPassword(int $id, \Illuminate\Http\Request $request): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        if (!$tenant->admin_email) {
            return response()->json(['message' => 'Este tenant no tiene email de admin registrado.'], 422);
        }

        $newPassword = \Illuminate\Support\Str::random(16);

        config([
            'database.connections.tenant_creds.driver'    => 'mysql',
            'database.connections.tenant_creds.host'      => $tenant->db_host,
            'database.connections.tenant_creds.port'      => $tenant->db_port,
            'database.connections.tenant_creds.database'  => $tenant->db_name,
            'database.connections.tenant_creds.username'  => $tenant->db_user,
            'database.connections.tenant_creds.password'  => $tenant->db_password,
            'database.connections.tenant_creds.charset'   => 'utf8mb4',
            'database.connections.tenant_creds.collation' => 'utf8mb4_unicode_ci',
        ]);

        try {
            DB::connection('tenant_creds')->table('users')
                ->where('email', $tenant->admin_email)
                ->update(['password' => \Illuminate\Support\Facades\Hash::make($newPassword)]);
        } catch (\Throwable $e) {
            Log::error('Reset de contraseña falló al conectar a la DB del tenant', [
                'tenant_id' => $tenant->id,
                'tenant_slug' => $tenant->slug,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['message' => 'No se pudo conectar a la DB del tenant.'], 500);
        } finally {
            DB::purge('tenant_creds');
        }

        $log   = json_decode($tenant->credential_log ?? '[]', true) ?: [];
        $log[] = ['action' => 'reset_password', 'ip' => $request->ip(), 'timestamp' => now()->toIso8601String()];
        $log   = array_slice($log, -20);

        $tenant->update([
            'admin_password_hint'  => \Illuminate\Support\Facades\Crypt::encrypt($newPassword),
            'password_changed_at'  => now(),
            'credential_log'       => json_encode($log),
        ]);

        return response()->json([
            'admin_email'    => $tenant->admin_email,
            'admin_password' => $newPassword,
            'reset_at'       => now()->toIso8601String(),
        ]);
    }

    // GET /api/superadmin/tenants/{id}/ai-settings
    //
    // Configuración de IA de UN tenant, con el tenant explícito en la URL: no
    // depende de ningún X-Tenant / localStorage del navegador, que es lo que
    // hacía que "editar el prompt de otro candidato" escribiera en el equivocado.
    public function tenantAiSettings(int $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $payload = TenantContext::run($tenant->slug, fn () => $this->aiSettingsPayload(AiSetting::current()));
        if ($payload === null) {
            return response()->json(['message' => 'El tenant está inactivo o no se pudo abrir su base de datos.'], 422);
        }

        return response()->json($this->withTenantInfo($tenant, $payload));
    }

    // PUT /api/superadmin/tenants/{id}/ai-settings
    public function updateTenantAiSettings(Request $request, int $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);
        $data   = $request->validate(AiSettingController::rules());

        $payload = TenantContext::run(
            $tenant->slug,
            fn () => $this->aiSettingsPayload(AiSetting::current()->applyAdminUpdate($data))
        );
        if ($payload === null) {
            return response()->json(['message' => 'El tenant está inactivo o no se pudo abrir su base de datos.'], 422);
        }

        Log::info('Superadmin editó la configuración de IA de un tenant', [
            'tenant_id'   => $tenant->id,
            'tenant_slug' => $tenant->slug,
            'fields'      => array_keys($data),
            'ip'          => $request->ip(),
        ]);

        return response()->json($this->withTenantInfo($tenant, $payload));
    }

    // GET /api/superadmin/tenants-audit
    //
    // Diagnóstico de aislamiento: qué tenants comparten base de datos y cuál es
    // el prompt real de cada uno (hash, no el texto). Dos tenants con la misma
    // BD, o con el mismo prompt "de fábrica" cuando se personalizó uno, delatan
    // el problema de configuración cruzada.
    public function auditTenants(): JsonResponse
    {
        $tenants = Tenant::orderBy('id')->get();

        $rows = $tenants->map(function (Tenant $t) {
            $ai = $t->is_active
                ? TenantContext::run($t->slug, function () {
                    $s = AiSetting::current();
                    return [
                        'mode'         => $s->mode,
                        'customized'   => (bool) $s->system_prompt_customizado,
                        'prompt_chars' => mb_strlen((string) $s->system_prompt),
                        'prompt_hash'  => substr(md5((string) $s->system_prompt), 0, 8),
                    ];
                })
                : null;

            return [
                'id'         => $t->id,
                'slug'       => $t->slug,
                'is_active'  => $t->is_active,
                'db'         => "{$t->db_name}@{$t->db_host}:{$t->db_port}",
                'shared_with' => $this->tenantsSharingDatabase($t)->pluck('slug')->values(),
                'is_central' => $this->isCentralDatabase($t->db_name, $t->db_host, $t->db_port),
                'ai'         => $ai,
            ];
        })->values();

        return response()->json([
            'central_db' => config('database.connections.central.database'),
            'tenants'    => $rows,
            'problems'   => $rows->filter(fn ($r) => $r['is_central'] || $r['shared_with']->isNotEmpty())->pluck('slug')->values(),
        ]);
    }

    /** Mensaje de error si (db, host, port) ya está en uso por otro tenant o es la BD central. */
    private function databaseConflict(string $dbName, ?string $host, $port, ?int $exceptId = null): ?string
    {
        if ($this->isCentralDatabase($dbName, $host, $port)) {
            return "La base de datos '{$dbName}' es la base central de la plataforma; un tenant no puede usarla.";
        }

        $other = Tenant::where('db_name', $dbName)
            ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
            ->get()
            ->first(fn (Tenant $t) => $this->sameServer($t->db_host, $t->db_port, $host, $port));

        return $other
            ? "La base de datos '{$dbName}' ya la usa el tenant '{$other->slug}'. Compartir base de datos mezcla la configuración (prompt, documentos, usuarios) de los candidatos."
            : null;
    }

    private function tenantsSharingDatabase(Tenant $t)
    {
        return Tenant::where('db_name', $t->db_name)->where('id', '!=', $t->id)->get()
            ->filter(fn (Tenant $o) => $this->sameServer($o->db_host, $o->db_port, $t->db_host, $t->db_port));
    }

    private function isCentralDatabase(string $dbName, ?string $host, $port): bool
    {
        $central = config('database.connections.central');

        return $dbName === ($central['database'] ?? null)
            && $this->sameServer($central['host'] ?? null, $central['port'] ?? null, $host, $port);
    }

    // host/port vacíos = "el servidor por defecto" (mismo que el de la BD central).
    private function sameServer(?string $hostA, $portA, ?string $hostB, $portB): bool
    {
        $default = config('database.connections.central');
        $hostA = strtolower($hostA ?: (string) ($default['host'] ?? ''));
        $hostB = strtolower($hostB ?: (string) ($default['host'] ?? ''));
        $portA = (string) ($portA ?: ($default['port'] ?? 3306));
        $portB = (string) ($portB ?: ($default['port'] ?? 3306));

        return $hostA === $hostB && $portA === $portB;
    }

    private function aiSettingsPayload(AiSetting $setting): array
    {
        return array_merge($setting->toArray(), [
            'has_own_api_key' => $setting->api_key !== null,
            'restricted'      => false,
        ]);
    }

    private function withTenantInfo(Tenant $tenant, array $payload): array
    {
        $sharing = $this->tenantsSharingDatabase($tenant)->pluck('slug')->values()->all();

        return array_merge($payload, [
            'tenant' => [
                'id'          => $tenant->id,
                'slug'        => $tenant->slug,
                'name'        => $tenant->name,
                'db'          => "{$tenant->db_name}@{$tenant->db_host}",
                'shared_with' => $sharing,
                'is_central'  => $this->isCentralDatabase($tenant->db_name, $tenant->db_host, $tenant->db_port),
            ],
        ]);
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
