<?php

namespace App\Jobs;

use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Models\KnowledgeDocument;
use App\Services\GeminiLongContextAnalyzer;
use App\Services\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Modo INGEST_ANALYSIS_MODE=single_pass_gemini (ver config/ingest.php
 * "analysis"/"single_pass"): reemplaza el batch de MapDocumentChunkJob +
 * ReduceDocumentJob por UNA (o 2-3 + consolidación) llamada a Gemini con el
 * plan COMPLETO — el MAP/REDUCE por chunk contra Groq es demasiado lento con
 * el límite gratuito de Groq (cientos de llamadas por documento). Lo dispara
 * StartDocumentAnalysisJob en vez del batch de MAP; document_sections ya
 * quedó creado y en map_status=listo (chunking + embeddings para la
 * búsqueda del chat siguen existiendo, solo sin el paso MAP por sección).
 */
class SinglePassAnalyzeDocumentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    // Igual que ProcessKnowledgeDocumentJob/EmbedDocumentSectionsJob (300s):
    // debe quedar por debajo de queue.connections.database.retry_after (ver
    // tests/Unit/QueueRetryAfterSafetyTest.php) — hasta 2-3 llamadas a Gemini
    // (partes + consolidación) más reintentos de 429 entran holgado.
    public int $timeout = 300;

    public function __construct(public int $documentId, public ?string $tenantSlug = null)
    {
        $this->tenantSlug ??= TenantContext::currentSlug();
    }

    public function handle(): void
    {
        TenantContext::run($this->tenantSlug, fn () => $this->process());
    }

    private function process(): void
    {
        $doc = KnowledgeDocument::find($this->documentId);
        if (!$doc) {
            return;
        }

        $pages = $doc->pages ?: [];
        if (empty($pages)) {
            $doc->update([
                'analysis_status'      => 'error',
                'analysis_error'       => 'No hay texto por página (PDF sin páginas extraídas); no se puede analizar.',
                'analysis_finished_at' => now(),
            ]);
            return;
        }

        $doc->update(['analysis_stage' => 'analizando_ia', 'analysis_progress' => 30]);

        try {
            $result = (new GeminiLongContextAnalyzer())->analyze($pages);

            $previousVersion = (int) (DocumentAnalysis::where('document_id', $doc->id)->value('version') ?? 0);

            DocumentAnalysis::updateOrCreate(
                ['document_id' => $doc->id],
                [
                    'indice_estructurado'   => $result['indice_estructurado'],
                    'resumen_ejecutivo'     => $result['resumen_ejecutivo'],
                    'propuestas_por_eje'    => $result['propuestas_por_eje'],
                    'propuestas_por_region' => $result['propuestas_por_region'],
                    'modelo'                => $result['modelo'],
                    'tokens_usados'         => $result['tokens_usados'],
                    'version'               => $previousVersion + 1,
                ]
            );

            $this->saveFaqs($doc, $result['faqs']);

            $doc->update(['analysis_progress' => 90, 'analysis_stage' => 'embeddings']);

            EmbedDocumentSectionsJob::dispatch($doc->id, $this->tenantSlug);
        } catch (\Throwable $e) {
            Log::warning('SinglePassAnalyzeDocumentJob failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
            $doc->update([
                'analysis_status'      => 'error',
                'analysis_error'       => mb_substr($e->getMessage(), 0, 500),
                'analysis_batch_id'    => null,
                'analysis_finished_at' => now(),
            ]);
            throw $e;
        }
    }

    /** Misma regla que ReduceDocumentJob::saveFaqs: sin página de origen no se persiste. */
    private function saveFaqs(KnowledgeDocument $doc, array $faqs): void
    {
        DocumentFaq::where('document_id', $doc->id)->delete();

        foreach ($faqs as $faq) {
            $paginas = array_values(array_filter((array) ($faq['paginas'] ?? [])));
            if (empty($paginas) || empty($faq['pregunta']) || empty($faq['respuesta'])) {
                continue;
            }

            DocumentFaq::create([
                'document_id'  => $doc->id,
                'candidate_id' => $doc->candidate_id,
                'pregunta'     => $faq['pregunta'],
                'respuesta'    => $faq['respuesta'],
                'paginas'      => $paginas,
            ]);
        }
    }
}
