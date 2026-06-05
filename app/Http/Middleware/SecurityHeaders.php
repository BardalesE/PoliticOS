<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Solo aplicar a respuestas HTML/JSON (no a streams SSE ni chunks de video)
        if ($response instanceof \Symfony\Component\HttpFoundation\StreamedResponse) {
            return $response;
        }

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('X-XSS-Protection', '1; mode=block');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

        // HSTS solo en producción (no en local donde no hay HTTPS)
        if (app()->environment('production')) {
            $response->headers->set(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains'
            );
        }

        // CSP básica: bloquea iframes externos, permite la API y CDNs usados
        $response->headers->set('Content-Security-Policy', $this->csp());

        return $response;
    }

    private function csp(): string
    {
        $apiUrl   = config('app.url');
        $frontUrl = config('app.frontend_url', '');

        return implode('; ', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next.js requiere unsafe-eval en dev
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob:",
            "connect-src 'self' {$apiUrl} {$frontUrl} https://api.anthropic.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]);
    }
}
