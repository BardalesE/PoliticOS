<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Calificacion de la plataforma (1-5 estrellas) + comentario libre.
 * Anonimo por diseno. Vive en la BD central: es feedback de producto, no de tenant.
 *
 *   POST /api/feedback         -> guarda una calificacion
 *   GET  /api/feedback/summary -> { average, total } para mostrar en vivo
 */
class PlatformFeedbackController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'stars'           => ['required', 'integer', 'min:1', 'max:5'],
            'comment'         => ['nullable', 'string', 'max:500'],
            'context'         => ['nullable', 'string', 'in:chat,home'],
            'candidate_slug'  => ['nullable', 'string', 'max:80'],
            'tenant_slug'     => ['nullable', 'string', 'max:80'],
        ]);

        if ($v->fails()) {
            return response()->json(['message' => 'Datos invalidos.', 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();

        DB::connection('central')->table('platform_feedback')->insert([
            'stars'          => $data['stars'],
            'comment'        => $data['comment'] ?? null,
            'context'        => $data['context'] ?? 'chat',
            'candidate_slug' => $data['candidate_slug'] ?? null,
            'tenant_slug'    => $data['tenant_slug'] ?? null,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        Cache::forget('platform_feedback:summary');

        return response()->json(['ok' => true], 201);
    }

    public function summary(): JsonResponse
    {
        $summary = Cache::remember('platform_feedback:summary', 60, function () {
            $row = DB::connection('central')->table('platform_feedback')
                ->selectRaw('COUNT(*) as total, COALESCE(AVG(stars), 0) as average')
                ->first();

            return [
                'total'   => (int) ($row->total ?? 0),
                'average' => round((float) ($row->average ?? 0), 2),
            ];
        });

        return response()->json($summary);
    }
}
