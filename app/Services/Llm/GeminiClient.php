<?php

namespace App\Services\Llm;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Cliente Gemini mínimo para generación de texto con JSON estricto (no
 * embeddings — ver App\Services\Embeddings\GeminiTextEmbedder para eso).
 * Usado por GeminiLongContextAnalyzer (análisis de "lectura única" de planes
 * de gobierno, modo INGEST_ANALYSIS_MODE=single_pass_gemini). Aislado de
 * CivicAIService a propósito, mismo criterio que GroqClient — ver CLAUDE.md
 * "No modificar CivicAIService ni los prompts sin probar contra el flujo
 * completo".
 *
 * El 429 se reintenta DENTRO de esta llamada (sleep + backoff respetando
 * Retry-After), a diferencia de MapDocumentChunkJob/GroqThrottler: aquí no
 * hay cientos de jobs en paralelo que puedan pisarse el presupuesto, son 1-4
 * llamadas por documento dentro de un único job síncrono.
 */
class GeminiClient
{
    public function __construct(
        private readonly ?string $apiKey = null,
        private readonly ?string $baseUrl = null,
        private readonly ?int $maxRetries = null,
    ) {
    }

    /**
     * @return array{data: array, tokens: int}
     * @throws \RuntimeException si Gemini no devuelve JSON válido, o si se agotan los reintentos de 429.
     */
    public function completeJson(string $systemPrompt, string $userPrompt, string $model, int $maxOutputTokens = 8192, float $temperature = 0.2): array
    {
        $key = $this->apiKey ?? config('ingest.single_pass.api_key');
        if (!$key) {
            throw new \RuntimeException('GEMINI_API_KEY no configurada.');
        }

        $base       = $this->baseUrl ?? (string) config('ingest.single_pass.base_url');
        $maxRetries = $this->maxRetries ?? (int) config('ingest.single_pass.max_retries', 5);

        $body = [
            'system_instruction' => ['parts' => [['text' => $systemPrompt]]],
            'contents'           => [['role' => 'user', 'parts' => [['text' => $userPrompt]]]],
            'generationConfig'   => [
                'temperature'      => $temperature,
                'maxOutputTokens'  => $maxOutputTokens,
                'responseMimeType' => 'application/json',
            ],
        ];

        $attempt = 0;
        while (true) {
            $response = Http::timeout(180)->post("{$base}/models/{$model}:generateContent?key={$key}", $body);

            if ($response->status() === 429) {
                $attempt++;
                if ($attempt > $maxRetries) {
                    throw new \RuntimeException('Gemini: límite de tasa (429) agotado tras ' . $maxRetries . ' reintentos.');
                }
                sleep($this->retryAfterFrom($response));
                continue;
            }

            if ($response->failed()) {
                throw new \RuntimeException("Gemini HTTP {$response->status()}: " . mb_substr($response->body(), 0, 300));
            }

            $text    = (string) $response->json('candidates.0.content.parts.0.text');
            $decoded = json_decode($text, true);

            if (!is_array($decoded)) {
                throw new \RuntimeException('Gemini no devolvió un JSON válido: ' . mb_substr($text, 0, 200));
            }

            return [
                'data'   => $decoded,
                'tokens' => (int) ($response->json('usageMetadata.totalTokenCount') ?? 0),
            ];
        }
    }

    /** Google no siempre manda el header Retry-After; si falta, cae al RetryInfo.retryDelay ("21s") del body del error, y si tampoco está, un default conservador. */
    private function retryAfterFrom(Response $response): int
    {
        $header = $response->header('Retry-After');
        if (is_numeric($header)) {
            return max(1, (int) $header);
        }

        $details = (array) ($response->json('error.details') ?? []);
        foreach ($details as $detail) {
            $delay = $detail['retryDelay'] ?? null;
            if (is_string($delay) && preg_match('/(\d+)/', $delay, $m)) {
                return max(1, (int) $m[1]);
            }
        }

        return 30;
    }
}
