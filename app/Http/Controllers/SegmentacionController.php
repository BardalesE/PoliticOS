<?php

namespace App\Http\Controllers;

use App\Models\AiSetting;
use App\Models\CandidateProfile;
use App\Models\CandidateSupportVote;
use App\Models\UbigeoDistrito;
use App\Models\VisitorSegment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Segmentador del chat + mini encuesta de apoyo. API PÚBLICA (anónima).
 *
 *   GET  /api/segmentacion/zona          → zona guardada del visitante + candidatos + sus votos
 *   PUT  /api/segmentacion/zona          → declara su distrito; devuelve lo mismo
 *   POST /api/segmentacion/apoyo         → voto sí/no a un candidato (uno por visitante)
 *
 * El visitante se identifica solo por el UUID estable de su navegador (`visitor_id`,
 * ver CaptureRequestContext). No se guarda nombre, IP ni contacto: una opinión
 * política es dato sensible (Ley 29733) y esto NO es una encuesta científica, por
 * eso los resultados jamás se exponen aquí: solo los ve el panel admin, agregados.
 */
class SegmentacionController extends Controller
{
    /** Candidatos que se ofrecen por zona: los 5 más cercanos. */
    public const MAX_CANDIDATOS = 5;

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->estado($this->visitor($request)));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['distrito_id' => ['required', 'integer']]);

        $distrito = UbigeoDistrito::find($data['distrito_id']);
        if (! $distrito) {
            return response()->json(['message' => 'Distrito no válido.'], 422);
        }

        $uuid = $this->visitor($request);
        VisitorSegment::updateOrCreate(['visitor_uuid' => $uuid], [
            'departamento_id' => $distrito->departamento_id,
            'provincia_id'    => $distrito->provincia_id,
            'distrito_id'     => $distrito->id,
        ]);

        return response()->json($this->estado($uuid));
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

    private function estado(string $uuid): array
    {
        $segmento = VisitorSegment::where('visitor_uuid', $uuid)->first();
        $pollOn   = (bool) AiSetting::current()->support_poll_enabled;

        if (! $segmento || ! $segmento->distrito_id) {
            return ['zona' => null, 'candidatos' => [], 'poll_enabled' => $pollOn, 'votos' => (object) []];
        }

        $distrito = UbigeoDistrito::with(['provincia:id,provincia', 'departamento:id,departamento'])->find($segmento->distrito_id);

        return [
            'zona' => $distrito ? [
                'distrito_id'     => $distrito->id,
                'provincia_id'    => $distrito->provincia_id,
                'departamento_id' => $distrito->departamento_id,
                'distrito'        => $distrito->distrito,
                'provincia'       => $distrito->provincia?->provincia,
                'departamento'    => $distrito->departamento?->departamento,
            ] : null,
            'candidatos'   => $distrito ? $this->candidatosCercanos($distrito) : [],
            'poll_enabled' => $pollOn,
            'votos'        => (object) $this->votosDe($uuid),
        ];
    }

    /**
     * Hasta 5 candidatos: primero los del distrito, luego los de la provincia y, si
     * aún faltan, los del departamento. Nunca de otro departamento.
     */
    private function candidatosCercanos(UbigeoDistrito $d): array
    {
        $candidatos = CandidateProfile::query()
            ->visibleInDirectory()
            ->whereHas('distrito', fn ($q) => $q->where('departamento_id', $d->departamento_id))
            ->with('distrito:id,provincia_id,departamento_id')
            ->orderBy('name')
            ->limit(200)
            ->get();

        $alcance = fn (CandidateProfile $c): int => match (true) {
            $c->distrito_id === $d->id                   => 0,
            $c->distrito?->provincia_id === $d->provincia_id => 1,
            default                                      => 2,
        };

        return $candidatos
            ->sortBy(fn (CandidateProfile $c) => sprintf('%d|%s', $alcance($c), mb_strtolower($c->name)))
            ->take(self::MAX_CANDIDATOS)
            ->map(fn (CandidateProfile $c) => [
                'slug'        => $c->slug,
                'name'        => $c->name,
                'party'       => $c->party,
                'title'       => $c->title,
                'list_number' => $c->list_number,
                'photo_url'   => $c->photo_url,
                'alcance'     => ['distrito', 'provincia', 'departamento'][$alcance($c)],
            ])
            ->values()
            ->all();
    }
}
