<?php

namespace App\Services\Embeddings;

/**
 * Empaquetado binario (BLOB float32) y similitud coseno en PHP para los
 * embeddings de document_sections/document_faqs. Sin Qdrant: la búsqueda
 * semántica de la Fase 2 compara en PHP, acotada siempre por candidate_id
 * (nunca un scan global entre tenants/candidatos).
 */
class CosineSimilarity
{
    public static function pack(array $vector): string
    {
        return pack('f*', ...$vector);
    }

    /** @return array<float> */
    public static function unpack(string $blob): array
    {
        return array_values(unpack('f*', $blob));
    }

    public static function similarity(array $a, array $b): float
    {
        $n = min(count($a), count($b));
        if ($n === 0) {
            return 0.0;
        }

        $dot = 0.0;
        $normA = 0.0;
        $normB = 0.0;
        for ($i = 0; $i < $n; $i++) {
            $dot   += $a[$i] * $b[$i];
            $normA += $a[$i] * $a[$i];
            $normB += $b[$i] * $b[$i];
        }

        if ($normA <= 0.0 || $normB <= 0.0) {
            return 0.0;
        }

        return $dot / (sqrt($normA) * sqrt($normB));
    }
}
