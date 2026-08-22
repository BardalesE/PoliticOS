<?php

namespace App\Http\Middleware;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rate limit por sesión de chat, no por IP (feat/cuotas-ia). Reemplaza el
 * `throttle:30,1,chat` que había en routes/api.php: ese limitaba por IP
 * (comportamiento por defecto de Laravel para requests sin usuario
 * autenticado), evadible con cualquier proxy/VPN y que además castigaba
 * parejo a todos los usuarios detrás de un mismo NAT/red compartida — un
 * problema real en un chat público de campaña (cabinas de internet, wifi de
 * universidad, redes móviles con IP compartida).
 *
 * Dos límites propios de la sesión de chat:
 *   - 30 mensajes / hora — ventana deslizante vía RateLimiter (cache "array"
 *     en tests, el store configurado en CACHE_STORE en producción).
 *   - 10 mensajes de por vida en la sesión — NO es una ventana de tiempo,
 *     es un tope acumulado; no cabe en RateLimiter, se cuenta directo de
 *     ChatMessage (mismo criterio que ChatController::$priorCount).
 *
 * La clave es el session_id que manda el cliente. En el PRIMER mensaje de
 * una sesión nueva el cliente todavía no tiene uno (lo crea recién el
 * servidor en ChatController::resolveSession) — para ese caso puntual, donde
 * el conteo siempre es 0 y ningún límite puede dispararse, se cae a la
 * cookie de visitante (politicos_visitor_id, ver ChatController::
 * jsonChatResponse) y en último caso a la IP.
 */
class ThrottleChatBySession
{
    private const MAX_PER_HOUR    = 30;
    private const MAX_PER_SESSION = 10;
    private const HOUR_SECONDS    = 3600;

    public function handle(Request $request, Closure $next): Response
    {
        $key       = $this->resolveKey($request);
        $hourlyKey = "chat-session-hourly:{$key}";

        if (RateLimiter::tooManyAttempts($hourlyKey, self::MAX_PER_HOUR)) {
            return $this->tooManyRequests(
                'Demasiados mensajes en poco tiempo. Espera unos minutos e intenta de nuevo.',
                RateLimiter::availableIn($hourlyKey)
            );
        }

        $sessionId = (string) $request->input('session_id', '');
        if ($sessionId !== '' && $this->lifetimeCount($sessionId) >= self::MAX_PER_SESSION) {
            return $this->tooManyRequests(
                'Esta conversación alcanzó su límite de mensajes. Escribe "hola" para empezar una nueva.'
            );
        }

        RateLimiter::hit($hourlyKey, self::HOUR_SECONDS);

        return $next($request);
    }

    private function resolveKey(Request $request): string
    {
        $sessionId = $request->input('session_id');
        if (!empty($sessionId)) {
            return "session:{$sessionId}";
        }

        $visitor = $request->cookie('politicos_visitor_id');
        if (!empty($visitor)) {
            return "visitor:{$visitor}";
        }

        return "ip:{$request->ip()}";
    }

    private function lifetimeCount(string $sessionId): int
    {
        $session = ChatSession::where('session_id', $sessionId)->first();
        if (!$session) {
            return 0;
        }

        return ChatMessage::where('session_id', $session->id)
            ->where('role', 'user')
            ->count();
    }

    private function tooManyRequests(string $message, ?int $retryAfterSeconds = null): Response
    {
        $response = response()->json(['message' => $message], 429);
        if ($retryAfterSeconds !== null) {
            $response->headers->set('Retry-After', (string) $retryAfterSeconds);
        }
        return $response;
    }
}
