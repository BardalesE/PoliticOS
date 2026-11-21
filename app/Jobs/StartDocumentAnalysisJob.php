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
 * existía ya — idempotente) y luego, según INGEST_ANALYSIS_MODE (ver
 * config/ingest.php "analysis"):
 *   - 'single_pass_gemini' (default): SinglePassAnalyzeDocumentJob, que le
 *     manda el plan COMPLETO a Gemini en 1-4 llamadas.
 *   - 'map_reduce_groq' (legacy, se conserva intacto): batch de MAP →
 *     ReduceDocumentJob → EmbedDocumentSectionsJob, igual que siempre.
 * Lo dispara ProcessKnowledgeDocumentJob tras extraer el texto, y también el
 * botón "Reprocesar análisis" del admin (KnowledgeDocumentController::retryAnalysis)
 * SIN re-extraer el PDF — usa `knowledge_documents.pages`, ya guardado.
 *
 * Retomar es gratis en el modo Groq: MapDocumentChunkJob no reprocesa chunks
 * con map_status=listo, así que un reintento solo paga los que quedaron a
 * medias.
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

        // La hoja de vida es un formulario JNE (datos personales, sentencias,
        // bienes), no un documento de propuestas: no tiene nada que un
        // resumen/FAQs/búsqueda por página deba analizar, y correrlo gasta
        // chunks/tokens de Groq/Gemini sin ningún beneficio. 'no_aplica' es un
        // estado terminal fuera de pendiente/procesando/error/listo para que
        // el panel admin no lo muestre como si estuviera en cola.
        if ($doc->topic === 'hoja_de_vida') {
            $doc->update(['analysis_status' => 'no_aplica']);
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

        $doc->update([
            'analysis_status'      => 'procesando',
            'analysis_stage'       => 'dividiendo',
            'analysis_progress'    => 10,
            'analysis_error'       => null,
            // retryAnalysis() ya puso analysis_started_at al encolar; si esto
            // corre dentro de la cadena de analyze() (tras ProcessKnowledgeDocumentJob)
            // también. ?? solo por si algún caller futuro lo olvida.
            'analysis_started_at'  => $doc->analysis_started_at ?? now(),
            'analysis_finished_at' => null,
            // Se rellena abajo si de verdad se crea un batch nuevo; limpiarlo
            // aquí evita que sobreviva el id de un batch de una corrida previa
            // (p. ej. si esta vez todos los chunks ya estaban 'listo' y se va
            // directo a ReduceDocumentJob, sin batch).
            'analysis_batch_id'    => null,
            'is_public'            => false,
        ]);

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

        $documentId = $doc->id;
        $tenantSlug = $this->tenantSlug;

        if (config('ingest.analysis.mode', 'single_pass_gemini') === 'single_pass_gemini') {
            // Sin paso MAP: document_sections solo sirve para RAG (chunking +
            // embeddings de la Fase 2), el resumen/índice/propuestas/FAQs
            // salen directo de Gemini sobre el plan completo.
            DocumentSection::where('document_id', $documentId)
                ->where('map_status', '!=', 'listo')
                ->update(['map_status' => 'listo']);

            $doc->update(['analysis_stage' => 'analizando_ia', 'analysis_progress' => 20]);
            SinglePassAnalyzeDocumentJob::dispatch($documentId, $tenantSlug);
            return;
        }

        $pendingIds = DocumentSection::where('document_id', $documentId)
            ->where('map_status', '!=', 'listo')
            ->pluck('id');

        if ($pendingIds->isEmpty()) {
            $doc->update(['analysis_stage' => 'consolidando', 'analysis_progress' => 75]);
            ReduceDocumentJob::dispatch($documentId, $tenantSlug);
            return;
        }

        $doc->update(['analysis_stage' => 'resumiendo_secciones', 'analysis_progress' => 10]);

        $batch = Bus::batch($pendingIds->map(fn ($id) => new MapDocumentChunkJob($id, $tenantSlug))->all())
            ->name("map-document-{$documentId}")
            ->allowFailures()
            ->progress(function (Batch $batch) use ($documentId, $tenantSlug) {
                TenantContext::run($tenantSlug, function () use ($batch, $documentId) {
                    KnowledgeDocument::where('id', $documentId)->update([
                        // 10-70%: el resto (dividir/consolidar/FAQs/embeddings)
                        // lo reparten ReduceDocumentJob y EmbedDocumentSectionsJob.
                        'analysis_progress' => 10 + (int) round($batch->progress() * 0.60),
                    ]);
                });
            })
            ->then(function () use ($documentId, $tenantSlug) {
                TenantContext::run($tenantSlug, function () use ($documentId) {
                    KnowledgeDocument::where('id', $documentId)->update(['analysis_batch_id' => null]);
                });
                ReduceDocumentJob::dispatch($documentId, $tenantSlug);
            })
            ->catch(function (Batch $batch, \Throwable $e) use ($documentId, $tenantSlug) {
                TenantContext::run($tenantSlug, function () use ($documentId, $e) {
                    KnowledgeDocument::where('id', $documentId)->update([
                        'analysis_status'      => 'error',
                        'analysis_error'       => mb_substr($e->getMessage(), 0, 500),
                        'analysis_batch_id'    => null,
                        'analysis_finished_at' => now(),
                    ]);
                });
            })
            ->dispatch();

        // Después del dispatch (no antes): recién ahí Bus::batch() devuelve el
        // Batch real con su id — es lo que el botón "Cancelar" del admin
        // necesita para cancelarlo y vaciar sus jobs pendientes de la cola.
        $doc->update(['analysis_batch_id' => $batch->id]);
    }
}
