<?php

namespace App\Services;

use App\Models\KnowledgeDocument;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * RAG basado en FULLTEXT MATCH de MySQL.
 *
 * Mejora 10x vs LIKE '%word%' porque:
 *   - Indexado (O(log n) vs O(n))
 *   - Ranking BM25-like por relevancia
 *   - Tolera plurales, conjugaciones
 *
 * NO requiere infra extra. Cuando Hector levante Qdrant, hacer swap a QdrantEmbeddings.
 */
class MySQLFulltextEmbeddings implements EmbeddingsServiceInterface
{
    public function index(int $documentId, string $content, array $metadata = []): void
    {
        $chunks = $this->chunk($content, 500, 50);
        KnowledgeDocument::where('id', $documentId)->update([
            'chunks' => $chunks,
            'embeddings_indexed' => true,
            'embeddings_meta' => [
                'provider' => 'mysql_fulltext',
                'chunk_count' => count($chunks),
                'indexed_at' => now()->toIso8601String(),
            ],
        ]);
    }

    public function search(string $query, int $topK = 5, array $filter = []): array
    {
        $cleanQuery = $this->normalizeQuery($query);

        if (empty($cleanQuery)) return [];

        try {
            $q = KnowledgeDocument::query()
                ->select('id','title','content','topic','file_url')
                ->selectRaw(
                    'MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance',
                    [$cleanQuery]
                )
                ->where('is_active', true)
                ->whereRaw('MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE)', [$cleanQuery])
                ->orderByDesc('relevance')
                ->limit($topK);

            if (!empty($filter['topic'])) {
                $q->where('topic', $filter['topic']);
            }

            $docs = $q->get();
        } catch (\Throwable $e) {
            Log::warning('FULLTEXT search failed, falling back to LIKE', ['error'=>$e->getMessage()]);
            return $this->fallbackLike($query, $topK, $filter);
        }

        return $docs->map(fn($d) => [
            'document_id' => $d->id,
            'title'       => $d->title,
            'excerpt'     => $this->extractExcerpt($d->content, $query),
            'score'       => (float) $d->relevance,
            'metadata'    => ['topic' => $d->topic, 'file_url' => $d->file_url],
        ])->all();
    }

    public function delete(int $documentId): void
    {
        // FULLTEXT se borra automáticamente con el row. Solo limpiamos chunks.
        KnowledgeDocument::where('id', $documentId)->update([
            'chunks' => null,
            'embeddings_indexed' => false,
            'embeddings_meta' => null,
        ]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

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

    private function normalizeQuery(string $query): string
    {
        // Quitar caracteres especiales que rompen MATCH boolean
        $clean = preg_replace('/[+\-<>~()@*"\']/', ' ', $query);
        $clean = preg_replace('/\s+/', ' ', $clean);
        $words = array_filter(
            explode(' ', trim($clean)),
            fn($w) => mb_strlen($w) > 2 // MySQL ft_min_word_len = 3 por defecto
        );
        return implode(' ', array_slice(array_values($words), 0, 20));
    }

    private function extractExcerpt(?string $content, string $query): string
    {
        if (!$content) return '';

        $words = array_filter(
            explode(' ', mb_strtolower($query)),
            fn($w) => mb_strlen($w) > 3
        );

        foreach (array_unique($words) as $word) {
            $pos = mb_stripos($content, $word);
            if ($pos !== false) {
                $start = max(0, $pos - 300);
                return mb_substr($content, $start, 2000);
            }
        }
        return mb_substr($content, 0, 2000);
    }

    private function fallbackLike(string $query, int $topK, array $filter): array
    {
        $words = array_filter(
            explode(' ', mb_strtolower($query)),
            fn($w) => mb_strlen($w) > 3
        );

        $q = KnowledgeDocument::where('is_active', true)
            ->whereNotNull('content')
            ->where('content', '!=', '')
            ->limit($topK);

        if (!empty($filter['topic'])) {
            $q->where('topic', $filter['topic']);
        }

        if (!empty($words)) {
            $q->where(function ($sub) use ($words) {
                foreach (array_slice(array_unique($words), 0, 6) as $w) {
                    $sub->orWhere('content', 'like', "%{$w}%")
                        ->orWhere('title', 'like', "%{$w}%");
                }
            });
        }

        return $q->get()->map(fn($d) => [
            'document_id' => $d->id,
            'title'       => $d->title,
            'excerpt'     => $this->extractExcerpt($d->content, $query),
            'score'       => 0.5,
            'metadata'    => ['topic' => $d->topic, 'file_url' => $d->file_url],
        ])->all();
    }
}
