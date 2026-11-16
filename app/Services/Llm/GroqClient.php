<?php

namespace App\Services\Llm;

use App\Models\AiSetting;
use Illuminate\Support\Facades\Http;

/**
 * Cliente Groq mínimo para el pipeline MAP/REDUCE (JSON estricto), aislado de
 * CivicAIService a propósito — ver CLAUDE.md "No modificar CivicAIService ni
 * los prompts sin probar contra el flujo completo". No comparte código con el
 * chat: distinto llamador, distinto contrato (completeJson, no streaming).
 */
class GroqClient
{
    public function __construct(
        private readonly ?string $apiKey = null,
    ) {
    }

    /**
     * @return array{data: array, tokens: int}
     * @throws GroqRateLimitException en 429 (retryAfter ya resuelto del header).
     * @throws \RuntimeException en cualquier otro fallo (HTTP o JSON inválido).
     */
    public function completeJson(string $systemPrompt, string $userPrompt, string $model, int $maxTokens = 2000): array
    {
        $key = $this->apiKey ?? config('services.ai.groq_key');
        if (!$key) {
            throw new \RuntimeException('GROQ_API_KEY no configurada.');
        }

        $response = Http::timeout(60)->withToken($key)->post(
            'https://api.groq.com/openai/v1/chat/completions',
            [
                'model'           => AiSetting::effectiveGroqModel($model),
                'messages'        => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
                'temperature'     => 0.2,
                'max_tokens'      => $maxTokens,
                'response_format' => ['type' => 'json_object'],
            ]
        );

        if ($response->status() === 429) {
            $retryAfter = (int) ($response->header('Retry-After') ?: 30);
            throw new GroqRateLimitException(max(1, $retryAfter));
        }

        if ($response->failed()) {
            throw new \RuntimeException("Groq HTTP {$response->status()}: " . mb_substr($response->body(), 0, 300));
        }

        $content = (string) $response->json('choices.0.message.content');
        $decoded = json_decode($content, true);

        if (!is_array($decoded)) {
            throw new \RuntimeException('Groq no devolvió un JSON válido: ' . mb_substr($content, 0, 200));
        }

        return [
            'data'   => $decoded,
            'tokens' => (int) ($response->json('usage.total_tokens') ?? 0),
        ];
    }
}
