<?php

namespace App\Http\Controllers;

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

        $file    = $request->file('file');
        $path    = $file->store('knowledge', config('filesystems.media'));
        $url     = Storage::disk(config('filesystems.media'))->url($path);
        $content = $this->extractText($file->getRealPath());

        $doc = KnowledgeDocument::create([
            'title'         => $request->input('title'),
            'description'   => $request->input('description'),
            'file_url'      => $url,
            'original_name' => $file->getClientOriginalName(),
            'content'       => $content,
            'topic'         => $request->input('topic'),
            'candidate_id'  => $request->input('candidate_id'),
            // Toda cita debe tener URL verificable: sin fuente externa, el PDF subido
            'source_url'    => $request->input('source_url') ?: $url,
            'source_type'   => $request->input('source_type') ?: 'pdf',
            'file_size'     => $file->getSize(),
            'is_active'     => true,
        ]);

        // Indexar para RAG (FULLTEXT o Qdrant según driver)
        if (!empty($content)) {
            try {
                $this->embeddings->index($doc->id, $content, [
                    'title' => $doc->title,
                    'topic' => $doc->topic,
                ]);
            } catch (\Throwable $e) {
                Log::warning('Embeddings index failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
            }
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
        if (empty($doc->content)) {
            return response()->json(['error' => 'Documento sin contenido extraído'], 422);
        }

        $this->embeddings->delete($doc->id);
        $this->embeddings->index($doc->id, $doc->content, [
            'title' => $doc->title,
            'topic' => $doc->topic,
        ]);

        return response()->json(['ok' => true, 'doc' => $doc->fresh()]);
    }

    private function extractText(string $filePath): string
    {
        try {
            $parser = new \Smalot\PdfParser\Parser();
            $pdf    = $parser->parseFile($filePath);
            $text   = $pdf->getText();
            $text   = preg_replace('/\s+/', ' ', $text);
            return mb_substr(trim($text), 0, 80000); // 80k chars (más generoso que v1)
        } catch (\Throwable $e) {
            Log::warning('PDF text extraction failed', ['error' => $e->getMessage()]);
            return '';
        }
    }
}
