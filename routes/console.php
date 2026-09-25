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

// Diario 3:30 AM: retención (Ley 29733, principio de proporcionalidad). Las
// conversaciones se guardan como máximo PRIVACY_RETENTION_MONTHS meses (12 por
// defecto) y luego se borran con sus mensajes. Lo publicado en /privacidad debe
// coincidir con este valor.
Schedule::call(function () {
    $months = max(1, (int) env('PRIVACY_RETENTION_MONTHS', 12));
    TenantContext::forEachTenant(function (?string $slug) use ($months) {
        TenantContext::run($slug, function () use ($months) {
            \App\Models\ChatSession::where('updated_at', '<', now()->subMonths($months))->delete();
        });
    });
})->dailyAt('03:30')->name('privacy-retention-per-tenant');

// Cada 5 min: retomar merges de "En vivo" que quedaron pendientes/a medias
// (streams largos con QUEUE_CONNECTION=sync — ver ContinueLiveStreamMerges).
Schedule::command('livestreams:continue-merges')
    ->everyFiveMinutes()
    ->name('continue-livestream-merges')
    ->withoutOverlapping();
