<?php

namespace App\Services\Llm;

use Illuminate\Support\Facades\Cache;

/**
 * Throttling de requests/min y tokens/min contra Groq, compartido entre todos
 * los jobs MAP de un mismo tenant (ventana deslizante en caché). Pensado para
 * el plan gratuito de Groq: evita que decenas de jobs en paralelo disparen
 * 429 en bloque — cada job que no entra en el presupuesto se reprograma con
 * release() en vez de llamar a la API.
 */
class GroqThrottler
{
    public function __construct(
        private readonly int $requestsPerMinute,
        private readonly int $tokensPerMinute,
    ) {
    }

    /** @return array{allowed: bool, retry_after: int} */
    public function tryAcquire(string $key, int $estimatedTokens): array
    {
        $cacheKey = "groq_throttle:{$key}";
        $now      = microtime(true);
        $window   = Cache::get($cacheKey, []);

        // Poda entradas de hace más de 60s (ventana deslizante).
        $window = array_values(array_filter($window, fn ($e) => $now - $e['t'] < 60));

        $requests = count($window);
        $tokens   = array_sum(array_column($window, 'tokens'));

        if ($requests >= $this->requestsPerMinute || $tokens + $estimatedTokens > $this->tokensPerMinute) {
            $oldest     = $window[0]['t'] ?? $now;
            $retryAfter = max(1, (int) ceil(60 - ($now - $oldest)));

            return ['allowed' => false, 'retry_after' => $retryAfter];
        }

        $window[] = ['t' => $now, 'tokens' => $estimatedTokens];
        Cache::put($cacheKey, $window, 65);

        return ['allowed' => true, 'retry_after' => 0];
    }
}
