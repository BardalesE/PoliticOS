<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;

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
}
