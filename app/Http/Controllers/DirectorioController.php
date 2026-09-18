<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use App\Models\UbigeoDistrito;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * API PÚBLICA del directorio de candidatos (solo lectura).
 *
 *   GET /api/directorio/ubicaciones        → árbol depto > provincia > distrito
 *                                            SOLO con lugares que tienen candidato
 *                                            publicado + base de conocimiento lista
 *   GET /api/directorio/candidatos         → candidatos visibles (filtros por lugar)
 *   GET /api/directorio/candidatos/{slug}  → ficha de un candidato + sus documentos
 *
 * Toda la visibilidad sale de CandidateProfile::visibleInDirectory(): el
 * frontend nunca decide qué mostrar. Las respuestas son listas blancas de
 * campos — jamás se serializa el modelo entero.
 */
class DirectorioController extends Controller
{
    public function ubicaciones(): JsonResponse
    {
        $porDistrito = CandidateProfile::query()
            ->visibleInDirectory()
            ->selectRaw('distrito_id, COUNT(*) as total')
            ->groupBy('distrito_id')
            ->pluck('total', 'distrito_id');

        if ($porDistrito->isEmpty()) {
            return response()->json([
                'departamentos'    => [],
                'total_candidatos' => 0,
                'total_distritos'  => 0,
            ]);
        }

        $distritos = UbigeoDistrito::query()
            ->with(['provincia:id,provincia,ubigeo', 'departamento:id,departamento,ubigeo'])
            ->whereIn('id', $porDistrito->keys())
            ->get();

        $arbol = [];
        foreach ($distritos as $d) {
            $n = (int) $porDistrito[$d->id];

            $dep = &$arbol[$d->departamento_id];
            $dep ??= [
                'id' => $d->departamento->id, 'ubigeo' => $d->departamento->ubigeo,
                'nombre' => $d->departamento->departamento, 'candidatos' => 0, 'provincias' => [],
            ];
            $dep['candidatos'] += $n;

            $prov = &$dep['provincias'][$d->provincia_id];
            $prov ??= [
                'id' => $d->provincia->id, 'ubigeo' => $d->provincia->ubigeo,
                'nombre' => $d->provincia->provincia, 'candidatos' => 0, 'distritos' => [],
            ];
            $prov['candidatos'] += $n;

            $prov['distritos'][] = [
                'id' => $d->id, 'ubigeo' => $d->ubigeo, 'nombre' => $d->distrito, 'candidatos' => $n,
            ];
            unset($dep, $prov);
        }

        // Índices numéricos + orden alfabético estable para el frontend.
        $departamentos = collect($arbol)->map(function (array $dep) {
            $dep['provincias'] = collect($dep['provincias'])->map(function (array $prov) {
                $prov['distritos'] = collect($prov['distritos'])->sortBy('nombre', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();
                return $prov;
            })->sortBy('nombre', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();
            return $dep;
        })->sortBy('nombre', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();

        return response()->json([
            'departamentos'    => $departamentos,
            'total_candidatos' => (int) $porDistrito->sum(),
            'total_distritos'  => $porDistrito->count(),
        ]);
    }

    public function candidatos(Request $request): JsonResponse
    {
        $filtros = $request->validate([
            'distrito_id'      => ['nullable', 'integer'],
            'provincia_id'     => ['nullable', 'integer'],
            'departamento_id'  => ['nullable', 'integer'],
        ]);

        $query = CandidateProfile::query()
            ->visibleInDirectory()
            ->with(['distrito.provincia:id,provincia', 'distrito.departamento:id,departamento'])
            ->withCount(['documents as documentos_count' => fn (Builder $d) => $d->where('is_active', true)->where('status', 'ready')])
            ->orderBy('name');

        if (! empty($filtros['distrito_id'])) {
            $query->where('distrito_id', $filtros['distrito_id']);
        }
        if (! empty($filtros['provincia_id'])) {
            $query->whereHas('distrito', fn (Builder $d) => $d->where('provincia_id', $filtros['provincia_id']));
        }
        if (! empty($filtros['departamento_id'])) {
            $query->whereHas('distrito', fn (Builder $d) => $d->where('departamento_id', $filtros['departamento_id']));
        }

        return response()->json([
            'data' => $query->limit(200)->get()->map(fn (CandidateProfile $c) => $this->resumen($c))->all(),
        ]);
    }

    public function show(string $slug): JsonResponse
    {
        $c = CandidateProfile::query()
            ->visibleInDirectory()
            ->with(['distrito.provincia:id,provincia', 'distrito.departamento:id,departamento'])
            ->where('slug', $slug)
            ->firstOrFail();

        $documentos = $c->documents()
            ->where('is_active', true)->where('status', 'ready')
            ->orderBy('created_at')
            // Nunca `content` (texto completo extraído para el RAG).
            ->get(['id', 'title', 'description', 'topic', 'file_url', 'source_url', 'source_type', 'file_size', 'created_at']);

        return response()->json($this->resumen($c) + [
            'bio'          => $c->bio,
            'tagline'      => $c->tagline,
            'tiktok_url'   => $c->tiktok_url,
            'facebook_url' => $c->facebook_url,
            'instagram_url' => $c->instagram_url,
            'documentos'   => $documentos,
        ]);
    }

    /** Campos públicos mínimos de un candidato (lista blanca). */
    private function resumen(CandidateProfile $c): array
    {
        return [
            'id'          => $c->id,
            'slug'        => $c->slug,
            'name'        => $c->name,
            'title'       => $c->title,        // cargo al que postula
            'party'       => $c->party,
            'list_number' => $c->list_number,
            'photo_url'   => $c->photo_url,
            'location'    => $c->location,
            'distrito'    => $c->distrito ? [
                'id'           => $c->distrito->id,
                'nombre'       => $c->distrito->distrito,
                'provincia'    => $c->distrito->provincia?->provincia,
                'departamento' => $c->distrito->departamento?->departamento,
            ] : null,
            'documentos_count' => (int) ($c->documentos_count ?? 0),
        ];
    }
}
