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

// Cada 5 min: retomar merges de "En vivo" que quedaron pendientes/a medias
// (streams largos con QUEUE_CONNECTION=sync — ver ContinueLiveStreamMerges).
Schedule::command('livestreams:continue-merges')
    ->everyFiveMinutes()
    ->name('continue-livestream-merges')
    ->withoutOverlapping();

// Diario: resetea la cuota mensual de IA de los tenants cuyo periodo venció
// (feat/cuotas-ia). Diario y no mensual porque cada tenant tiene su propio
// periodo_inicio (arranca en su fecha de alta o último reset, no un
// calendario compartido) — hay que revisar todos los días cuál vence hoy.
// Corre sobre la conexión 'central', no necesita TenantContext::forEachTenant.
Schedule::command('tenant:reset-quota --force')
    ->daily()
    ->name('reset-tenant-ai-quota')
    ->withoutOverlapping();
