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
            'excerpt'     => $this->extractExcerpt($d->content, $query, 1200, (string) $d->title),
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

    /**
     * Palabras de la pregunta que NO indican tema: piden "propuestas" o "el plan"
     * pero no dicen de qué. Solo se ignoran al elegir la ventana (no al buscar).
     */
    private const GENERIC_QUERY_WORDS = [
        'propone','proponen','proponer','propuesta','propuestas','plan','planes',
        'gobierno','candidato','candidata','alcalde','alcaldia','alcaldía','distrito',
        'dice','dicen','piensa','planea','plantea','plantean','quiere','hara','hará',
        'ciudadano','ciudadana','ciudadanos','ciudadanas','documento','documentos','informacion','información','favor','puedes','podrias',
    ];

    /**
     * Familias de términos: "agricultura" no aparece en un plan que habla de
     * "actividad agropecuaria", "canal de riego" y "productores". FULLTEXT no
     * tiene stemming ni sinónimos, así que la elección de ventana expande el
     * tema de la pregunta a su vocabulario habitual (prefijos, sin acentos).
     */
    private const TERM_FAMILIES = [
        'agri'      => ['agricu','agricol','agrope','riego','cultivo','productor','ganad','cosecha','campo','agrari','pastos','reservorio','irrigac'],
        'agro'      => ['agricu','agricol','agrope','riego','cultivo','productor','ganad','cosecha','agrari','irrigac'],
        'ganad'     => ['ganad','pecuari','pastos','crianza','veterinar'],
        'riego'     => ['riego','irrigac','canal','reservorio','agua'],
        'salud'     => ['salud','hospital','posta','centro de salud','medic','enfermer','esalud','sis '],
        'hospital'  => ['salud','hospital','posta','medic','enfermer'],
        'educa'     => ['educa','colegio','escuela','docente','maestro','aprendizaje','estudiante','institucion educativa'],
        'colegio'   => ['educa','colegio','escuela','docente','maestro','estudiante'],
        'segur'     => ['segur','serenazgo','policia','delincu','robo','cameras','camaras','vigilancia','ronda'],
        'delincu'   => ['segur','serenazgo','policia','delincu','robo','camaras','vigilancia'],
        'agua'      => ['agua','desague','saneamiento','alcantarillado','potable','reservorio'],
        'saneam'    => ['agua','desague','saneamiento','alcantarillado','potable'],
        'empleo'    => ['empleo','trabajo','laboral','emprend','mype','ingreso'],
        'trabajo'   => ['empleo','trabajo','laboral','emprend','mype','ingreso'],
        'carreter'  => ['carreter','trocha','via ','vias','camino','pista','asfalt','pavimento','vial'],
        'pista'     => ['carreter','trocha','vias','camino','pista','asfalt','pavimento','vial'],
        'turism'    => ['turism','turista','atractivo','patrimonio','cultural'],
        'ambient'   => ['ambient','residuos','basura','contaminac','reciclaj','relleno'],
        'basura'    => ['ambient','residuos','basura','reciclaj','relleno'],
    ];

    /** minúsculas + sin tildes: para comparar "agrícola" con "agricola". */
    private function fold(string $s): string
    {
        $s = mb_strtolower($s);

        return strtr($s, ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n']);
    }

    /**
     * Grupos de términos a buscar en el documento. Cada grupo cuenta UNA vez por
     * ventana, y se expande con su familia temática si la tiene.
     *
     * @return array<int, array<int,string>>  lista de grupos (cada grupo = prefijos equivalentes)
     */
    private function queryTermGroups(string $query, string $title): array
    {
        $titleFolded = $this->fold($title);

        $build = function (bool $dropTitleAndGeneric) use ($query, $titleFolded): array {
            $groups = [];
            foreach ($this->splitQueryWords($query) as $w) {
                $f = $this->fold($w);
                if ($dropTitleAndGeneric) {
                    if (in_array($f, array_map([$this, 'fold'], self::GENERIC_QUERY_WORDS), true)) continue;
                    // Palabras del título = identidad del documento (nombre del candidato,
                    // "plan de gobierno"): aparecen en todas partes y no orientan al tema.
                    if ($titleFolded !== '' && str_contains($titleFolded, $f)) continue;
                }
                $stem   = mb_strlen($f) >= 7 ? mb_substr($f, 0, 6) : $f;
                $group  = [$stem];
                foreach (self::TERM_FAMILIES as $key => $family) {
                    if (str_starts_with($f, $key)) {
                        $group = array_merge($group, $family);
                        break;
                    }
                }
                $groups[] = array_values(array_unique($group));
            }
            return $groups;
        };

        return $build(true) ?: $build(false);
    }

    /**
     * Elige la ventana de $windowSize caracteres más relevante para la pregunta.
     *
     * Antes puntuaba por "cuántas palabras distintas de la consulta caen en la
     * ventana", tratando igual "Gregorio" (49 veces en un plan de San Gregorio)
     * que "agricultura" (1 vez): ganaba siempre la portada, donde coinciden el
     * nombre del candidato y el distrito, y el LLM respondía "no encuentro nada
     * sobre agricultura" teniendo un canal de riego en el propio plan.
     *
     * Ahora: (1) se ignoran las palabras del título y las genéricas ("propone");
     * (2) cada término se pondera por rareza dentro del documento; (3) se
     * expande el tema a su vocabulario (agricultura → agropecuaria, riego...);
     * (4) se premia la densidad de aciertos dentro de la ventana.
     */
    private function extractExcerpt(?string $content, string $query, int $windowSize = 1200, string $title = ''): string
    {
        if (!$content) return '';

        $groups = $this->queryTermGroups($query, $title);

        if (empty($groups)) {
            return mb_substr($content, 0, $windowSize);
        }

        $folded = $this->fold($content);
        $len    = mb_strlen($folded);

        // Posiciones de cada grupo (todas sus variantes) en el documento.
        $positions = [];   // list of [pos, groupIdx]
        $totals    = array_fill(0, count($groups), 0);
        foreach ($groups as $gi => $variants) {
            foreach ($variants as $v) {
                $offset = 0;
                while (($pos = mb_strpos($folded, $v, $offset)) !== false) {
                    $positions[] = [$pos, $gi];
                    $totals[$gi]++;
                    $offset = $pos + max(1, mb_strlen($v));
                    if ($offset >= $len) break;
                }
            }
        }

        if (empty($positions)) {
            return mb_substr($content, 0, $windowSize);
        }

        usort($positions, fn ($a, $b) => $a[0] <=> $b[0]);

        // Peso por rareza: un término que aparece 49 veces orienta poco.
        $weights = array_map(fn ($t) => $t > 0 ? 1 / log(2 + $t) : 0.0, $totals);

        $lookback  = (int) ($windowSize * 0.2);
        $bestStart = 0;
        $bestScore = -1.0;
        $lastStart = -1;
        foreach ($positions as [$pos]) {
            $start = max(0, $pos - $lookback);
            if ($start === $lastStart) continue;
            $lastStart = $start;
            $end = $start + $windowSize;

            $hits = [];
            foreach ($positions as [$p, $gi]) {
                if ($p >= $start && $p < $end) {
                    $hits[$gi] = ($hits[$gi] ?? 0) + 1;
                }
                if ($p >= $end) break;
            }

            $score = 0.0;
            foreach ($hits as $gi => $h) {
                $score += $weights[$gi] * (1 + log($h));
            }
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
            'excerpt'     => $this->extractExcerpt($d->content, $query, 1200, (string) $d->title),
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
