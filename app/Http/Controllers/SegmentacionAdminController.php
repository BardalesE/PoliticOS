<?php

namespace App\Http\Controllers;

use App\Models\AiSetting;
use App\Models\CandidateProfile;
use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard de segmentación (panel admin): de dónde son los visitantes del chat,
 * sobre qué candidatos consultan y cuánto apoyo declaran. Todo AGREGADO: nunca se
 * listan personas ni votos individuales. Son datos autoseleccionados y no
 * representativos, no una encuesta científica.
 *
 *   GET /api/admin/segmentacion/resumen?nivel=departamento|provincia|distrito&parent_id=&candidate_id=
 */
class SegmentacionAdminController extends Controller
{
    private const NIVELES = [
        'departamento' => ['col' => 'departamento_id', 'parent' => null],
        'provincia'    => ['col' => 'provincia_id',    'parent' => 'departamento_id'],
        'distrito'     => ['col' => 'distrito_id',     'parent' => 'provincia_id'],
    ];

    public function resumen(Request $request): JsonResponse
    {
        $f = $request->validate([
            'nivel'        => ['nullable', 'in:departamento,provincia,distrito'],
            'parent_id'    => ['nullable', 'integer'],
            'candidate_id' => ['nullable', 'integer'],
        ]);

        $nivel = $f['nivel'] ?? 'departamento';
        $cfg   = self::NIVELES[$nivel];

        $votos = DB::table('candidate_support_votes')
            ->when(! empty($f['candidate_id']), fn ($q) => $q->where('candidate_profile_id', $f['candidate_id']));

        return response()->json([
            'aviso'        => 'Datos autoseleccionados de quienes usan el chat. No son representativos ni una encuesta científica.',
            'poll_enabled' => (bool) AiSetting::current()->support_poll_enabled,
            'kpis'         => [
                'visitantes_con_zona' => DB::table('visitor_segments')->count(),
                'consultas'           => DB::table('chat_messages')->where('role', 'user')->whereNotNull('candidate_profile_id')->count(),
                'votos'               => (clone $votos)->count(),
                'apoyo_si'            => (clone $votos)->where('supports', true)->count(),
                'apoyo_no'            => (clone $votos)->where('supports', false)->count(),
            ],
            'serie'     => $this->serie(),
            'nivel'     => $nivel,
            'zonas'     => $this->zonas($cfg, $f['parent_id'] ?? null, $f['candidate_id'] ?? null),
            'candidatos' => $this->candidatos(),
        ]);
    }

    /** Visitantes nuevos con zona, últimos 14 días (los días sin datos salen en 0). */
    private function serie(): array
    {
        $desde = now()->subDays(13)->startOfDay();

        $porDia = DB::table('visitor_segments')
            ->where('created_at', '>=', $desde)
            ->selectRaw('DATE(created_at) as dia, COUNT(*) as total')
            ->groupBy('dia')
            ->pluck('total', 'dia');

        return collect(range(0, 13))->map(function (int $i) use ($desde, $porDia) {
            $dia = $desde->copy()->addDays($i)->toDateString();
            return ['dia' => $dia, 'visitantes' => (int) ($porDia[$dia] ?? 0)];
        })->all();
    }

    private function zonas(array $cfg, ?int $parentId, ?int $candidateId): array
    {
        $col = $cfg['col'];

        $visitantes = DB::table('visitor_segments')
            ->whereNotNull($col)
            ->when($cfg['parent'] && $parentId, fn ($q) => $q->where($cfg['parent'], $parentId))
            ->selectRaw("$col as zona_id, COUNT(*) as total")
            ->groupBy($col)
            ->pluck('total', 'zona_id');

        $votos = DB::table('candidate_support_votes')
            ->whereNotNull($col)
            ->when($cfg['parent'] && $parentId, fn ($q) => $q->where($cfg['parent'], $parentId))
            ->when($candidateId, fn ($q) => $q->where('candidate_profile_id', $candidateId))
            ->selectRaw("$col as zona_id, SUM(CASE WHEN supports = 1 THEN 1 ELSE 0 END) as si, SUM(CASE WHEN supports = 0 THEN 1 ELSE 0 END) as no_")
            ->groupBy($col)
            ->get()->keyBy('zona_id');

        $ids     = $visitantes->keys()->merge($votos->keys())->unique()->values();
        $nombres = $this->nombres($col, $ids->all());

        return $ids->map(function ($id) use ($visitantes, $votos, $nombres) {
            $si = (int) ($votos[$id]->si ?? 0);
            $no = (int) ($votos[$id]->no_ ?? 0);
            return [
                'id'         => (int) $id,
                'place'      => $nombres[$id] ?? "Zona {$id}",
                'visitantes' => (int) ($visitantes[$id] ?? 0),
                'si'         => $si,
                'no'         => $no,
                'indeciso'   => 0,
                'total'      => $si + $no,
            ];
        })->sortByDesc('visitantes')->values()->all();
    }

    private function nombres(string $col, array $ids): array
    {
        if (! $ids) return [];

        return match ($col) {
            'departamento_id' => UbigeoDepartamento::whereIn('id', $ids)->pluck('departamento', 'id')->all(),
            'provincia_id'    => UbigeoProvincia::whereIn('id', $ids)->pluck('provincia', 'id')->all(),
            default           => UbigeoDistrito::whereIn('id', $ids)->pluck('distrito', 'id')->all(),
        };
    }

    /** Consultas y apoyo por candidato. */
    private function candidatos(): array
    {
        $consultas = DB::table('chat_messages')
            ->where('role', 'user')->whereNotNull('candidate_profile_id')
            ->selectRaw('candidate_profile_id as id, COUNT(*) as total')
            ->groupBy('candidate_profile_id')->pluck('total', 'id');

        $votos = DB::table('candidate_support_votes')
            ->selectRaw('candidate_profile_id as id, SUM(CASE WHEN supports = 1 THEN 1 ELSE 0 END) as si, SUM(CASE WHEN supports = 0 THEN 1 ELSE 0 END) as no_')
            ->groupBy('candidate_profile_id')->get()->keyBy('id');

        $ids = $consultas->keys()->merge($votos->keys())->unique();

        return CandidateProfile::query()->whereIn('id', $ids)->get(['id', 'name', 'party'])
            ->map(function (CandidateProfile $c) use ($consultas, $votos) {
                $si = (int) ($votos[$c->id]->si ?? 0);
                $no = (int) ($votos[$c->id]->no_ ?? 0);
                return [
                    'id'        => $c->id,
                    'name'      => $c->name,
                    'party'     => $c->party,
                    'consultas' => (int) ($consultas[$c->id] ?? 0),
                    'si'        => $si,
                    'no'        => $no,
                    'pct_si'    => ($si + $no) > 0 ? round($si * 100 / ($si + $no)) : null,
                ];
            })
            ->sortByDesc('consultas')->values()->all();
    }
}
