<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Avisa al frontend Next.js (route handler POST /api/revalidate) que un
 * admin acaba de guardar branding/contenido, para que el ISR revalide de
 * inmediato en vez de esperar su TTL natural (30-120s) — la causa principal
 * de "los cambios tardan en verse" en el sitio público (ver informe de QA).
 *
 * Fire-and-forget a propósito: timeout corto y nunca lanza. Si el frontend
 * no responde, el cambio igual se ve al vencer el TTL normal — esto es una
 * optimización de latencia, no una dependencia dura del guardado.
 */
class FrontendRevalidationService
{
    public function notify(?string $tenantSlug = null): void
    {
        $url    = config('services.revalidate.url');
        $secret = config('services.revalidate.secret');

        if (!$url || !$secret) return;

        try {
            Http::timeout(3)
                ->withHeaders(['X-Revalidate-Secret' => $secret])
                ->post(rtrim($url, '/').'/api/revalidate', ['tenant' => $tenantSlug]);
        } catch (\Throwable $e) {
            Log::warning('Frontend revalidation notify failed', [
                'error'  => $e->getMessage(),
                'tenant' => $tenantSlug,
            ]);
        }
    }
}
