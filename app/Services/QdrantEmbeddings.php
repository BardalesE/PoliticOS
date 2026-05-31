<?php

namespace App\Services;

use App\Models\KnowledgeDocument;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Driver de RAG con Qdrant (vector store) + OpenAI embeddings.
 *
 * Para activarlo:
 *   1. docker compose up qdrant  (ver ingest/docker-compose.yml)
 *   2. .env:
 *        AI_EMBEDDINGS_DRIVER=qdrant
 *        QDRANT_URL=http://localhost:6333
 *        QDRANT_API_KEY=optional
 *        OPENAI_API_KEY=sk-...
 *        EMBEDDINGS_MODEL=text-embedding-3-small
 *   3. php artisan tinker → reindexar: KnowledgeDocument::all()->each(fn($d) => app(QdrantEmbeddings::class)->index($d->id, $d->content));
 *
 * Modelo recomendado para español: text-embedding-3-small (dim=1536, ~$0.02/1M tokens).
 * Alternativa open-source: BGE-M3 self-hosted via Ollama.
 */
class QdrantEmbeddings implements EmbeddingsServiceInterface
{
    private string $qdrantUrl;
    private ?string $qdrantKey;
    private string $openaiKey;
    private string $model;
    private int $dim;
    private string $collection;

    public function __construct()
    {
        $this->qdrantUrl  = rtrim(config('services.qdrant.url', 'http://localhost:6333'), '/');
        $this->qdrantKey  = config('services.qdrant.api_key');
        $this->openaiKey  = config('services.ai.openai_key');
        $this->model      = config('services.ai.embeddings_model', 'text-embedding-3-small');
        $this->dim        = config('services.ai.embeddings_dim', 1536);
        $tenantSlug       = app()->bound('tenant') ? app('tenant')->slug : 'default';
        $this->collection = "politicos_{$tenantSlug}_docs";
    }

    public function index(int $documentId, string $content, array $metadata = []): void
    {
        $this->ensureCollection();

        $chunks = $this->chunk($content, 500, 50);
        $points = [];
        $vectorIds = [];

        foreach ($chunks as $idx => $chunk) {
            $embedding = $this->embed($chunk['text']);
            if (!$embedding) continue;

            $pointId = (int) ($documentId * 100000 + $idx);
            $vectorIds[] = $pointId;
            $points[] = [
                'id' => $pointId,
                'vector' => $embedding,
                'payload' => array_merge($metadata, [
                    'document_id' => $documentId,
                    'chunk_index' => $idx,
                    'text' => $chunk['text'],
                ]),
            ];

            // Batch de 50 puntos por request
            if (count($points) >= 50) {
                $this->upsert($points);
                $points = [];
            }
        }

        if (!empty($points)) {
            $this->upsert($points);
        }

        KnowledgeDocument::where('id', $documentId)->update([
            'chunks' => $chunks,
            'embeddings_indexed' => true,
            'embeddings_meta' => [
                'provider' => 'qdrant',
                'model' => $this->model,
                'collection' => $this->collection,
                'vector_ids' => $vectorIds,
                'indexed_at' => now()->toIso8601String(),
            ],
        ]);
    }

    public function search(string $query, int $topK = 5, array $filter = []): array
    {
        $embedding = $this->embed($query);
        if (!$embedding) return [];

        $body = [
            'vector' => $embedding,
            'limit' => $topK,
            'with_payload' => true,
        ];

        // Filtro Qdrant si hay topic
        if (!empty($filter['topic'])) {
            $body['filter'] = [
                'must' => [
                    ['key' => 'topic', 'match' => ['value' => $filter['topic']]],
                ],
            ];
        }

        try {
            $r = Http::timeout(10)
                ->withHeaders($this->qdrantKey ? ['api-key' => $this->qdrantKey] : [])
                ->post("{$this->qdrantUrl}/collections/{$this->collection}/points/search", $body);

            if (!$r->ok()) {
                Log::warning('Qdrant search failed', ['status'=>$r->status(),'body'=>$r->body()]);
                return [];
            }

            $results = $r->json('result', []);
        } catch (\Throwable $e) {
            Log::error('Qdrant search exception', ['error'=>$e->getMessage()]);
            return [];
        }

        return array_map(fn($hit) => [
            'document_id' => $hit['payload']['document_id'] ?? null,
            'title'       => $hit['payload']['title'] ?? '',
            'excerpt'     => $hit['payload']['text'] ?? '',
            'score'       => (float) ($hit['score'] ?? 0),
            'metadata'    => $hit['payload'] ?? [],
        ], $results);
    }

    public function delete(int $documentId): void
    {
        $doc = KnowledgeDocument::find($documentId);
        if (!$doc || empty($doc->embeddings_meta['vector_ids'])) return;

        try {
            Http::timeout(10)
                ->withHeaders($this->qdrantKey ? ['api-key' => $this->qdrantKey] : [])
                ->post("{$this->qdrantUrl}/collections/{$this->collection}/points/delete", [
                    'points' => $doc->embeddings_meta['vector_ids'],
                ]);
        } catch (\Throwable $e) {
            Log::warning('Qdrant delete failed', ['error'=>$e->getMessage()]);
        }
    }

    // ─── Helpers privados ─────────────────────────────────────────────────

    private function embed(string $text): ?array
    {
        try {
            $r = Http::timeout(15)
                ->withToken($this->openaiKey)
                ->post('https://api.openai.com/v1/embeddings', [
                    'input' => mb_substr($text, 0, 8000),
                    'model' => $this->model,
                ]);

            if (!$r->ok()) {
                Log::warning('OpenAI embedding failed', ['status'=>$r->status()]);
                return null;
            }
            return $r->json('data.0.embedding');
        } catch (\Throwable $e) {
            Log::error('Embedding exception', ['error'=>$e->getMessage()]);
            return null;
        }
    }

    private function ensureCollection(): void
    {
        $headers = $this->qdrantKey ? ['api-key' => $this->qdrantKey] : [];
        try {
            $r = Http::timeout(5)->withHeaders($headers)
                ->get("{$this->qdrantUrl}/collections/{$this->collection}");

            if ($r->status() === 404) {
                Http::timeout(10)->withHeaders($headers)
                    ->put("{$this->qdrantUrl}/collections/{$this->collection}", [
                        'vectors' => [
                            'size' => $this->dim,
                            'distance' => 'Cosine',
                        ],
                    ]);
            }
        } catch (\Throwable $e) {
            Log::warning('Qdrant ensureCollection failed', ['error'=>$e->getMessage()]);
        }
    }

    private function upsert(array $points): void
    {
        try {
            $headers = $this->qdrantKey ? ['api-key' => $this->qdrantKey] : [];
            Http::timeout(15)->withHeaders($headers)
                ->put("{$this->qdrantUrl}/collections/{$this->collection}/points?wait=false", [
                    'points' => $points,
                ]);
        } catch (\Throwable $e) {
            Log::warning('Qdrant upsert failed', ['error'=>$e->getMessage()]);
        }
    }

    private function chunk(string $text, int $size, int $overlap): array
    {
        $words = preg_split('/\s+/', trim($text));
        $chunks = [];
        $i = 0;
        while ($i < count($words)) {
            $slice = array_slice($words, $i, $size);
            $chunks[] = [
                'text' => implode(' ', $slice),
                'word_start' => $i,
                'word_end' => $i + count($slice),
            ];
            $i += $size - $overlap;
        }
        return $chunks;
    }
}
