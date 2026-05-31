<?php

namespace App\Jobs;

use App\Services\IntelligenceService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Genera alertas automáticas cada 5 minutos.
 * Programado en routes/console.php o en bootstrap/app.php (schedule).
 */
class GenerateAlertsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 60;

    public function handle(IntelligenceService $intel): void
    {
        $intel->generateAlerts();
    }
}
