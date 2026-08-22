<?php

namespace Tests\Unit;

use App\Http\Middleware\EnsureTenantQuota;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * feat/cuotas-ia — Tenant::hasQuotaAvailable()/recordSuccessfulMessage() y el
 * middleware EnsureTenantQuota que los usa.
 *
 * Tenant vive en la conexión 'central' (ver app/Models/Tenant.php), NUNCA
 * 'mysql' (esa es la que ResolveTenant reconecta por request) — por eso el
 * test declara $connectionsToTransact = ['central'] explícito: la
 * DatabaseTransactions por defecto solo envuelve la conexión default
 * ('mysql'), así que sin esto cada tenant de prueba quedaría persistido de
 * verdad en la tabla central compartida.
 */
class TenantQuotaTest extends TestCase
{
    use DatabaseTransactions;

    protected array $connectionsToTransact = ['central'];

    private function makeTenant(array $attrs = []): Tenant
    {
        return Tenant::create(array_merge([
            'slug'    => 'quota-test-' . uniqid(),
            'name'    => 'Tenant de prueba',
            'db_name' => 'irrelevante_para_este_test',
        ], $attrs));
    }

    // ─── Tenant::hasQuotaAvailable() / recordSuccessfulMessage() ──────────

    public function test_tenant_recien_creado_tiene_cuota_disponible_por_defecto(): void
    {
        $tenant = $this->makeTenant();

        $this->assertSame('activo', $tenant->estado_cuota);
        $this->assertSame(0, $tenant->mensajes_usados);
        $this->assertSame(1000, $tenant->mensajes_incluidos);
        $this->assertTrue($tenant->hasQuotaAvailable());
        $this->assertSame(0.0, $tenant->quota_used_percent);
    }

    public function test_record_successful_message_incrementa_y_calcula_porcentaje(): void
    {
        $tenant = $this->makeTenant(['mensajes_incluidos' => 4]);

        $tenant->recordSuccessfulMessage();
        $tenant->recordSuccessfulMessage();

        $this->assertSame(2, $tenant->mensajes_usados);
        $this->assertSame('activo', $tenant->estado_cuota);
        $this->assertSame(50.0, $tenant->quota_used_percent);
        $this->assertTrue($tenant->hasQuotaAvailable());
    }

    public function test_record_successful_message_marca_agotado_al_cruzar_el_limite(): void
    {
        $tenant = $this->makeTenant(['mensajes_incluidos' => 2]);

        $tenant->recordSuccessfulMessage();
        $tenant->recordSuccessfulMessage();

        $this->assertSame(2, $tenant->mensajes_usados);
        $this->assertSame('agotado', $tenant->estado_cuota);
        $this->assertFalse($tenant->fresh()->hasQuotaAvailable());
    }

    public function test_record_successful_message_no_reactiva_un_tenant_suspendido(): void
    {
        // estado_cuota='suspendido' es una decisión manual del superadmin —
        // el conteo de mensajes no debe pisarla ni para "arreglar" el estado.
        $tenant = $this->makeTenant([
            'mensajes_incluidos' => 10,
            'mensajes_usados'    => 3,
            'estado_cuota'       => 'suspendido',
        ]);

        $tenant->recordSuccessfulMessage();

        $this->assertSame(4, $tenant->mensajes_usados);
        $this->assertSame('suspendido', $tenant->estado_cuota);
    }

    public function test_quota_used_percent_no_pasa_de_100_aunque_el_conteo_se_pase(): void
    {
        $tenant = $this->makeTenant(['mensajes_incluidos' => 2, 'mensajes_usados' => 5]);

        $this->assertSame(100.0, $tenant->quota_used_percent);
    }

    // ─── EnsureTenantQuota middleware ──────────────────────────────────────

    private function callMiddleware(?Tenant $tenant): \Symfony\Component\HttpFoundation\Response
    {
        // bind(), no instance(): un binding por instance() con valor null es
        // "invisible" para el contenedor (isset() interno da false) y
        // app('tenant') relanza BindingResolutionException en vez de
        // devolver null — mismo gotcha documentado en ResolveTenant.php.
        app()->bind('tenant', fn () => $tenant);

        $request = Request::create('/api/chat', 'POST', ['message' => 'hola']);
        $middleware = new EnsureTenantQuota();

        return $middleware->handle($request, fn ($r) => response()->json(['ok' => true]));
    }

    public function test_middleware_deja_pasar_sin_tenant_resuelto(): void
    {
        // Modo single-tenant (ResolveTenant deja tenant=null a propósito) —
        // mismo criterio fail-open que CheckPlanFeature.
        $response = $this->callMiddleware(null);

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_middleware_deja_pasar_con_cuota_disponible(): void
    {
        $tenant = $this->makeTenant(['mensajes_incluidos' => 10, 'mensajes_usados' => 3]);

        $response = $this->callMiddleware($tenant);

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_middleware_bloquea_con_429_cuando_se_agoto_la_cuota(): void
    {
        $tenant = $this->makeTenant(['mensajes_incluidos' => 10, 'mensajes_usados' => 10, 'estado_cuota' => 'agotado']);

        $response = $this->callMiddleware($tenant);

        $this->assertSame(429, $response->getStatusCode());
        $this->assertSame(
            'El asistente alcanzó su límite mensual de consultas.',
            json_decode($response->getContent(), true)['message']
        );
    }

    public function test_middleware_bloquea_con_429_cuando_esta_suspendido_aunque_tenga_mensajes_disponibles(): void
    {
        $tenant = $this->makeTenant(['mensajes_incluidos' => 1000, 'mensajes_usados' => 1, 'estado_cuota' => 'suspendido']);

        $response = $this->callMiddleware($tenant);

        $this->assertSame(429, $response->getStatusCode());
    }
}
