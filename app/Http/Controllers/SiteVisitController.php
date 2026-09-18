<?php

namespace App\Http\Controllers;

use App\Models\SiteVisitor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Contador público de visitas únicas por IP de la plataforma.
 *
 *   GET  /api/site-visits  → { visits: N }
 *   POST /api/site-visits  → registra la IP (si es nueva) y devuelve { visits: N }
 *
 * La IP se registra desde el NAVEGADOR (POST directo del cliente a la API), no
 * desde el server-side render de Next.js: si lo hiciera el servidor de Vercel,
 * todas las visitas tendrían la IP de Vercel. Además el POST solo lo dispara
 * JavaScript, así que los crawlers que no ejecutan JS no inflan la cifra.
 */
class SiteVisitController extends Controller
{
    private const CACHE_KEY = 'site_visits:total';
    private const CACHE_TTL = 15; // segundos — evita un COUNT(*) por request

    /** User-Agents que nunca cuentan como visita de ciudadano. */
    private const BOT_PATTERN = '/bot|crawl|spider|slurp|preview|headless|monitor|uptime|curl|wget|python-requests|axios|node-fetch|go-http/i';

    public function show(): JsonResponse
    {
        return response()->json(['visits' => $this->total()]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isBot($request)) {
            // insertOrIgnore sobre el índice único (ip_hash): atómico y libre
            // de condiciones de carrera — dos requests simultáneos de la misma
            // IP nunca cuentan doble. Devuelve 1 solo si la IP era nueva.
            $inserted = SiteVisitor::query()->insertOrIgnore([
                'ip_hash'       => $this->hashIp((string) $request->ip()),
                'first_seen_at' => now(),
            ]);

            if ($inserted > 0) {
                Cache::forget(self::CACHE_KEY);
            }
        }

        return response()->json(['visits' => $this->total()]);
    }

    private function total(): int
    {
        return (int) Cache::remember(
            self::CACHE_KEY,
            self::CACHE_TTL,
            fn () => SiteVisitor::query()->count()
        );
    }

    private function isBot(Request $request): bool
    {
        $ua = (string) $request->userAgent();

        return $ua === '' || preg_match(self::BOT_PATTERN, $ua) === 1;
    }

    /**
     * HMAC-SHA256 de la IP con APP_KEY: sirve para deduplicar, no permite
     * recuperar la IP. En IPv6 se hashea solo el prefijo /64 (lo que recibe un
     * hogar/dispositivo): sin esto, quien rota su sufijo de 64 bits se contaría
     * como miles de visitantes distintos.
     */
    private function hashIp(string $ip): string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $packed = inet_pton($ip);
            if ($packed !== false) {
                $ip = bin2hex(substr($packed, 0, 8));
            }
        }

        return hash_hmac('sha256', $ip, (string) config('app.key'));
    }
}
