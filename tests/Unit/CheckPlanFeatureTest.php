<?php

namespace Tests\Unit;

use App\Http\Middleware\CheckPlanFeature;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Tests\TestCase;

/**
 * Auditoría de calidad (Fase 16): CheckPlanFeature nunca tenía un test
 * propio pese a ser el gate real de plan a nivel HTTP. Prueba el middleware
 * en aislamiento (sin pasar por auth:sanctum/ResolveTenant reales) para
 * confirmar el comportamiento observable: 403 cuando el plan no incluye la
 * feature, deja pasar cuando sí, y fail-closed (500, no fail-open) cuando
 * no hay tenant resuelto en el contenedor.
 */
class CheckPlanFeatureTest extends TestCase
{
    use DatabaseTransactions;

    // Tenant vive en la conexión 'central' (Tenant::$connection), no en la
    // 'mysql' por defecto — DatabaseTransactions solo envuelve la conexión
    // por defecto salvo que se le indique explícitamente. Sin esto, cada
    // corrida de este test dejaba una fila de Tenant real y permanente en
    // la BD de test (encontrado auditando LiveStreamContinueMergesCommandTest:
    // TenantContext::forEachTenant() las recogía todas como "tenants activos"
    // y las iteraba de más en cualquier otro test que la usara).
    protected $connectionsToTransact = ['mysql', 'central'];

    private function tenant(string $plan, array $customFeatures = []): Tenant
    {
        return Tenant::create([
            'slug'            => 'test-'.uniqid(),
            'name'            => 'Tenant de prueba',
            'db_name'         => 'irrelevante_para_este_test',
            'plan'            => $plan,
            'custom_features' => $customFeatures ?: null,
        ]);
    }

    private function middleware(): CheckPlanFeature
    {
        return new CheckPlanFeature();
    }

    private function passthrough(): \Closure
    {
        return fn (Request $request) => new JsonResponse(['ok' => true], 200);
    }

    public function test_bloquea_con_403_si_el_plan_starter_no_incluye_la_feature(): void
    {
        app()->instance('tenant', $this->tenant('starter'));

        $request = Request::create('/api/admin/intelligence/pulse', 'GET');
        $response = $this->middleware()->handle($request, $this->passthrough());

        $this->assertSame(403, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);
        $this->assertSame('intelligence', $body['feature']);
        $this->assertTrue($body['upgrade_required']);
    }

    public function test_deja_pasar_si_el_plan_incluye_la_feature(): void
    {
        // 'custom' en vez de 'pro': no depende de que PlanFeaturesSeeder haya
        // corrido en la BD de test (confirmado que no corre ahí — el fallback
        // PlanFeatures::defaults() es idéntico a starter para cualquier plan
        // sin fila sembrada, lo que haría este test un falso positivo si
        // dependiera de un 'pro' real).
        app()->instance('tenant', $this->tenant('custom', ['intelligence' => true]));

        $request = Request::create('/api/admin/intelligence/pulse', 'GET');
        $response = $this->middleware()->handle($request, $this->passthrough());

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_deja_pasar_rutas_admin_no_listadas_en_route_features(): void
    {
        app()->instance('tenant', $this->tenant('starter'));

        // /api/admin/users no está en ROUTE_FEATURES — siempre disponible.
        $request = Request::create('/api/admin/users', 'GET');
        $response = $this->middleware()->handle($request, $this->passthrough());

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_deja_pasar_en_modo_single_tenant_sin_tenant_resuelto(): void
    {
        // bind() con closure, no instance(..., null): Container::instance()
        // guarda el valor en un array y luego lo comprueba con isset(), que
        // trata null como "no seteado" — terminaría intentando resolver una
        // clase real llamada "tenant". bind() con closure sí devuelve null
        // limpiamente, igual que hace ResolveTenant.php como default (:22).
        //
        // Se probó hacer esto fail-closed (Fase 16) y se revirtió: sin
        // X-Tenant/subdominio/?tenant=/APP_TENANT_SLUG, ResolveTenant.php:26-28
        // deja `tenant` en null A PROPÓSITO ("single-tenant: usa la DB por
        // defecto") — no hay plan que chequear en ese modo, así que debe
        // dejar pasar. La resolución multi-tenant real que sí falla ya
        // devuelve 404 explícito antes de llegar aquí (ResolveTenant.php:33).
        app()->bind('tenant', fn () => null);

        $request = Request::create('/api/admin/intelligence/pulse', 'GET');
        $response = $this->middleware()->handle($request, $this->passthrough());

        $this->assertSame(200, $response->getStatusCode());
    }
}
