<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\File;

class IngestEntityController extends Controller
{
    /**
     * GET /api/ingest/entities — diccionario de entidades JNE (candidatos,
     * partidos, circunscripciones) que el servicio Python cachea en su Redis.
     *
     * El dataset es global (mismo para todos los tenants): vive como archivo
     * en database/data, no en la BD, así que ResolveTenant no le afecta.
     */
    public function index(): JsonResponse
    {
        $path = database_path('data/jne_entities_2026.json');

        if (!File::exists($path)) {
            return response()->json(['message' => 'Dataset de entidades no disponible.'], 503);
        }

        $data = json_decode(File::get($path), true);

        if (!is_array($data)) {
            \Log::error('jne_entities_2026.json es JSON inválido');
            return response()->json(['message' => 'Dataset de entidades corrupto.'], 500);
        }

        return response()->json($data);
    }
}
