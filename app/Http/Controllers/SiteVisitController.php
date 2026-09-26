<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\SiteVisitor;
use App\Services\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Contadores públicos de la home de la plataforma.
 *
 *   GET  /api/site-visits  → { visits, unique, questions }
 *   POST /api/site-visits  → cuenta esta vista y devuelve lo mismo
 *
 *   visits    = VISTAS: cada vez que alguien abre la home (como TikTok). Un mismo
 *               dispositivo suma otra vista pasados VIEW_COOLDOWN segundos, así
 *               volver más tarde cuenta, pero recargar sin parar no.
 *   unique    = visitantes únicos por IP (el contador anterior; se conserva).
 *   questions = preguntas respondidas por la IA en toda la plataforma.
 *
 * La vista se registra desde el NAVEGADOR (POST directo al API), no desde el
 * render de Next.js: si no, todas llegarían con la IP de Vercel. Los crawlers que
 * no ejecutan JavaScript tampoco cuentan.
 */
class SiteVisitController extends Controller
{
    private const VIEW_COOLDOWN = 30;   // segundos entre vistas del mismo dispositivo
    private const UNIQUE_TTL    = 15;   // caché del COUNT(*) de únicos
    private const QUESTIONS_TTL = 300;  // caché del conteo de preguntas (recorre tenants)

    /** User-Agents que nunca cuentan como visita de ciudadano. */
    private const BOT_PATTERN = '/bot|crawl|spider|slurp|preview|headless|monitor|uptime|curl|wget|python-requests|axios|node-fetch|go-http/i';

    public function show(): JsonResponse
    {
        return response()->json($this->payload());
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isBot($request)) {
            $ipHash = $this->hashIp((string) $request->ip());

            // Visitante único (como antes): atómico sobre el índice único.
            $inserted = SiteVisitor::query()->insertOrIgnore([
                'ip_hash'       => $ipHash,
                'first_seen_at' => now(),
            ]);
            if ($inserted > 0) {
                Cache::forget('site_visits:total');
            }

            // Vista: IP + navegador, para no mezclar dos celulares detrás de la misma IP
            // (CGNAT de los operadores móviles). Cache::add es atómico: solo el primero
            // dentro de la ventana suma.
            $device = substr(hash('sha256', $ipHash . '|' . (string) $request->userAgent()), 0, 32);
            if (Cache::add("site_views:cooldown:{$device}", 1, self::VIEW_COOLDOWN)) {
                DB::connection('central')->table('site_counters')
                    ->where('name', 'views')
                    ->update(['total' => DB::raw('total + 1'), 'updated_at' => now()]);
            }
        }

        return response()->json($this->payload());
    }

    private function payload(): array
    {
        return [
            'visits'    => $this->views(),
            'unique'    => $this->unique(),
            'questions' => $this->questions(),
        ];
    }

    private function views(): int
    {
        return (int) (DB::connection('central')->table('site_counters')->where('name', 'views')->value('total') ?? 0);
    }

    private function unique(): int
    {
        return (int) Cache::remember('site_visits:total', self::UNIQUE_TTL, fn () => SiteVisitor::query()->count());
    }

    /** Respuestas de la IA en todos los tenants (sin las de "descanso" por fallo). */
    private function questions(): int
    {
        return (int) Cache::remember('site_stats:questions', self::QUESTIONS_TTL, function () {
            $total = 0;
            TenantContext::forEachTenant(function (?string $slug) use (&$total) {
                try {
                    $total += (int) TenantContext::run($slug, fn () => ChatMessage::query()
                        ->where('role', 'assistant')
                        ->where('is_fallback', false)
                        ->count());
                } catch (\Throwable) {
                    // Un tenant caído no debe tumbar el contador de la home.
                }
            });
            return $total;
        });
    }

    private function isBot(Request $request): bool
    {
        $ua = (string) $request->userAgent();

        return $ua === '' || preg_match(self::BOT_PATTERN, $ua) === 1;
    }

    /**
     * HMAC-SHA256 de la IP con APP_KEY: sirve para deduplicar, no permite
     * recuperar la IP. En IPv6 se hashea solo el prefijo /64.
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
