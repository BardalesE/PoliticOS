<?php

namespace App\Http\Controllers;

use App\Models\ExternalSignal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExternalSignalController extends Controller
{
    /** POST /api/admin/external-signals/ingest — recibido del servicio Python */
    public function ingest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'signals' => ['required','array','min:1','max:200'],
            'signals.*.source' => ['required','in:twitter,news,youtube_comment,tiktok,facebook,poll,gov_pdf,blog,reddit,manual'],
            'signals.*.source_url' => ['nullable','string','max:500'],
            'signals.*.source_name' => ['nullable','string','max:120'],
            'signals.*.author' => ['nullable','string','max:120'],
            'signals.*.title' => ['nullable','string','max:500'],
            'signals.*.content' => ['required','string','max:10000'],
            'signals.*.mentions' => ['nullable','array'],
            'signals.*.sentiment' => ['nullable','numeric','min:-1','max:1'],
            'signals.*.emotion' => ['nullable','string','max:20'],
            'signals.*.topic' => ['nullable','string','max:40'],
            'signals.*.is_attack' => ['nullable','boolean'],
            'signals.*.target_candidate' => ['nullable','string','max:40'],
            'signals.*.engagement' => ['nullable','integer','min:0'],
            'signals.*.captured_at' => ['required','date'],
        ]);

        $created = 0;
        foreach ($data['signals'] as $s) {
            try {
                ExternalSignal::updateOrCreate(
                    ['source' => $s['source'], 'source_url' => $s['source_url'] ?? null],
                    $s
                );
                $created++;
            } catch (\Throwable $e) {
                \Log::warning('ExternalSignal ingest failed', ['error' => $e->getMessage()]);
            }
        }

        return response()->json(['ingested' => $created]);
    }

    /** GET /api/admin/external-signals */
    public function index(Request $request): JsonResponse
    {
        $q = ExternalSignal::query()->orderByDesc('captured_at');

        if ($s = $request->query('source')) $q->where('source', $s);
        if ($t = $request->query('topic')) $q->where('topic', $t);
        if ($request->boolean('attacks_only')) $q->where('is_attack', true);

        return response()->json($q->paginate(30));
    }
}
