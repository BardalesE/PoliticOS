<?php

namespace App\Services\Embeddings;

/**
 * Contrato para proveedores de embeddings reales (a diferencia de
 * EmbeddingsServiceInterface, que es el RAG léxico/FULLTEXT existente — no
 * tocar, sigue sirviendo el chat actual). Implementación activa: Gemini.
 * Swap de driver en config/ingest.php → embeddings.driver.
 */
interface TextEmbedder
{
    /**
     * @param array<int, string> $texts
     * @return array<int, array<float>> un vector por texto, mismo orden y cantidad que $texts.
     */
    public function embed(array $texts): array;

    public function dimensions(): int;
}
