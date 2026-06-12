<?php

use App\Jobs\ClusterTopQuestionsJob;
use App\Jobs\GenerateAlertsJob;
use App\Services\TenantContext;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ─── PoliticOS v2 — jobs programados (por tenant) ─────────────────────
// El scheduler y los workers corren con la DB por defecto. Cada job lleva
// su tenant slug y reconecta vía TenantContext::run(); aquí solo se itera
// el registro de tenants activos (o la DB por defecto si no hay ninguno).

// Cada 5 min: revisar si hay condiciones para nuevas alertas
Schedule::call(function () {
    TenantContext::forEachTenant(fn (?string $slug) => GenerateAlertsJob::dispatch($slug));
})->everyFiveMinutes()->name('generate-alerts-per-tenant')->withoutOverlapping();

// Diario 2 AM: clusterizar preguntas frecuentes del día
Schedule::call(function () {
    TenantContext::forEachTenant(fn (?string $slug) => ClusterTopQuestionsJob::dispatch($slug));
})->dailyAt('02:00')->name('cluster-questions-per-tenant')->withoutOverlapping();

// Diario 3 AM: limpiar sesiones de bots (>30 días sin actividad y device=bot)
Schedule::call(function () {
    TenantContext::forEachTenant(function (?string $slug) {
        TenantContext::run($slug, function () {
            \App\Models\ChatSession::where('device_type', 'bot')
                ->where('updated_at', '<', now()->subDays(30))
                ->delete();
        });
    });
})->dailyAt('03:00')->name('purge-bot-sessions-per-tenant');
