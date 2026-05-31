<?php

use App\Jobs\ClusterTopQuestionsJob;
use App\Jobs\GenerateAlertsJob;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ─── PoliticOS v2 — jobs programados ─────────────────────────────────

// Cada 5 min: revisar si hay condiciones para nuevas alertas
Schedule::job(new GenerateAlertsJob())->everyFiveMinutes()
    ->withoutOverlapping();

// Diario 2 AM: clusterizar preguntas frecuentes del día
Schedule::job(new ClusterTopQuestionsJob())->dailyAt('02:00')
    ->withoutOverlapping();

// Diario 3 AM: limpiar sesiones de bots (>30 días sin actividad y device=bot)
Schedule::call(function () {
    \App\Models\ChatSession::where('device_type', 'bot')
        ->where('updated_at', '<', now()->subDays(30))
        ->delete();
})->dailyAt('03:00');
