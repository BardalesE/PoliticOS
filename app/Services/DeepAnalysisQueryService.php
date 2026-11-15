<?php

namespace App\Services;

use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\Embeddings\CosineSimilarity;
use App\Services\Embeddings\TextEmbedderFactory;
use App\Support\SensitiveData;
use Illuminate\Support\Facades\Log;

/**
 * Clasificador de intención de la Fase 2, sobre los documentos ya procesados
 * por el pipeline de la Fase 1 (document_sections/document_analysis/
 * document_faqs, solo cuando is_public=true). Lo llama CivicAIService ANTES
 * de construir el prompt:
 *
 *   (a) pregunta vaga/general  → menú (resumen + índice), SIN llamar al LLM.
 *   (b) coincide con una FAQ   → respuesta cacheada, SIN llamar al LLM.
 *   (c) pregunta específica    → devuelve fragmentos (document_sections por
 *       similitud coseno + el RAG léxico existente, combinados) para que
 *       CivicAIService los sume a $docs de toda la vida y siga su flujo
 *       normal (LLM + citas [S#] + guards) sin cambios.
 *
 * null = este candidato no tiene documentos con análisis profundo listo:
 * CivicAIService debe comportarse exactamente como antes de la Fase 2.
 *
 * $candidateId null = sin acotar a un candidato (tenant de un solo candidato,
 * igual que el filtro de MySQLFulltextEmbeddings en CivicAIService::buildContext).
 */
class DeepAnalysisQueryService
{
    public function __construct(
        private EmbeddingsServiceInterface $lexical,
        private VagueQuestionDetector $vagueDetector,
    ) {
    }

    public function hasDeepAnalysis(?int $candidateId): bool
    {
        return KnowledgeDocument::query()
            ->where('is_public', true)
            ->when($candidateId, fn ($q) => $q->where('candidate_id', $candidateId))
            ->exists();
    }

    /**
     * @return array{type:'menu', reply:string}
     *       | array{type:'faq', reply:string, citations:array}
     *       | array{type:'rag', docs:array}
     *       | null
     */
    public function classify(string $userMessage, ?int $candidateId, ?string $candidateName): ?array
    {
        if (!$this->hasDeepAnalysis($candidateId)) {
            return null;
        }

        if ($this->vagueDetector->isVague($userMessage)) {
            return ['type' => 'menu', 'reply' => $this->menuReply($candidateId, $candidateName)];
        }

        $embedding = $this->embedSafely($userMessage);

        if ($embedding) {
            $faq = $this->bestFaqMatch($embedding, $candidateId);
            if ($faq) {
                return [
                    'type'      => 'faq',
                    'reply'     => $this->faqReply($faq),
                    'citations' => $this->faqCitations($faq),
                ];
            }
        }

        $docs = $embedding ? $this->semanticSectionDocs($embedding, $candidateId) : [];
        $docs = array_merge($this->regionEntries($userMessage, $candidateId), $docs);
        $docs = $this->mergeWithLexical($docs, $userMessage, $candidateId);
        $docs = $this->trimToBudget($docs);

        return ['type' => 'rag', 'docs' => $docs];
    }

    /** @return array<float>|null */
    private function embedSafely(string $text): ?array
    {
        try {
            $vectors = TextEmbedderFactory::make()->embed([$text]);

            return $vectors[0] ?? null;
        } catch (\Throwable $e) {
            Log::warning('DeepAnalysisQueryService: embed falló, se sigue solo con RAG léxico', ['error' => $e->getMessage()]);

            return null;
        }
    }

    // ─── (a) MENÚ ──────────────────────────────────────────────────────────

    private function menuReply(?int $candidateId, ?string $candidateName): string
    {
        $analyses = DocumentAnalysis::query()
            ->whereHas('document', function ($q) use ($candidateId) {
                $q->where('is_public', true)->when($candidateId, fn ($qq) => $qq->where('candidate_id', $candidateId));
            })
            ->with('document:id,title,topic')
            ->get()
            ->filter(fn ($a) => $a->document && !SensitiveData::isHojaDeVida($a->document->topic, $a->document->title));

        $quien = $candidateName ? " de {$candidateName}" : '';

        if ($analyses->isEmpty()) {
            return $this->finalize("Soy un asistente de inteligencia artificial basado en los documentos oficiales{$quien}. "
                . '¿Sobre qué tema específico quieres que te responda?');
        }

        $parts = ["Soy un asistente de inteligencia artificial basado en el plan de gobierno{$quien}."];

        foreach ($analyses as $a) {
            if ($a->resumen_ejecutivo) {
                $parts[] = mb_substr(trim($a->resumen_ejecutivo), 0, 500);
            }
            $temas = collect($a->indice_estructurado ?? [])->pluck('titulo')->filter()->take(8);
            if ($temas->isNotEmpty()) {
                $parts[] = "Puedo detallar estos temas:\n- " . $temas->implode("\n- ");
            }
        }

        $parts[] = '¿Sobre qué tema quieres que profundice?';

        return $this->finalize(implode("\n\n", $parts));
    }

    // ─── (b) FAQ ───────────────────────────────────────────────────────────

    private function bestFaqMatch(array $embedding, ?int $candidateId): ?DocumentFaq
    {
        $threshold = (float) config('ingest.query.faq_similarity_threshold', 0.85);

        $best      = null;
        $bestScore = -1.0;

        DocumentFaq::query()
            ->whereNotNull('embedding')
            ->when($candidateId, fn ($q) => $q->where('candidate_id', $candidateId))
            ->whereHas('document', fn ($q) => $q->where('is_public', true))
            ->chunkById(100, function ($faqs) use (&$best, &$bestScore, $embedding) {
                foreach ($faqs as $faq) {
                    $score = CosineSimilarity::similarity($embedding, CosineSimilarity::unpack($faq->embedding));
                    if ($score > $bestScore) {
                        $bestScore = $score;
                        $best      = $faq;
                    }
                }
            });

        return ($best && $bestScore >= $threshold) ? $best : null;
    }

    private function faqReply(DocumentFaq $faq): string
    {
        return $this->finalize(trim($faq->respuesta));
    }

    /** @return array<int, array<string, mixed>> */
    private function faqCitations(DocumentFaq $faq): array
    {
        $doc     = $faq->document;
        $paginas = $faq->paginas ?: [];
        $hv      = $doc && SensitiveData::isHojaDeVida($doc->topic, $doc->title);

        return [[
            'id'          => 'FAQ',
            'document_id' => $faq->document_id,
            'title'       => $doc->title ?? 'Documento',
            'page'        => $paginas[0] ?? null,
            'excerpt'     => $faq->respuesta,
            'url'         => $hv ? null : ($doc->source_url ?: $doc->file_url ?? null),
            'type'        => $doc->source_type ?? 'pdf',
        ]];
    }

    // ─── (c) RAG: document_sections por similitud + léxico + regiones ─────

    /** @return array<int, array<string, mixed>> */
    private function semanticSectionDocs(array $embedding, ?int $candidateId): array
    {
        $topK = (int) config('ingest.query.rag_top_k', 6);

        $sections = DocumentSection::query()
            ->where('map_status', 'listo')
            ->whereNotNull('embedding')
            ->when($candidateId, fn ($q) => $q->where('candidate_id', $candidateId))
            ->whereHas('document', fn ($q) => $q->where('is_public', true))
            ->get();

        if ($sections->isEmpty()) {
            return [];
        }

        $docsById = KnowledgeDocument::whereIn('id', $sections->pluck('document_id')->unique())->get()->keyBy('id');

        return $sections
            ->map(function (DocumentSection $section) use ($embedding, $docsById) {
                $score = CosineSimilarity::similarity($embedding, CosineSimilarity::unpack($section->embedding));

                return $this->sectionToDocEntry($section, $docsById->get($section->document_id), $score);
            })
            ->sortByDesc('score')
            ->take($topK)
            ->values()
            ->all();
    }

    private function sectionToDocEntry(DocumentSection $section, ?KnowledgeDocument $doc, float $score): array
    {
        return [
            'document_id' => $section->document_id,
            'title'       => $doc?->title ?? 'Documento',
            'excerpt'     => $section->texto,
            'page'        => $section->page_start,
            'score'       => $score,
            'metadata'    => [
                'topic'        => $doc?->topic,
                'file_url'     => $doc?->file_url,
                'candidate_id' => $section->candidate_id,
                'source_url'   => $doc?->source_url ?: $doc?->file_url,
                'source_type'  => $doc?->source_type ?? 'pdf',
            ],
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function regionEntries(string $userMessage, ?int $candidateId): array
    {
        $folded = $this->fold($userMessage);

        $analyses = DocumentAnalysis::query()
            ->whereHas('document', function ($q) use ($candidateId) {
                $q->where('is_public', true)->when($candidateId, fn ($qq) => $qq->where('candidate_id', $candidateId));
            })
            ->get(['id', 'document_id', 'propuestas_por_region']);

        $entries = [];
        foreach ($analyses as $a) {
            $doc = null;
            foreach ((array) $a->propuestas_por_region as $region) {
                $nombre = $region['nombre'] ?? null;
                if (!$nombre || !str_contains($folded, $this->fold($nombre))) {
                    continue;
                }

                $lineas  = [];
                $paginas = [];
                foreach ((array) ($region['propuestas'] ?? []) as $p) {
                    if (!empty($p['texto'])) {
                        $lineas[] = '- ' . $p['texto'];
                    }
                    foreach ((array) ($p['paginas'] ?? []) as $pg) {
                        $paginas[] = $pg;
                    }
                }
                if (!$lineas) {
                    continue;
                }

                $doc ??= KnowledgeDocument::find($a->document_id);
                $entries[] = [
                    'document_id' => $a->document_id,
                    'title'       => "Propuestas para {$nombre}",
                    'excerpt'     => "Propuestas específicas para {$nombre}:\n" . implode("\n", $lineas),
                    'page'        => $paginas[0] ?? null,
                    // Prioridad alta: el ciudadano mencionó la región explícitamente.
                    'score'       => 2.0,
                    'metadata'    => [
                        'topic'        => $doc?->topic,
                        'file_url'     => $doc?->file_url,
                        'candidate_id' => $doc?->candidate_id,
                        'source_url'   => $doc?->source_url ?: $doc?->file_url,
                        'source_type'  => $doc?->source_type ?? 'pdf',
                    ],
                ];
            }
        }

        return $entries;
    }

    /** @return array<int, array<string, mixed>> */
    private function mergeWithLexical(array $semanticDocs, string $userMessage, ?int $candidateId): array
    {
        $topK   = (int) config('ingest.query.rag_top_k', 6);
        $filter = $candidateId ? ['candidate_id' => $candidateId] : [];

        try {
            $lexicalDocs = $this->lexical->search($userMessage, $topK, $filter);
        } catch (\Throwable $e) {
            Log::warning('DeepAnalysisQueryService: búsqueda léxica falló', ['error' => $e->getMessage()]);
            $lexicalDocs = [];
        }

        $merged = [];
        foreach (array_merge($semanticDocs, $lexicalDocs) as $doc) {
            $key = ($doc['document_id'] ?? 'x') . ':' . ($doc['page'] ?? 'none');
            if (!isset($merged[$key]) || ($doc['score'] ?? 0) > ($merged[$key]['score'] ?? 0)) {
                $merged[$key] = $doc;
            }
        }

        $list = array_values($merged);
        usort($list, fn ($a, $b) => ($b['score'] ?? 0) <=> ($a['score'] ?? 0));

        return $list;
    }

    /** Presupuesto de contexto en TOKENS (reemplaza el conteo fijo de fragmentos — Fase 2.2). */
    private function trimToBudget(array $docs): array
    {
        $charsPerToken = max(1, (int) config('ingest.chunking.chars_per_token', 4));
        $budgetChars   = (int) config('ingest.query.context_token_budget', 6000) * $charsPerToken;

        $out  = [];
        $used = 0;
        foreach ($docs as $doc) {
            $len = mb_strlen($doc['excerpt'] ?? '');
            if ($used > 0 && $used + $len > $budgetChars) {
                break;
            }
            $out[] = $doc;
            $used += $len;
            if ($used >= $budgetChars) {
                break;
            }
        }

        return $out;
    }

    private function fold(string $s): string
    {
        return strtr(mb_strtolower(trim($s)), ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n']);
    }

    /** Sin URLs (2.3: "prohibido generar URLs") y con la redacción de datos sensibles de siempre. */
    private function finalize(string $text): string
    {
        $text = SensitiveData::redact($text);

        return trim((string) preg_replace('~\bhttps?://\S+~iu', '', $text));
    }
}
