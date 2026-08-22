<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use Illuminate\Console\Command;

/**
 * Resetea mensajes_usados a 0 al inicio de cada periodo mensual del tenant
 * (feat/cuotas-ia). Corre sobre la conexión 'central' directamente — no
 * requiere TenantContext ni cambiar de BD: tenants/mensajes_usados/
 * periodo_inicio/estado_cuota viven en la tabla central, no en la BD de
 * cada tenant (a diferencia de, por ejemplo, tenant:migrate).
 *
 * No toca tenants con estado_cuota = 'suspendido': es una decisión manual
 * del superadmin (ej. impago), no algo que un reset automático deba
 * revertir por su cuenta.
 *
 * Cada tenant tiene su propio periodo_inicio (arranca en la fecha de alta o
 * del último reset, no un calendario compartido tipo "día 1 de cada mes"),
 * así que el comando está pensado para correr diario vía scheduler
 * (routes/console.php) — cada día solo resetea a los que efectivamente ya
 * cumplieron un mes desde su periodo_inicio.
 *
 * Uso:
 *   php artisan tenant:reset-quota            # pregunta confirmación
 *   php artisan tenant:reset-quota --force    # sin confirmación (cron)
 */
class TenantResetQuota extends Command
{
    protected $signature = 'tenant:reset-quota
        {--force : Ejecutar sin confirmación interactiva (uso en cron)}';

    protected $description = 'Resetea mensajes_usados=0 para los tenants cuyo periodo mensual de cuota de IA ya venció.';

    public function handle(): int
    {
        $today = now()->startOfDay();

        $candidates = Tenant::where('estado_cuota', '!=', 'suspendido')->get();

        $due = $candidates->filter(function (Tenant $tenant) use ($today) {
            // Sin periodo_inicio (no debería pasar tras el backfill de la
            // migración, pero un tenant creado fuera del booted() normal —
            // ej. insert directo — podría llegar así): se trata como vencido,
            // así arranca su primer periodo ahora en vez de quedar bloqueado.
            if (!$tenant->periodo_inicio) return true;

            return $tenant->periodo_inicio->copy()->addMonthNoOverflow()->lte($today);
        });

        if ($due->isEmpty()) {
            $this->info('Ningún tenant tiene el periodo de cuota vencido todavía.');
            return self::SUCCESS;
        }

        if (!$this->option('force') && !$this->confirm("¿Resetear la cuota de {$due->count()} tenant(s)?")) {
            return self::SUCCESS;
        }

        foreach ($due as $tenant) {
            $tenant->update([
                'mensajes_usados' => 0,
                'periodo_inicio'  => $today->toDateString(),
                'estado_cuota'    => 'activo',
            ]);
            $this->info("✓ {$tenant->slug}: cuota reseteada, nuevo periodo desde {$today->toDateString()}.");
        }

        return self::SUCCESS;
    }
}
