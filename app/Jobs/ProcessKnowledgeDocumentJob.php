<?php

namespace App\Jobs;

use App\Models\KnowledgeDocument;
use App\Services\EmbeddingsServiceInterface;
use App\Services\PdfPageExtractor;
use App\Services\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Pipeline de extracción de documentos: subida (KnowledgeDocumentController::store,
 * síncrono y rápido) → cola (este job) → procesamiento (extrae texto + indexa
 * embeddings) → estado listo (status=ready en knowledge_documents).
 *
 * También se redespacha desde reindex() para reprocesar un documento existente
 * (falla previa, cambio de driver de embeddings, etc.).
 */
class ProcessKnowledgeDocumentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $timeout = 120;

    public function __construct(public int $documentId, public ?string $tenantSlug = null)
    {
        $this->tenantSlug ??= TenantContext::currentSlug();
    }

    public function handle(EmbeddingsServiceInterface $embeddings): void
    {
        TenantContext::run($this->tenantSlug, fn () => $this->process($embeddings));
    }

    private function process(EmbeddingsServiceInterface $embeddings): void
    {
        $doc = KnowledgeDocument::find($this->documentId);
        if (!$doc) {
            return;
        }

        $doc->update(['status' => 'processing', 'error_message' => null]);

        try {
            $extracted = (new PdfPageExtractor())->fromDocument($doc);
            $content   = $extracted['content'];
            if ($content === '') {
                throw new \RuntimeException('No se pudo extraer texto del PDF (documento escaneado sin OCR, vacío o corrupto).');
            }

            $doc->update(['content' => $content, 'pages' => $extracted['pages'] ?: null]);

            // delete() antes de index() para que reintentos y reindex() manual
            // sean idempotentes (mismo patrón que ya usaba el reindex síncrono).
            $embeddings->delete($doc->id);
            $embeddings->index($doc->id, $content, $this->indexMetadata($doc));

            $doc->update([
                'status'             => 'ready',
                'embeddings_indexed' => true,
            ]);
        } catch (\Throwable $e) {
            Log::warning('ProcessKnowledgeDocumentJob failed', [
                'doc_id' => $doc->id,
                'error'  => $e->getMessage(),
            ]);
            $doc->update([
                'status'        => 'failed',
                'error_message' => mb_substr($e->getMessage(), 0, 500),
            ]);
            // Re-lanzar para que el mecanismo de reintentos/failed_jobs de la
            // cola lo registre; si era el intento final, el status ya quedó
            // en 'failed' arriba (visible aunque el job termine descartado).
            throw $e;
        }
    }

    private function indexMetadata(KnowledgeDocument $doc): array
    {
        return [
            'title'        => $doc->title,
            'topic'        => $doc->topic,
            'candidate_id' => $doc->candidate_id,
            'source_url'   => $doc->source_url ?: $doc->file_url,
            'source_type'  => $doc->source_type ?? 'pdf',
        ];
    }
}
