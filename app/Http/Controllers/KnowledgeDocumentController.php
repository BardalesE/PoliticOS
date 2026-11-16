<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessKnowledgeDocumentJob;
use App\Jobs\StartDocumentAnalysisJob;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\EmbeddingsServiceInterface;
use App\Services\PlanService;
use App\Services\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class KnowledgeDocumentController extends Controller
{
    public function __construct(private EmbeddingsServiceInterface $embeddings) {}

    // El panel admin agrupa por candidato (ver resources/js/.../admin/knowledge),
    // así que necesita TODOS los documentos en una sola carga, no 20 a la vez
    // — per_page lo permite sin romper la forma Paginated<T> que ya consume
    // el frontend.
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            KnowledgeDocument::orderByDesc('created_at')
                ->paginate(max(1, (int) $request->integer('per_page', 20)))
        );
    }

    // GET /api/knowledge  (público — portal de transparencia)
    // Solo documentos activos y solo los campos para listar/enlazar:
    // nunca exponer `content` (texto completo extraído para el RAG).
    public function publicIndex(): JsonResponse
    {
        return response()->json(
            KnowledgeDocument::where('is_active', true)
                ->orderByDesc('created_at')
                ->get([
                    'id', 'title', 'description', 'topic', 'file_url',
                    'source_url', 'source_type', 'file_size', 'is_active', 'created_at',
                ])
        );
    }

    public function store(Request $request): JsonResponse
    {
        $tenant = app('tenant');
        if ($tenant) {
            $maxDocs = PlanService::getLimit($tenant, 'knowledge', 'max_documents');
            if ($maxDocs !== -1 && KnowledgeDocument::count() >= $maxDocs) {
                return response()->json([
                    'message'          => "Tu plan permite máximo {$maxDocs} documento(s). Actualiza tu plan para subir más.",
                    'feature'          => 'knowledge',
                    'limit'            => $maxDocs,
                    'current'          => KnowledgeDocument::count(),
                    'upgrade_required' => true,
                ], 403);
            }
        }

        $request->validate([
            'file'         => ['required','file','mimes:pdf','max:51200'],
            'title'        => ['required','string','max:255'],
            'description'  => ['nullable','string','max:1000'],
            'topic'        => ['nullable','string','max:40'],
            'candidate_id' => ['nullable','integer','exists:candidate_profiles,id'],
            'source_url'   => ['nullable','url','max:500'],
            'source_type'  => ['nullable','in:pdf,interview,debate,news'],
        ]);

        $file = $request->file('file');
        $path = $file->store('knowledge', config('filesystems.media'));
        $url  = Storage::disk(config('filesystems.media'))->url($path);

        $doc = KnowledgeDocument::create([
            'title'         => $request->input('title'),
            'description'   => $request->input('description'),
            'file_url'      => $url,
            'original_name' => $file->getClientOriginalName(),
            'content'       => null,
            'topic'         => $request->input('topic'),
            'candidate_id'  => $request->input('candidate_id'),
            // Toda cita debe tener URL verificable: sin fuente externa, el PDF subido
            'source_url'    => $request->input('source_url') ?: $url,
            'source_type'   => $request->input('source_type') ?: 'pdf',
            'file_size'     => $file->getSize(),
            'is_active'     => true,
            'status'        => 'pending',
        ]);

        // Extracción + indexado en background (ProcessKnowledgeDocumentJob):
        // un PDF grande puede tardar varios segundos en parsear e indexar,
        // y bloquear el request de subida no escala ni es necesario.
        // Con QUEUE_CONNECTION=sync (default en local) el job corre inline y
        // Laravel re-lanza cualquier excepción hacia este dispatch(); el job
        // ya deja status=failed guardado antes de relanzar, así que solo hay
        // que evitar que ese throw tumbe el request de subida (que sí tuvo éxito).
        try {
            ProcessKnowledgeDocumentJob::dispatch($doc->id);
        } catch (\Throwable $e) {
            Log::warning('ProcessKnowledgeDocumentJob dispatch (sync) failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
        }

        return response()->json($doc->fresh(), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $doc = KnowledgeDocument::findOrFail($id);
        $data = $request->validate([
            'title'        => ['sometimes','string','max:255'],
            'description'  => ['nullable','string','max:1000'],
            'topic'        => ['nullable','string','max:40'],
            'candidate_id' => ['nullable','integer','exists:candidate_profiles,id'],
            'source_url'   => ['nullable','url','max:500'],
            'source_type'  => ['sometimes','in:pdf,interview,debate,news'],
            'is_active'    => ['nullable','boolean'],
        ]);
        $doc->update($data);
        return response()->json($doc);
    }

    public function destroy(int $id): JsonResponse
    {
        $doc = KnowledgeDocument::findOrFail($id);

        try {
            $this->embeddings->delete($doc->id);
        } catch (\Throwable $e) {
            Log::warning('Embeddings delete failed', ['error' => $e->getMessage()]);
        }

        if ($doc->file_url) {
            $mediaDisk = config('filesystems.media');
            $base = Storage::disk($mediaDisk)->url('');
            Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $doc->file_url), '/'));
        }

        $doc->delete();
        return response()->json(['deleted' => true]);
    }

    /**
     * POST /api/admin/knowledge/{id}/reindex — solo re-extrae texto/embeddings
     * léxicos (igual que antes). Ya NO dispara el análisis profundo: si el
     * documento tenía uno vigente (sections/analysis de un `content` viejo),
     * re-extraer invalida esos datos, así que vuelve a 'sin_analizar' (o
     * 'no_aplica' si es hoja de vida) — el botón "Analizar" lo retoma.
     */
    public function reindex(int $id): JsonResponse
    {
        $doc = KnowledgeDocument::findOrFail($id);
        $doc->update([
            'status'             => 'pending',
            'error_message'      => null,
            'analysis_status'    => $doc->topic === 'hoja_de_vida' ? 'no_aplica' : 'sin_analizar',
            'analysis_progress'  => 0,
            'analysis_error'     => null,
            'analysis_batch_id'  => null,
        ]);

        try {
            ProcessKnowledgeDocumentJob::dispatch($doc->id);
        } catch (\Throwable $e) {
            Log::warning('ProcessKnowledgeDocumentJob dispatch (sync) failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
        }

        return response()->json(['ok' => true, 'doc' => $doc->fresh()]);
    }

    /** GET /api/admin/knowledge/{id}/analysis-status — polling del admin. */
    public function analysisStatus(int $id): JsonResponse
    {
        $doc = KnowledgeDocument::findOrFail($id);

        return response()->json([
            'analysis_status'   => $doc->analysis_status,
            'analysis_progress' => $doc->analysis_progress,
            'analysis_error'    => $doc->analysis_error,
            'is_public'         => $doc->is_public,
        ]);
    }

    /**
     * GET /api/admin/knowledge/{id}/analysis — solo lectura, botón "Ver
     * análisis": resumen ejecutivo, índice, propuestas por eje/región, FAQs,
     * y cobertura (páginas del PDF vs páginas cubiertas por secciones).
     */
    public function analysisDetail(int $id): JsonResponse
    {
        $doc = KnowledgeDocument::with('analysis', 'faqs')->findOrFail($id);

        if ($doc->analysis_status !== 'listo') {
            return response()->json([
                'message' => 'Este documento todavía no tiene un análisis completo.',
            ], 422);
        }

        $sections = DocumentSection::where('document_id', $doc->id)->get(['page_start', 'page_end']);

        $coveredPages = [];
        foreach ($sections as $section) {
            for ($page = $section->page_start; $page <= $section->page_end; $page++) {
                $coveredPages[$page] = true;
            }
        }

        $analysis = $doc->analysis;

        return response()->json([
            'resumen_ejecutivo'     => $analysis?->resumen_ejecutivo,
            'indice_estructurado'   => $analysis?->indice_estructurado ?? [],
            'propuestas_por_eje'    => $analysis?->propuestas_por_eje ?? [],
            'propuestas_por_region' => $analysis?->propuestas_por_region ?? [],
            'faqs'                  => $doc->faqs->map(fn ($faq) => [
                'pregunta'  => $faq->pregunta,
                'respuesta' => $faq->respuesta,
                'paginas'   => $faq->paginas,
            ])->values(),
            'pages_total'    => is_array($doc->pages) ? count($doc->pages) : null,
            'pages_covered'  => count($coveredPages),
            'sections_count' => $sections->count(),
            'analyzed_at'    => $doc->analyzed_at,
        ]);
    }

    /**
     * POST /api/admin/knowledge/{id}/retry-analysis — botones "Volver a
     * analizar" (listo) y "Reintentar" (error). A diferencia de analyze(),
     * NO vuelve a extraer el PDF: retoma el análisis (chunking/MAP/REDUCE/
     * embeddings) desde donde quedó, usando `pages` ya guardado
     * (StartDocumentAnalysisJob es idempotente por chunk).
     */
    public function retryAnalysis(int $id): JsonResponse
    {
        $doc = KnowledgeDocument::findOrFail($id);

        if ($doc->topic === 'hoja_de_vida') {
            return response()->json(['message' => 'Las hojas de vida no se analizan.'], 422);
        }

        if (empty($doc->pages)) {
            return response()->json([
                'message' => 'Este documento no tiene texto por página todavía — usa "Analizar plan completo" primero.',
            ], 422);
        }

        $doc->update(['analysis_status' => 'pendiente', 'analysis_error' => null, 'analysis_batch_id' => null]);

        try {
            StartDocumentAnalysisJob::dispatch($doc->id);
        } catch (\Throwable $e) {
            Log::warning('StartDocumentAnalysisJob dispatch (sync) failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
        }

        return response()->json(['ok' => true, 'doc' => $doc->fresh()]);
    }

    /**
     * POST /api/admin/knowledge/{id}/analyze — botón "Analizar plan completo".
     * Único punto de entrada que arranca el análisis profundo desde cero: re-
     * extrae el PDF COMPLETO (ProcessKnowledgeDocumentJob) porque documentos
     * subidos antes del fix de truncamiento a 80 000 caracteres todavía
     * tienen `content`/`pages` incompletos, y recién entonces encadena
     * StartDocumentAnalysisJob — si la extracción falla, el análisis nunca
     * se dispara (Bus::chain no sigue tras un job fallido).
     */
    public function analyze(int $id): JsonResponse
    {
        $doc = KnowledgeDocument::findOrFail($id);

        if ($doc->topic === 'hoja_de_vida') {
            return response()->json(['message' => 'Las hojas de vida no se analizan.'], 422);
        }

        $doc->update([
            'status'             => 'pending',
            'error_message'      => null,
            'analysis_status'    => 'pendiente',
            'analysis_progress'  => 0,
            'analysis_error'     => null,
            'analysis_batch_id'  => null,
        ]);

        $tenantSlug = TenantContext::currentSlug();
        try {
            Bus::chain([
                new ProcessKnowledgeDocumentJob($doc->id, $tenantSlug),
                new StartDocumentAnalysisJob($doc->id, $tenantSlug),
            ])->dispatch();
        } catch (\Throwable $e) {
            Log::warning('analyze chain dispatch (sync) failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
        }

        return response()->json(['ok' => true, 'doc' => $doc->fresh()]);
    }

    /**
     * POST /api/admin/knowledge/{id}/cancel-analysis — botón "Cancelar",
     * visible mientras analysis_status es 'pendiente' o 'procesando'.
     * Cancela el Bus::batch en curso (si lo hay — con todos los chunks ya
     * mapeados se va directo a Reduce, sin batch) y borra del encabezado de
     * la cola ('jobs', conexión fija de config/queue.php) los jobs MAP que
     * todavía no corrieron: no basta con esperar a que el worker los tome y
     * se auto-descarten (MapDocumentChunkJob::process() ya chequea
     * batch()->cancelled()) — "cancelar" debe vaciar la cola ya.
     */
    public function cancelAnalysis(int $id): JsonResponse
    {
        $doc = KnowledgeDocument::findOrFail($id);

        if (!in_array($doc->analysis_status, ['pendiente', 'procesando'], true)) {
            return response()->json(['message' => 'Este documento no tiene un análisis en curso.'], 422);
        }

        if ($doc->analysis_batch_id) {
            Bus::findBatch($doc->analysis_batch_id)?->cancel();

            DB::connection(config('queue.connections.database.connection', 'central'))
                ->table(config('queue.connections.database.table', 'jobs'))
                ->where('payload', 'like', '%"batchId":"' . $doc->analysis_batch_id . '"%')
                ->delete();
        }

        $doc->update([
            'analysis_status'   => 'sin_analizar',
            'analysis_progress' => 0,
            'analysis_error'    => null,
            'analysis_batch_id' => null,
        ]);

        return response()->json(['ok' => true, 'doc' => $doc->fresh()]);
    }
}
