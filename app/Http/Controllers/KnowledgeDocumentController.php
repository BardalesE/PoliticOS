<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessKnowledgeDocumentJob;
use App\Models\KnowledgeDocument;
use App\Services\EmbeddingsServiceInterface;
use App\Services\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class KnowledgeDocumentController extends Controller
{
    public function __construct(private EmbeddingsServiceInterface $embeddings) {}

    public function index(): JsonResponse
    {
        return response()->json(
            KnowledgeDocument::orderByDesc('created_at')->paginate(20)
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

    /** POST /api/admin/knowledge/{id}/reindex */
    public function reindex(int $id): JsonResponse
    {
        $doc = KnowledgeDocument::findOrFail($id);
        $doc->update(['status' => 'pending', 'error_message' => null]);

        try {
            ProcessKnowledgeDocumentJob::dispatch($doc->id);
        } catch (\Throwable $e) {
            Log::warning('ProcessKnowledgeDocumentJob dispatch (sync) failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
        }

        return response()->json(['ok' => true, 'doc' => $doc->fresh()]);
    }

}
