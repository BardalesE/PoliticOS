<?php

namespace App\Services\Embeddings;

/** Swap de driver de embeddings por config/ingest.php (embeddings.driver), sin tocar callers. */
class TextEmbedderFactory
{
    public static function make(): TextEmbedder
    {
        $driver = config('ingest.embeddings.driver', 'gemini');

        return match ($driver) {
            'gemini' => new GeminiTextEmbedder(),
            default  => throw new \RuntimeException("Driver de embeddings desconocido: {$driver}"),
        };
    }
}
