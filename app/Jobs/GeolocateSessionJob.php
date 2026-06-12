<?php

namespace App\Jobs;

use App\Models\ChatSession;
use App\Services\GeoIPService;
use App\Services\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Resuelve la IP de una sesión a geolocalización (país/región/ciudad/lat/lng).
 * Corre async para no bloquear la primera respuesta.
 */
class GeolocateSessionJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 10;

    public function __construct(public int $sessionId, public ?string $tenantSlug = null)
    {
        $this->tenantSlug ??= TenantContext::currentSlug();
    }

    public function handle(GeoIPService $geo): void
    {
        TenantContext::run($this->tenantSlug, function () use ($geo) {
            $session = ChatSession::find($this->sessionId);
            if (!$session || !$session->ip || $session->geo_country) return;

            $loc = $geo->resolve($session->ip);
            $session->update([
                'geo_country' => $loc['country'],
                'geo_region'  => $loc['region'],
                'geo_city'    => $loc['city'],
                'geo_lat'     => $loc['lat'],
                'geo_lng'     => $loc['lng'],
                'device_type' => GeoIPService::detectDevice($session->user_agent),
            ]);
        });
    }
}
