<?php

namespace App\Services\Embeddings;

use Illuminate\Support\Facades\Http;

/**
 * Embeddings vía Gemini API (generativelanguage.googleapis.com), verificado
 * contra la doc oficial de Google (2026): modelo gemini-embedding-001,
 * Matryoshka — admite truncar la dimensión de salida (output_dimensionality)
 * sin reentrenar; 3072 es el máximo, Google recomienda 768/1536/3072.
 *
 * El endpoint :batchEmbedContents reporta 429 erráticos en el tier gratuito
 * incluso bajo cuota (ver discusiones oficiales de Google AI), por eso los
 * lotes son chicos y configurables (batch_size) con backoff exponencial.
 */
class GeminiTextEmbedder implements TextEmbedder
{
    public function __construct(
        private readonly ?string $apiKey = null,
        private readonly ?string $model = null,
        private readonly ?int $dim = null,
        private readonly ?string $baseUrl = null,
        private readonly ?int $batchSize = null,
        private readonly ?int $maxRetries = null,
    ) {
    }

    public function dimensions(): int
    {
        return $this->dim ?? (int) config('ingest.embeddings.gemini.dimensions', 768);
    }

    /** @return array<int, array<float>> */
    public function embed(array $texts): array
    {
        if (empty($texts)) {
            return [];
        }

        $batchSize = $this->batchSize ?? (int) config('ingest.embeddings.gemini.batch_size', 10);
        $out = [];
        foreach (array_chunk($texts, max(1, $batchSize)) as $batch) {
            $out = array_merge($out, $this->embedBatch($batch));
        }

        return $out;
    }

    private function embedBatch(array $texts): array
    {
        $key   = $this->apiKey ?? config('ingest.embeddings.gemini.api_key');
        $model = $this->model ?? (string) config('ingest.embeddings.gemini.model', 'gemini-embedding-001');
        $base  = $this->baseUrl ?? (string) config('ingest.embeddings.gemini.base_url', 'https://generativelanguage.googleapis.com/v1beta');
        $dim   = $this->dimensions();
        $maxRetries = $this->maxRetries ?? (int) config('ingest.embeddings.gemini.max_retries', 5);

        if (!$key) {
            throw new \RuntimeException('GEMINI_API_KEY no configurada.');
        }

        $requests = array_map(fn ($text) => [
            'model'                 => "models/{$model}",
            'content'               => ['parts' => [['text' => $text]]],
            'outputDimensionality'  => $dim,
        ], $texts);

        $attempt = 0;
        while (true) {
            $response = Http::timeout(60)->post(
                "{$base}/models/{$model}:batchEmbedContents?key={$key}",
                ['requests' => $requests]
            );

            if ($response->status() === 429 && $attempt < $maxRetries) {
                $attempt++;
                // Backoff exponencial corto (ms): 300, 600, 1200... tope 10s.
                usleep((int) min(10_000_000, 300_000 * (2 ** $attempt)));
                continue;
            }

            if ($response->failed()) {
                throw new \RuntimeException("Gemini embeddings HTTP {$response->status()}: " . mb_substr($response->body(), 0, 300));
            }

            $embeddings = $response->json('embeddings') ?? [];
            if (count($embeddings) !== count($texts)) {
                throw new \RuntimeException('Gemini embeddings: la cantidad de vectores no coincide con la de textos enviados.');
            }

            return array_map(fn ($e) => array_map('floatval', $e['values'] ?? []), $embeddings);
        }
    }
}
