<?php

namespace App\Jobs;

use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\DocumentChunker;
use App\Services\TenantContext;
use Illuminate\Bus\Batch;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Bus;

/**
 * Arranca (o retoma) el análisis profundo de un documento: chunking (si no
 * existía ya — idempotente) + batch de MAP → ReduceDocumentJob →
 * EmbedDocumentSectionsJob. Lo dispara ProcessKnowledgeDocumentJob tras
 * extraer el texto, y también el botón "Reprocesar análisis" del admin
 * (KnowledgeDocumentController::retryAnalysis) SIN re-extraer el PDF — usa
 * `knowledge_documents.pages`, ya guardado.
 *
 * Retomar es gratis: MapDocumentChunkJob no reprocesa chunks con
 * map_status=listo, así que un reintento solo paga los que quedaron a medias.
 */
class StartDocumentAnalysisJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $timeout = 120;

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
                'analysis_status' => 'error',
                'analysis_error'  => 'No hay texto por página (PDF sin páginas extraídas); no se puede analizar.',
            ]);
            return;
        }

        if (DocumentSection::where('document_id', $doc->id)->count() === 0) {
            $chunks = (new DocumentChunker(
                (int) config('ingest.chunking.fallback_tokens'),
                (int) config('ingest.chunking.overlap_tokens'),
            ))->chunk($pages);

            foreach ($chunks as $c) {
                DocumentSection::create([
                    'document_id'  => $doc->id,
                    'candidate_id' => $doc->candidate_id,
                    'orden'        => $c['orden'],
                    'titulo'       => $c['titulo'],
                    'texto'        => $c['texto'],
                    'page_start'   => $c['page_start'],
                    'page_end'     => $c['page_end'],
                    'tokens'       => $c['tokens'],
                ]);
            }
        }

        $doc->update([
            'analysis_status'   => 'procesando',
            'analysis_progress' => 0,
            'analysis_error'    => null,
            'is_public'         => false,
        ]);

        $documentId = $doc->id;
        $tenantSlug = $this->tenantSlug;

        $pendingIds = DocumentSection::where('document_id', $documentId)
            ->where('map_status', '!=', 'listo')
            ->pluck('id');

        if ($pendingIds->isEmpty()) {
            ReduceDocumentJob::dispatch($documentId, $tenantSlug);
            return;
        }

        Bus::batch($pendingIds->map(fn ($id) => new MapDocumentChunkJob($id, $tenantSlug))->all())
            ->name("map-document-{$documentId}")
            ->allowFailures()
            ->progress(function (Batch $batch) use ($documentId, $tenantSlug) {
                TenantContext::run($tenantSlug, function () use ($batch, $documentId) {
                    KnowledgeDocument::where('id', $documentId)->update([
                        'analysis_progress' => (int) round($batch->progress() * 0.7),
                    ]);
                });
            })
            ->then(function () use ($documentId, $tenantSlug) {
                ReduceDocumentJob::dispatch($documentId, $tenantSlug);
            })
            ->catch(function (Batch $batch, \Throwable $e) use ($documentId, $tenantSlug) {
                TenantContext::run($tenantSlug, function () use ($documentId, $e) {
                    KnowledgeDocument::where('id', $documentId)->update([
                        'analysis_status' => 'error',
                        'analysis_error'  => mb_substr($e->getMessage(), 0, 500),
                    ]);
                });
            })
            ->dispatch();
    }
}
