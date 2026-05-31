<?php

namespace App\Services;

/**
 * Interfaz para drivers de embeddings/búsqueda semántica.
 *
 * Implementaciones actuales:
 *   - MySQLFulltextEmbeddings  (default, sin infra extra)
 *   - QdrantEmbeddings         (cuando se levante el container Qdrant)
 *
 * Swap se hace en config/services.php → ai.embeddings_driver
 */
interface EmbeddingsServiceInterface
{
    /**
     * Indexa un documento (chunks + embeddings si aplica).
     *
     * @param int    $documentId
     * @param string $content
     * @param array  $metadata  ['topic' => ..., 'title' => ..., ...]
     */
    public function index(int $documentId, string $content, array $metadata = []): void;

    /**
     * Búsqueda semántica.
     *
     * @return array  [['document_id'=>..., 'excerpt'=>..., 'score'=>..., 'metadata'=>...], ...]
     */
    public function search(string $query, int $topK = 5, array $filter = []): array;

    /**
     * Borra los chunks/vectores de un documento.
     */
    public function delete(int $documentId): void;
}
