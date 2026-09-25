<?php

namespace App\Http\Controllers;

use App\Models\AiSetting;
use App\Models\CandidateProfile;
use App\Models\CandidateSupportVote;
use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;
use App\Models\VisitorSegment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Segmentador del chat + mini encuesta de apoyo. API PÚBLICA (anónima).
 *
 *   GET  /api/segmentacion/zona          → zona guardada del visitante + candidatos + sus votos
 *   PUT  /api/segmentacion/zona          → declara su zona (departamento, provincia o distrito);
 *                                          devuelve lo mismo
 *   POST /api/segmentacion/apoyo         → voto sí/no a un candidato (uno por visitante)
 *
 * El visitante se identifica solo por el UUID estable de su navegador (`visitor_id`,
 * ver CaptureRequestContext). No se guarda nombre, IP ni contacto: una opinión
 * política es dato sensible (Ley 29733) y esto NO es una encuesta científica, por
 * eso los resultados jamás se exponen aquí: solo los ve el panel admin, agregados.
 */
class SegmentacionController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json($this->estado($this->visitor($request)));
    }

    /**
     * La zona puede ser de cualquier nivel: basta con mandar el más específico que
     * conozca el visitante (los superiores se derivan). Elegir un distrito muestra
     * SOLO los candidatos de ese distrito; una provincia, los de todos sus
     * distritos; un departamento, todos los del departamento.
     */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'departamento_id' => ['nullable', 'integer', 'required_without_all:provincia_id,distrito_id'],
            'provincia_id'    => ['nullable', 'integer'],
            'distrito_id'     => ['nullable', 'integer'],
        ]);

        $zona = $this->resolverZona($data);
        if (! $zona) {
            return response()->json(['message' => 'Zona no válida.'], 422);
        }

        VisitorSegment::updateOrCreate(['visitor_uuid' => $this->visitor($request)], $zona);

        return response()->json($this->estado($this->visitor($request)));
    }

    public function apoyo(Request $request): JsonResponse
    {
        if (! AiSetting::current()->support_poll_enabled) {
            return response()->json(['message' => 'La encuesta no está habilitada.'], 403);
        }

        $data = $request->validate([
            'candidate_slug' => ['required', 'string', 'max:120'],
            'supports'       => ['required', 'boolean'],
        ]);

        $candidate = CandidateProfile::query()->visibleInDirectory()->where('slug', $data['candidate_slug'])->first();
        if (! $candidate) {
            return response()->json(['message' => 'Candidato no encontrado.'], 404);
        }

        $uuid = $this->visitor($request);
        $zona = VisitorSegment::where('visitor_uuid', $uuid)->first();

        CandidateSupportVote::updateOrCreate(
            ['candidate_profile_id' => $candidate->id, 'visitor_uuid' => $uuid],
            [
                'supports'        => (bool) $data['supports'],
                'departamento_id' => $zona?->departamento_id,
                'provincia_id'    => $zona?->provincia_id,
                'distrito_id'     => $zona?->distrito_id,
            ]
        );

        return response()->json(['ok' => true, 'votos' => $this->votosDe($uuid)]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    private function visitor(Request $request): string
    {
        return (string) ($request->attributes->get('request_context')['visitor_uuid'] ?? '');
    }

    /** @return array<string,bool> slug => apoya */
    private function votosDe(string $uuid): array
    {
        $votos = CandidateSupportVote::query()->where('visitor_uuid', $uuid)->pluck('supports', 'candidate_profile_id');
        if ($votos->isEmpty()) {
            return [];
        }

        return CandidateProfile::query()
            ->whereIn('id', $votos->keys())->whereNotNull('slug')
            ->pluck('slug', 'id')
            ->mapWithKeys(fn ($slug, $id) => [$slug => (bool) $votos[$id]])
            ->all();
    }

    /** @return array{departamento_id:int,provincia_id:?int,distrito_id:?int}|null */
    private function resolverZona(array $data): ?array
    {
        if (! empty($data['distrito_id'])) {
            $d = UbigeoDistrito::find($data['distrito_id']);

            return $d ? ['departamento_id' => $d->departamento_id, 'provincia_id' => $d->provincia_id, 'distrito_id' => $d->id] : null;
        }

        if (! empty($data['provincia_id'])) {
            $p = UbigeoProvincia::find($data['provincia_id']);

            return $p ? ['departamento_id' => $p->departamento_id, 'provincia_id' => $p->id, 'distrito_id' => null] : null;
        }

        $dep = UbigeoDepartamento::find($data['departamento_id'] ?? 0);

        return $dep ? ['departamento_id' => $dep->id, 'provincia_id' => null, 'distrito_id' => null] : null;
    }

    private function estado(string $uuid): array
    {
        $segmento = VisitorSegment::where('visitor_uuid', $uuid)->first();
        $pollOn   = (bool) AiSetting::current()->support_poll_enabled;

        if (! $segmento || ! $segmento->departamento_id) {
            return ['zona' => null, 'candidatos' => [], 'poll_enabled' => $pollOn, 'votos' => (object) []];
        }

        $dep  = UbigeoDepartamento::find($segmento->departamento_id);
        $prov = $segmento->provincia_id ? UbigeoProvincia::find($segmento->provincia_id) : null;
        $dist = $segmento->distrito_id ? UbigeoDistrito::find($segmento->distrito_id) : null;

        if (! $dep) {
            return ['zona' => null, 'candidatos' => [], 'poll_enabled' => $pollOn, 'votos' => (object) []];
        }

        return [
            'zona' => [
                'nivel'           => $dist ? 'distrito' : ($prov ? 'provincia' : 'departamento'),
                'departamento_id' => $dep->id,
                'provincia_id'    => $prov?->id,
                'distrito_id'     => $dist?->id,
                'departamento'    => $dep->departamento,
                'provincia'       => $prov?->provincia,
                'distrito'        => $dist?->distrito,
            ],
            'candidatos'   => $this->candidatosDe($segmento),
            'poll_enabled' => $pollOn,
            'votos'        => (object) $this->votosDe($uuid),
        ];
    }

    /**
     * Candidatos EXACTOS de la zona elegida, sin relleno ni tope:
     *   distrito     → solo los de ese distrito (aunque sea uno)
     *   provincia    → los de todos los distritos de la provincia
     *   departamento → los de todos los distritos del departamento
     */
    private function candidatosDe(VisitorSegment $z): array
    {
        return CandidateProfile::query()
            ->visibleInDirectory()
            ->with('distrito:id,distrito')
            ->when($z->distrito_id, fn ($q) => $q->where('distrito_id', $z->distrito_id), function ($q) use ($z) {
                $q->whereHas('distrito', fn ($d) => $z->provincia_id
                    ? $d->where('provincia_id', $z->provincia_id)
                    : $d->where('departamento_id', $z->departamento_id));
            })
            ->orderBy('name')
            ->limit(200)
            ->get()
            ->map(fn (CandidateProfile $c) => [
                'slug'        => $c->slug,
                'name'        => $c->name,
                'party'       => $c->party,
                'title'       => $c->title,
                'list_number' => $c->list_number,
                'photo_url'   => $c->photo_url,
                'logo_url'    => $c->logo_url,
                'distrito'    => $c->distrito?->distrito,
            ])
            ->all();
    }
}
