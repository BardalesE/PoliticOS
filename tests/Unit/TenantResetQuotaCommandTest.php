<?php

namespace Tests\Unit;

use App\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * feat/cuotas-ia — comando `tenant:reset-quota`. Tenant vive en la conexión
 * 'central' (ver TenantQuotaTest para el porqué de $connectionsToTransact).
 */
class TenantResetQuotaCommandTest extends TestCase
{
    use DatabaseTransactions;

    protected array $connectionsToTransact = ['central'];

    public function test_resetea_un_tenant_cuyo_periodo_ya_vencio(): void
    {
        $tenant = Tenant::create([
            'slug'               => 'reset-vencido-' . uniqid(),
            'name'               => 'Vencido',
            'db_name'            => 'x',
            'mensajes_usados'    => 850,
            'mensajes_incluidos' => 1000,
            'periodo_inicio'     => now()->subMonths(2)->toDateString(),
            'estado_cuota'       => 'agotado',
        ]);

        Artisan::call('tenant:reset-quota', ['--force' => true]);

        $tenant->refresh();
        $this->assertSame(0, $tenant->mensajes_usados);
        $this->assertSame('activo', $tenant->estado_cuota);
        $this->assertSame(now()->toDateString(), $tenant->periodo_inicio->toDateString());
    }

    public function test_no_toca_un_tenant_cuyo_periodo_sigue_vigente(): void
    {
        $tenant = Tenant::create([
            'slug'               => 'reset-vigente-' . uniqid(),
            'name'               => 'Vigente',
            'db_name'            => 'x',
            'mensajes_usados'    => 50,
            'mensajes_incluidos' => 1000,
            'periodo_inicio'     => now()->toDateString(),
            'estado_cuota'       => 'activo',
        ]);

        Artisan::call('tenant:reset-quota', ['--force' => true]);

        $tenant->refresh();
        $this->assertSame(50, $tenant->mensajes_usados);
    }

    public function test_no_toca_un_tenant_suspendido_aunque_su_periodo_haya_vencido(): void
    {
        // estado_cuota='suspendido' es una acción manual (ej. impago) — el
        // reset automático no debe revertirla, ni el conteo ni el estado.
        $tenant = Tenant::create([
            'slug'               => 'reset-suspendido-' . uniqid(),
            'name'               => 'Suspendido',
            'db_name'            => 'x',
            'mensajes_usados'    => 500,
            'mensajes_incluidos' => 1000,
            'periodo_inicio'     => now()->subMonths(3)->toDateString(),
            'estado_cuota'       => 'suspendido',
        ]);

        Artisan::call('tenant:reset-quota', ['--force' => true]);

        $tenant->refresh();
        $this->assertSame(500, $tenant->mensajes_usados);
        $this->assertSame('suspendido', $tenant->estado_cuota);
    }

    public function test_sin_tenants_vencidos_no_falla_y_no_toca_nada(): void
    {
        $tenant = Tenant::create([
            'slug'               => 'reset-nada-' . uniqid(),
            'name'               => 'Nada que resetear',
            'db_name'            => 'x',
            'mensajes_usados'    => 10,
            'mensajes_incluidos' => 1000,
            'periodo_inicio'     => now()->toDateString(),
        ]);

        $exitCode = Artisan::call('tenant:reset-quota', ['--force' => true]);

        $this->assertSame(0, $exitCode);
        $this->assertSame(10, $tenant->fresh()->mensajes_usados);
    }
}
