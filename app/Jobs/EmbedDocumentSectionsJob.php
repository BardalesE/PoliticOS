<?php

namespace App\Jobs;

use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\Embeddings\CosineSimilarity;
use App\Services\Embeddings\TextEmbedderFactory;
use App\Services\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Último paso del pipeline (ver ProcessKnowledgeDocumentJob → MAP batch →
 * ReduceDocumentJob → aquí): embeddings de chunks + FAQs en lotes. Solo al
 * terminar esto el documento queda is_public=true / analysis_status=listo —
 * antes de eso, la Fase 2 no debe servirlo como fuente de RAG semántico.
 */
class EmbedDocumentSectionsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 5;
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

        $embedder = TextEmbedderFactory::make();

        try {
            $this->embedSections($doc, $embedder);
            $this->embedFaqs($doc, $embedder);

            $doc->update([
                'analysis_status'   => 'listo',
                'analysis_progress' => 100,
                'analysis_error'    => null,
                'is_public'         => true,
            ]);
        } catch (\Throwable $e) {
            Log::warning('EmbedDocumentSectionsJob failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
            $doc->update(['analysis_status' => 'error', 'analysis_error' => mb_substr($e->getMessage(), 0, 500)]);
            throw $e;
        }
    }

    private function embedSections(KnowledgeDocument $doc, $embedder): void
    {
        // chunkById (no chunk): el update() de cada página saca filas del WHERE
        // (embedding deja de ser null) — con offset normal eso salta filas.
        DocumentSection::where('document_id', $doc->id)
            ->where('map_status', 'listo')
            ->whereNull('embedding')
            ->chunkById(50, function ($sections) use ($embedder) {
                $vectors = $embedder->embed($sections->pluck('texto')->all());
                foreach ($sections as $i => $section) {
                    $section->update(['embedding' => CosineSimilarity::pack($vectors[$i])]);
                }
            });
    }

    private function embedFaqs(KnowledgeDocument $doc, $embedder): void
    {
        DocumentFaq::where('document_id', $doc->id)
            ->whereNull('embedding')
            ->chunkById(50, function ($faqs) use ($embedder) {
                $vectors = $embedder->embed($faqs->pluck('pregunta')->all());
                foreach ($faqs as $i => $faq) {
                    $faq->update(['embedding' => CosineSimilarity::pack($vectors[$i])]);
                }
            });
    }
}
