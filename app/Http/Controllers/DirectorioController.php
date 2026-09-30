<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use App\Models\KnowledgeDocument;
use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;
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
    /**
     * Árbol de lugares con candidatos. Cada nivel cuenta a sus propios
     * candidatos (regionales en el departamento, provinciales en la provincia,
     * distritales en el distrito); `candidatos` de un nodo suma todo lo que hay debajo.
     */
    public function ubicaciones(): JsonResponse
    {
        $visibles = CandidateProfile::query()->visibleInDirectory()
            ->get(['id', 'departamento_id', 'provincia_id', 'distrito_id']);

        if ($visibles->isEmpty()) {
            return response()->json([
                'departamentos'    => [],
                'total_candidatos' => 0,
                'total_distritos'  => 0,
            ]);
        }

        $porDistrito  = $visibles->whereNotNull('distrito_id')->countBy('distrito_id');
        $porProvincia = $visibles->whereNull('distrito_id')->whereNotNull('provincia_id')->countBy('provincia_id');
        $porRegion    = $visibles->whereNull('provincia_id')->whereNull('distrito_id')->countBy('departamento_id');

        $distritos  = UbigeoDistrito::query()->whereIn('id', $porDistrito->keys())->get(['id', 'ubigeo', 'distrito', 'provincia_id', 'departamento_id']);
        $provIds    = $distritos->pluck('provincia_id')->merge($porProvincia->keys())->unique();
        $provincias = UbigeoProvincia::query()->whereIn('id', $provIds)->get(['id', 'ubigeo', 'provincia', 'departamento_id'])->keyBy('id');
        $depIds     = $provincias->pluck('departamento_id')->merge($porRegion->keys())->unique();
        $deps       = UbigeoDepartamento::query()->whereIn('id', $depIds)->get(['id', 'ubigeo', 'departamento'])->keyBy('id');

        $arbol = [];
        foreach ($deps as $dep) {
            $arbol[$dep->id] = [
                'id' => $dep->id, 'ubigeo' => $dep->ubigeo, 'nombre' => $dep->departamento,
                'candidatos' => 0, 'regionales' => (int) ($porRegion[$dep->id] ?? 0), 'provincias' => [],
            ];
            $arbol[$dep->id]['candidatos'] += $arbol[$dep->id]['regionales'];
        }
        foreach ($provincias as $prov) {
            $n = (int) ($porProvincia[$prov->id] ?? 0);
            $arbol[$prov->departamento_id]['provincias'][$prov->id] = [
                'id' => $prov->id, 'ubigeo' => $prov->ubigeo, 'nombre' => $prov->provincia,
                'candidatos' => $n, 'provinciales' => $n, 'distritos' => [],
            ];
            $arbol[$prov->departamento_id]['candidatos'] += $n;
        }
        foreach ($distritos as $d) {
            $n = (int) $porDistrito[$d->id];
            $arbol[$d->departamento_id]['provincias'][$d->provincia_id]['distritos'][] = [
                'id' => $d->id, 'ubigeo' => $d->ubigeo, 'nombre' => $d->distrito, 'candidatos' => $n,
            ];
            $arbol[$d->departamento_id]['provincias'][$d->provincia_id]['candidatos'] += $n;
            $arbol[$d->departamento_id]['candidatos'] += $n;
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
            'total_candidatos' => $visibles->count(),
            'total_distritos'  => $porDistrito->count(),
        ]);
    }

    /**
     * Candidatos por los que vota quien vive en un lugar: los del propio nivel y
     * los de los niveles de arriba (el distrito ve también a su alcalde
     * provincial y a su gobernador regional).
     */
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
            $d = UbigeoDistrito::query()->find($filtros['distrito_id'], ['id', 'provincia_id', 'departamento_id']);
            $query->votaEn($d?->departamento_id, $d?->provincia_id, (int) $filtros['distrito_id']);
        } elseif (! empty($filtros['provincia_id'])) {
            $p = UbigeoProvincia::query()->find($filtros['provincia_id'], ['id', 'departamento_id']);
            $query->votaEn($p?->departamento_id, (int) $filtros['provincia_id']);
        } elseif (! empty($filtros['departamento_id'])) {
            $query->votaEn((int) $filtros['departamento_id']);
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

        // Las Hojas de Vida de los regidores van en su propia sección, no en
        // la lista de documentos del candidato.
        try {
            $regidores = $c->regidores()->with('hojaDeVida:id,is_active,status')->get();
        } catch (\Throwable) {
            $regidores = collect();   // tenant sin la migración nueva: ficha sin regidores
        }
        $docsRegidores = $regidores->pluck('knowledge_document_id')->filter()->all();

        $documentos = $c->documents()
            ->where('is_active', true)->where('status', 'ready')
            ->whereNotIn('id', $docsRegidores)
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
            'regidores'    => $regidores->map(fn ($r) => [
                'orden'       => $r->orden,
                'nombre'      => $r->nombre,
                'cargo'       => $r->cargo,
                'foto_url'    => $r->foto_url,
                // Solo si PEPA ya puede usarla. El PDF nunca se enlaza (DNI y patrimonio).
                'hoja_de_vida' => (bool) ($r->hojaDeVida?->is_active && $r->hojaDeVida?->status === 'ready'),
            ])->values(),
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
            'ambito'      => $c->ambito,   // regional | provincial | distrital
            // Para abrir el chat en la zona correcta aunque no tenga distrito (regional/provincial).
            'departamento_id' => $c->departamento_id ?? $c->distrito?->departamento_id,
            'provincia_id'    => $c->provincia_id ?? $c->distrito?->provincia_id,
            // Distintivo "Perfil completado por el candidato". Nunca afecta el orden
            // del listado ni el trato de la IA (neutralidad).
            'perfil_completado' => $c->tipo_cuenta === 'cliente_pago',
        ];
    }
}
