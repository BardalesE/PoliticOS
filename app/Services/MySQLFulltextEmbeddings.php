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

        // Chat acotado a un candidato: son pocos documentos, así que no se exige
        // que FULLTEXT los "adivine" por palabras exactas ("agricultura" no está
        // en un plan que dice "actividad agropecuaria"); se buscan las páginas
        // relevantes DENTRO de sus documentos.
        if (!empty($filter['candidate_id'])) {
            return $this->searchWithinCandidate($query, (int) $filter['candidate_id']);
        }

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

        return $this->toExcerpts($docs, $query);
    }

    private function runFulltextQuery(string $cleanQuery, int $topK, array $filter)
    {
        $q = KnowledgeDocument::query()
            ->select('id','title','content','pages','topic','file_url','candidate_id','source_url','source_type')
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
        'resume','resumen','resumir','resumeme','resúmeme','explica','explicame','explícame',
        'cuentame','cuéntame','hablame','háblame','dime','principales','principal','puntos','ideas',
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
        // Hoja de vida (formato JNE): la pregunta dice "estudios"; el documento, "FORMACIÓN ACADÉMICA".
        'estudi'    => ['estudio','formacion academica','universitari','tecnico','posgrado','bachiller','titulo','educacion basica','primari','secundari'],
        'formac'    => ['formacion academica','estudio','universitari','tecnico','posgrado','bachiller','titulo'],
        'profesi'   => ['profesion','ocupacion','oficio','experiencia de trabajo','experiencia laboral','centro de trabajo'],
        'experien'  => ['experiencia de trabajo','experiencia laboral','ocupacion','oficio','profesion','centro de trabajo','cargo'],
        'trabaj'    => ['experiencia de trabajo','experiencia laboral','ocupacion','oficio','centro de trabajo','empleo','trabajo'],
        'trayect'   => ['trayectoria','cargos partidarios','eleccion popular','renuncia','organizacion politica'],
        'sentenc'   => ['sentencia','condenatori','demanda','obligaciones','violencia familiar'],
        'antecede'  => ['sentencia','condenatori','demanda','obligaciones'],
    ];

    /**
     * Palabras que piden un TIPO de documento: "muéstrame su hoja de vida" no trae
     * términos de tema (hoja/vida están en el título y se descartan), así que sin
     * esto ninguna página "hablaba del tema" y el chat respondía que no había
     * hoja de vida teniéndola cargada (bug 2026-09-24).
     */
    private const DOC_TYPE_HINTS = [
        'hoja_de_vida'     => ['hoja de vida','hoja','curricul','cv','trayectoria','estudi','formacion','profesion','experiencia','biografi','quien es','de donde es','sentencia','antecedente','partido'],
        'plan_de_gobierno' => ['plan de gobierno','plan','propuesta','propone','programa'],
    ];

    /** ¿La pregunta pide justamente este documento (por su tema o su título)? */
    private function queryTargetsDocument(string $query, ?string $topic, string $title): bool
    {
        $q = $this->fold($query);
        $t = $this->fold($title);
        foreach (self::DOC_TYPE_HINTS as $docTopic => $hints) {
            $isThisType = $topic === $docTopic || str_contains($t, str_replace('_', ' ', $docTopic));
            if (! $isThisType) continue;
            foreach ($hints as $h) {
                if (str_contains($q, $h)) return true;
            }
        }
        return false;
    }

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
    private function queryTermGroups(string $query, string $title, bool $fallbackToAll = true): array
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

        // Sin términos de tema ("resume el plan"): extractExcerpt() puntúa con todas las
        // palabras; el ranking por páginas prefiere no ordenar y servir el inicio.
        return $build(true) ?: ($fallbackToAll ? $build(false) : []);
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

        return $this->toExcerpts($q->get(), $query);
    }

    /** Máximo de fragmentos que llegan al LLM por turno (presupuesto de tokens). */
    private const MAX_EXCERPTS = 4;
    /** Páginas distintas que puede aportar un mismo documento. */
    private const PAGES_PER_DOC = 2;
    private const EXCERPT_CHARS = 1200;

    /**
     * De documentos a fragmentos citables. Un documento con texto por página
     * (`pages`) aporta sus mejores páginas, cada una con su número; uno sin
     * páginas (subido antes de las citas por página) aporta un fragmento sin
     * número, como antes.
     *
     * Primero entra la mejor página de cada documento (diversidad de fuentes) y
     * con lo que sobre del tope se completa con las siguientes mejores.
     *
     * @param iterable<KnowledgeDocument> $docs
     * @return array<int, array<string, mixed>>
     */
    private function toExcerpts(iterable $docs, string $query, bool $requireHit = false): array
    {
        $primary = [];
        $extra   = [];

        foreach ($docs as $d) {
            $score  = (float) ($d->relevance ?? 0.5);
            $pages  = is_array($d->pages) ? array_values($d->pages) : [];
            // null = no se puede ordenar (sin páginas, o pregunta sin términos de tema);
            // [] = hay páginas pero ninguna habla del tema → el documento no aporta.
            $ranked = $pages ? $this->rankPages($pages, $query, (string) $d->title) : null;

            // Pregunta general ("resume el plan"): sin términos de tema no hay qué ordenar;
            // en un documento con páginas sirven sus primeras páginas con texto.
            if ($ranked === null && $pages) {
                $ranked = [];
                foreach ($pages as $i => $text) {
                    if (trim((string) $text) !== '') {
                        $ranked[$i + 1] = 0.0;
                    }
                    if (count($ranked) >= self::PAGES_PER_DOC) break;
                }
            }

            // Ninguna página "habla del tema", pero la pregunta pide este documento
            // ("su hoja de vida", "su plan"): se sirven sus primeras páginas con texto.
            if ($ranked === [] && $pages && $this->queryTargetsDocument($query, $d->topic ?? null, (string) $d->title)) {
                foreach ($pages as $i => $text) {
                    if (trim((string) $text) !== '') {
                        $ranked[$i + 1] = 0.0;
                    }
                    if (count($ranked) >= self::PAGES_PER_DOC) break;
                }
            }

            if ($ranked === []) {
                continue;
            }

            if ($ranked === null) {
                if ($requireHit
                    && ! $this->contentMentionsQuery((string) $d->content, $query, (string) $d->title)
                    && ! $this->queryTargetsDocument($query, $d->topic ?? null, (string) $d->title)) {
                    continue;
                }
                $primary[] = [
                    'document_id' => $d->id,
                    'title'       => $d->title,
                    'excerpt'     => $this->extractExcerpt($d->content, $query, self::EXCERPT_CHARS, (string) $d->title),
                    'page'        => null,
                    'score'       => $score,
                    'metadata'    => $this->docMetadata($d),
                ];
                continue;
            }

            $first = true;
            foreach (array_slice($ranked, 0, self::PAGES_PER_DOC, true) as $n => $pageScore) {
                $entry = [
                    'document_id' => $d->id,
                    'title'       => $d->title,
                    'excerpt'     => $this->extractExcerpt($pages[$n - 1], $query, self::EXCERPT_CHARS, (string) $d->title),
                    'page'        => $n,
                    'score'       => $score,
                    'page_score'  => $pageScore,
                    'metadata'    => $this->docMetadata($d),
                ];
                if ($first) {
                    $primary[] = $entry;   // la mejor página de este documento
                    $first = false;
                } else {
                    $extra[] = $entry;
                }
            }
        }

        usort($extra, fn ($a, $b) => $b['page_score'] <=> $a['page_score']);

        $out = array_slice(array_merge($primary, $extra), 0, self::MAX_EXCERPTS);

        return array_map(function (array $e) {
            unset($e['page_score']);
            return $e;
        }, $out);
    }

    /**
     * Páginas de un documento ordenadas por relevancia para la pregunta:
     * [número de página (1-based) => puntaje], solo las que tienen algún acierto.
     * Misma ponderación que extractExcerpt(): ignora identidad/genéricas, pesa por
     * rareza dentro del documento, expande el tema a su vocabulario y premia la
     * densidad. null si la pregunta no aporta términos de tema (no se puede
     * ordenar); [] si ninguna página acierta.
     *
     * @param array<int, string> $pages
     * @return array<int, float>|null
     */
    private function rankPages(array $pages, string $query, string $title): ?array
    {
        $groups = $this->queryTermGroups($query, $title, false);
        if (! $groups) {
            return null;
        }

        // Aciertos por página y grupo, y total por grupo en todo el documento.
        $hits   = [];
        $totals = array_fill(0, count($groups), 0);
        foreach ($pages as $i => $text) {
            $folded = $this->fold((string) $text);
            if ($folded === '') continue;

            foreach ($groups as $gi => $variants) {
                $h = 0;
                foreach ($variants as $v) {
                    $h += substr_count($folded, $v);
                }
                if ($h > 0) {
                    $hits[$i][$gi] = $h;
                    $totals[$gi]  += $h;
                }
            }
        }

        $scores = [];
        foreach ($hits as $i => $byGroup) {
            $score = 0.0;
            foreach ($byGroup as $gi => $h) {
                $score += (1 / log(2 + $totals[$gi])) * (1 + log($h));
            }
            $scores[$i + 1] = $score;
        }

        arsort($scores);

        return $scores;
    }

    /** Documentos de UN candidato → fragmentos por página. Solo aportan los que hablan del tema. */
    private function searchWithinCandidate(string $query, int $candidateId): array
    {
        $docs = KnowledgeDocument::query()
            ->where('is_active', true)
            ->where('candidate_id', $candidateId)
            ->where('status', 'ready')
            ->orderBy('id')
            ->limit(10)
            ->get(['id', 'title', 'content', 'pages', 'topic', 'file_url', 'candidate_id', 'source_url', 'source_type']);

        return $this->toExcerpts($docs, $query, true);
    }

    /** ¿Algún término de tema de la pregunta (o su familia) aparece en el texto? */
    private function contentMentionsQuery(string $content, string $query, string $title): bool
    {
        $folded = $this->fold($content);
        foreach ($this->queryTermGroups($query, $title, false) as $variants) {
            foreach ($variants as $v) {
                if ($v !== '' && str_contains($folded, $v)) {
                    return true;
                }
            }
        }

        // Pregunta sin términos de tema ("resume el plan"): sirve el inicio del documento.
        return $this->queryTermGroups($query, $title, false) === [];
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
