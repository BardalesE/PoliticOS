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
            $docs = $this->runFulltextQuery($cleanQuery, $topK, $filter);

            // Filtro de topic duro → si no hay resultados, reintenta sin filtro
            // de topic (boost, no filtro excluyente). Sin esto, un topic mal
            // asignado en los KnowledgeDocument del tenant (o simplemente
            // topic=null, que es válido) deja el RAG vacío en silencio y el
            // modelo responde solo con el system prompt — máxima genericidad.
            if ($docs->isEmpty() && !empty($filter['topic'])) {
                $docs = $this->runFulltextQuery($cleanQuery, $topK, ['candidate_id' => $filter['candidate_id'] ?? null]);
            }
        } catch (\Throwable $e) {
            Log::warning('FULLTEXT search failed, falling back to LIKE', ['error'=>$e->getMessage()]);
            return $this->fallbackLike($query, $topK, $filter);
        }

        return $docs->map(fn($d) => [
            'document_id' => $d->id,
            'title'       => $d->title,
            'excerpt'     => $this->extractExcerpt($d->content, $query),
            'score'       => (float) $d->relevance,
            'metadata'    => $this->docMetadata($d),
        ])->all();
    }

    private function runFulltextQuery(string $cleanQuery, int $topK, array $filter)
    {
        $q = KnowledgeDocument::query()
            ->select('id','title','content','topic','file_url','candidate_id','source_url','source_type')
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
        if (!empty($filter['candidate_id'])) {
            $q->where('candidate_id', $filter['candidate_id']);
        }

        return $q->get();
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

    // Stopwords en español: la stoplist por defecto de InnoDB FULLTEXT es solo
    // en inglés, así que "para", "como", "cuál", "tiene" pesan como términos
    // reales y diluyen tanto el ranking de MySQL como la selección de ventana
    // en extractExcerpt(). Filtradas aquí en vez de vía tabla de stopwords de
    // InnoDB (innodb_ft_server_stopword_table) porque esa vía requiere
    // privilegios de servidor y reconstruir el índice — no garantizado en un
    // MySQL gestionado (Aiven en producción, ver render.yaml).
    private const SPANISH_STOPWORDS = [
        'que','los','las','por','para','con','una','uno','unos','unas','del','como',
        'más','pero','sus','este','esta','esto','estos','estas','ese','esa','eso',
        'esos','esas','también','cuando','donde','dónde','desde','todos','todas',
        'todo','toda','otros','otras','otro','otra','cual','cuál','cuáles','cuánto',
        'cuánta','cuántos','cuántas','tiene','tienen','tener','hacer','hace','hizo',
        'sobre','entre','hasta','porque','muy','sin','son','está','están','estás',
        'estoy','estamos','estáis','sido','ser','eres','somos','les','nos','vos',
        'usted','ustedes','nuestro','nuestra','nuestros','nuestras','algún','alguna',
        'algunos','algunas','nada','algo','cómo','qué','quién','quiénes','ahora',
        'antes','después','mientras','aunque','cada','mismo','misma','mismos','mismas',
    ];

    private function normalizeQuery(string $query): string
    {
        // Quitar caracteres especiales que rompen MATCH boolean
        $clean = preg_replace('/[+\-<>~()@*"\']/', ' ', $query);
        $clean = preg_replace('/\s+/', ' ', $clean);
        $words = array_filter(
            explode(' ', trim($clean)),
            fn($w) => mb_strlen($w) > 2 // MySQL ft_min_word_len = 3 por defecto
                && !in_array(mb_strtolower($w), self::SPANISH_STOPWORDS, true)
        );
        return implode(' ', array_slice(array_values($words), 0, 20));
    }

    /**
     * Elige la ventana de $windowSize caracteres con más cobertura de
     * palabras DISTINTAS de la consulta, no la que contiene la primera
     * palabra que aparezca (comportamiento anterior). Con textos largos
     * (plan de gobierno, entrevistas), la primera coincidencia suele caer en
     * la portada/introducción — el modelo recibía siempre el mismo fragmento
     * genérico sin importar la pregunta real.
     */
    /**
     * Divide la consulta en palabras "limpias": separa por cualquier
     * carácter que no sea letra/dígito (así `¿signos!`, `,`, `.`, `?` pegados
     * a la palabra no rompen el match — "seguridad?" nunca hacía match
     * contra "seguridad " en el documento) y descarta stopwords/palabras
     * cortas. Usado tanto por extractExcerpt() como por fallbackLike().
     */
    private function splitQueryWords(string $query, int $minLength = 3): array
    {
        $raw = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($query), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_unique(array_filter(
            $raw,
            fn($w) => mb_strlen($w) > $minLength && !in_array($w, self::SPANISH_STOPWORDS, true)
        )));
    }

    private function extractExcerpt(?string $content, string $query, int $windowSize = 1200): string
    {
        if (!$content) return '';

        $words = $this->splitQueryWords($query);

        if (empty($words)) {
            return mb_substr($content, 0, $windowSize);
        }

        $contentLower = mb_strtolower($content);
        $contentLen   = mb_strlen($contentLower);

        // Todas las posiciones de cada palabra de la consulta en el documento.
        $positions = [];
        foreach ($words as $word) {
            $offset = 0;
            while (($pos = mb_stripos($contentLower, $word, $offset)) !== false) {
                $positions[] = ['pos' => $pos, 'word' => $word];
                $offset = $pos + mb_strlen($word);
                if ($offset >= $contentLen) break;
            }
        }

        if (empty($positions)) {
            return mb_substr($content, 0, $windowSize);
        }

        // Para cada posición candidata, cuenta cuántas palabras distintas de
        // la consulta caen dentro de una ventana centrada ahí, y se queda con
        // la de mayor cobertura (empate → la más temprana en el documento).
        $lookback  = (int) ($windowSize * 0.2);
        $bestStart = 0;
        $bestScore = -1;
        foreach ($positions as $candidate) {
            $start = max(0, $candidate['pos'] - $lookback);
            $end   = $start + $windowSize;
            $covered = [];
            foreach ($positions as $p) {
                if ($p['pos'] >= $start && $p['pos'] < $end) {
                    $covered[$p['word']] = true;
                }
            }
            $score = count($covered);
            if ($score > $bestScore) {
                $bestScore = $score;
                $bestStart = $start;
            }
        }

        return mb_substr($content, $bestStart, $windowSize);
    }

    private function fallbackLike(string $query, int $topK, array $filter): array
    {
        $words = $this->splitQueryWords($query);

        $q = KnowledgeDocument::where('is_active', true)
            ->whereNotNull('content')
            ->where('content', '!=', '')
            ->limit($topK);

        if (!empty($filter['topic'])) {
            $q->where('topic', $filter['topic']);
        }
        if (!empty($filter['candidate_id'])) {
            $q->where('candidate_id', $filter['candidate_id']);
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
            'metadata'    => $this->docMetadata($d),
        ])->all();
    }

    /** Atribución de fuente (Fase 4) — mismo shape que el payload de Qdrant. */
    private function docMetadata(KnowledgeDocument $d): array
    {
        return [
            'topic'        => $d->topic,
            'file_url'     => $d->file_url,
            'candidate_id' => $d->candidate_id,
            'source_url'   => $d->source_url ?: $d->file_url,
            'source_type'  => $d->source_type ?? 'pdf',
        ];
    }
}
