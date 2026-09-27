<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;

class SystemController extends Controller
{
    // POST /api/system/run-scheduler — disparado por el cron externo
    // (GitHub Actions) cada 5 min. Corre exactamente lo que correría
    // `php artisan schedule:run` en un cron real de servidor: los jobs de
    // routes/console.php deciden por su cuenta si les toca ejecutar según
    // su horario (everyFiveMinutes, dailyAt, etc.) — llamarlo de más
    // seguido no duplica trabajo.
    public function runScheduler(): JsonResponse
    {
        Artisan::call('schedule:run');

        return response()->json([
            'ran'    => true,
            'output' => Artisan::output(),
        ]);
    }

    // POST /api/system/migrate-tenants — mismo motivo que run-scheduler: en
    // el plan gratis de Render no hay Shell ni One-Off Jobs para correr
    // `php artisan tenant:migrate` a mano tras un deploy. Protegido por la
    // misma EnsureSchedulerKey (no expone nada nuevo). Uso puntual tras
    // agregar una migracion de tenant; no reemplaza tener un proceso real
    // de release en cuanto se pueda pagar el plan Starter.
    public function migrateTenants(): JsonResponse
    {
        $lock = Cache::lock('system:migrate-tenants', 600);
        if (! $lock->get()) {
            return response()->json(['ran' => false, 'message' => 'Ya hay una migracion en curso.'], 409);
        }

        try {
            Artisan::call('tenant:migrate', ['--force' => true]);
        } finally {
            $lock->release();
        }

        return response()->json([
            'ran'    => true,
            'output' => Artisan::output(),
        ]);
    }
}
