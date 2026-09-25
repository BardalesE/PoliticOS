<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use App\Models\KnowledgeDocument;
use App\Models\UbigeoDistrito;
use App\Support\SensitiveData;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;
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
 *   GET /api/directorio/documentos/{id}/pdf → el PDF de un documento (para el visor
 *                                            del chat que resalta la cita). Nunca
 *                                            una hoja de vida: trae DNI y patrimonio.
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
            ->get(['id', 'title', 'description', 'topic', 'file_url', 'source_url', 'source_type', 'file_size', 'created_at'])
            // La hoja de vida original trae DNI y patrimonio: no se publica su enlace.
            ->map(function ($d) {
                if (SensitiveData::isHojaDeVida($d->topic, $d->title)) {
                    $d->file_url = null;
                    $d->source_url = null;
                }
                return $d;
            });

        return response()->json($this->resumen($c) + [
            'bio'          => $c->bio,
            'tagline'      => $c->tagline,
            'tiktok_url'   => $c->tiktok_url,
            'facebook_url' => $c->facebook_url,
            'instagram_url' => $c->instagram_url,
            'documentos'   => $documentos,
        ]);
    }

    /**
     * Sirve el PDF desde el mismo origen del API: el bucket público (R2) no
     * permite CORS, así que el visor del chat (pdf.js) no podía leerlo directo.
     */
    public function documentoPdf(int $id): Response
    {
        $doc = KnowledgeDocument::query()
            ->where('is_active', true)
            ->where('status', 'ready')
            ->whereNotNull('candidate_id')
            ->findOrFail($id, ['id', 'title', 'topic', 'file_url', 'source_type', 'candidate_id']);

        abort_if(SensitiveData::isHojaDeVida($doc->topic, $doc->title), 404);
        abort_if(($doc->source_type ?? 'pdf') !== 'pdf' || ! $doc->file_url, 404);
        // Solo documentos de candidatos visibles en el directorio.
        abort_unless(CandidateProfile::query()->visibleInDirectory()->whereKey($doc->candidate_id)->exists(), 404);

        $disk = config('filesystems.media');
        $base = Storage::disk($disk)->url('');
        $path = ltrim(str_replace($base, '', (string) $doc->file_url), '/');
        $raw  = Storage::disk($disk)->get($path);
        abort_if($raw === null, 404);

        return response($raw, 200, [
            'Content-Type'           => 'application/pdf',
            'Content-Disposition'    => 'inline; filename="documento-' . $doc->id . '.pdf"',
            'Cache-Control'          => 'public, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
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
            'logo_url'    => $c->logo_url,    // símbolo del partido: así lo reconoce el votante
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
