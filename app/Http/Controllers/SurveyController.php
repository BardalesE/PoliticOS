<?php

namespace App\Http\Controllers;

use App\Models\SurveyJourney;
use App\Models\SurveyResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SurveyController extends Controller
{
    // ─── GET /api/admin/surveys/journeys ─────────────────────────────────
    // Lista de jornadas con conteo de respuestas (para el selector de captura
    // y el dashboard). Escribe/lee en la BD del tenant (ResolveTenant ya conmutó).
    public function journeys(Request $request): JsonResponse
    {
        $journeys = SurveyJourney::withCount('responses')
            ->orderByDesc('surveyed_on')
            ->orderByDesc('id')
            ->get()
            ->map(fn ($j) => [
                'id'              => $j->id,
                'client_uuid'     => $j->client_uuid,
                'place'           => $j->place,
                'district'        => $j->district,
                'province'        => $j->province,
                'surveyed_on'     => $j->surveyed_on?->toDateString(),
                'label'           => $j->label,
                'responses_count' => $j->responses_count,
            ]);

        return response()->json(['journeys' => $journeys]);
    }

    // ─── POST /api/admin/surveys/journeys ────────────────────────────────
    // Crear una jornada desde el panel (sin sync). El offline usa /sync.
    public function storeJourney(Request $request): JsonResponse
    {
        $data = $request->validate([
            'client_uuid' => ['nullable', 'uuid'],
            'place'       => ['required', 'string', 'max:150'],
            'district'    => ['nullable', 'string', 'max:100'],
            'province'    => ['nullable', 'string', 'max:100'],
            'surveyed_on' => ['required', 'date'],
        ]);

        $journey = SurveyJourney::create([
            ...$data,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json(['journey' => $journey], 201);
    }

    // ─── POST /api/admin/surveys/sync ────────────────────────────────────
    // Sincronización offline-first en lote. Idempotente en dos niveles:
    //   - jornada: firstOrCreate por client_uuid
    //   - respuesta: firstOrCreate por client_uuid
    // Reenviar el mismo lote NO duplica jornadas ni votos.
    public function sync(Request $request): JsonResponse
    {
        $data = $request->validate([
            'journey'                       => ['required', 'array'],
            'journey.client_uuid'           => ['required', 'uuid'],
            'journey.place'                 => ['required', 'string', 'max:150'],
            'journey.district'              => ['nullable', 'string', 'max:100'],
            'journey.province'              => ['nullable', 'string', 'max:100'],
            'journey.surveyed_on'           => ['required', 'date'],

            'responses'                     => ['present', 'array', 'max:1000'],
            'responses.*.client_uuid'       => ['required', 'uuid'],
            'responses.*.vote_intention'    => ['required', 'in:si,no,indeciso'],
            'responses.*.knew_proposal'     => ['nullable', 'boolean'],
            'responses.*.consent'           => ['nullable', 'boolean'],
            'responses.*.name'              => ['nullable', 'string', 'max:150'],
            'responses.*.phone'             => ['nullable', 'string', 'max:20'],
            'responses.*.dni'               => ['nullable', 'string', 'max:20'],
            'responses.*.age'               => ['nullable', 'integer', 'between:1,120'],
            'responses.*.sex'               => ['nullable', 'in:M,F,otro'],
            'responses.*.captured_at'       => ['nullable', 'date'],
        ]);

        $userId = $request->user()?->id;

        DB::beginTransaction();
        try {
            $j = $data['journey'];

            $journey = SurveyJourney::firstOrCreate(
                ['client_uuid' => $j['client_uuid']],
                [
                    'place'       => $j['place'],
                    'district'    => $j['district']    ?? null,
                    'province'    => $j['province']    ?? null,
                    'surveyed_on' => $j['surveyed_on'],
                    'created_by'  => $userId,
                ]
            );

            $created    = 0;
            $duplicated = 0;

            foreach ($data['responses'] as $r) {
                $consented = (bool) ($r['consent'] ?? false);

                // Sin consentimiento → NO se guardan datos personales (Ley 29733)
                $personal = $consented ? [
                    'name'  => $r['name']  ?? null,
                    'phone' => $r['phone'] ?? null,
                    'dni'   => $r['dni']   ?? null,
                    'age'   => $r['age']   ?? null,
                    'sex'   => $r['sex']   ?? null,
                ] : [
                    'name' => null, 'phone' => null, 'dni' => null, 'age' => null, 'sex' => null,
                ];

                $response = SurveyResponse::firstOrCreate(
                    ['client_uuid' => $r['client_uuid']],
                    [
                        'survey_journey_id' => $journey->id,
                        'vote_intention'    => $r['vote_intention'],
                        'knew_proposal'     => $r['knew_proposal'] ?? null,
                        'consented'         => $consented,
                        'consent_ip'        => $consented ? $request->ip() : null,
                        ...$personal,
                        'captured_at'       => $r['captured_at'] ?? now(),
                        'created_by'        => $userId,
                    ]
                );

                $response->wasRecentlyCreated ? $created++ : $duplicated++;
            }

            DB::commit();

            return response()->json([
                'status'       => 'ok',
                'journey_id'   => $journey->id,
                'created'      => $created,      // respuestas nuevas guardadas
                'duplicated'   => $duplicated,   // ya existían (dedup) — no se duplicaron
                'received'     => count($data['responses']),
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Survey sync failed', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Error al sincronizar. Reintenta; no se duplicarán los votos ya guardados.'], 500);
        }
    }

    // ─── GET /api/admin/surveys/dashboard ────────────────────────────────
    // Métricas para el dashboard con gráficos. Reemplaza el "mapa" por apoyo
    // agregado por lugar/distrito (sin GPS).
    public function dashboard(Request $request): JsonResponse
    {
        $base = SurveyResponse::query();
        if ($request->filled('journey_id')) {
            $base->where('survey_journey_id', $request->integer('journey_id'));
        }

        $total = (clone $base)->count();

        // Apoyo global (sí / no / indeciso)
        $byIntention = (clone $base)
            ->selectRaw('vote_intention, COUNT(*) as count')
            ->groupBy('vote_intention')
            ->pluck('count', 'vote_intention');

        $support = [
            'si'       => (int) ($byIntention['si']       ?? 0),
            'no'       => (int) ($byIntention['no']       ?? 0),
            'indeciso' => (int) ($byIntention['indeciso'] ?? 0),
        ];

        // ¿Conocía la propuesta? (solo respuestas donde se marcó el campo)
        $knew    = (int) (clone $base)->where('knew_proposal', true)->count();
        $notKnew = (int) (clone $base)->where('knew_proposal', false)->count();

        // Apoyo por lugar/distrito — agrupa por la jornada (place + district).
        // Reemplaza al mapa: distribución de apoyo sin coordenadas.
        // Expresión de agrupación: distrito si existe, si no el lugar. Se agrupa
        // por la expresión completa (no por el alias) por compatibilidad con
        // only_full_group_by de MySQL.
        $placeExpr = "COALESCE(NULLIF(survey_journeys.district, ''), survey_journeys.place)";

        $byPlace = (clone $base)
            ->join('survey_journeys', 'survey_responses.survey_journey_id', '=', 'survey_journeys.id')
            ->selectRaw("
                {$placeExpr} as place,
                SUM(vote_intention = 'si')       as si,
                SUM(vote_intention = 'no')       as no,
                SUM(vote_intention = 'indeciso') as indeciso,
                COUNT(*) as total
            ")
            ->groupByRaw($placeExpr)
            ->orderByDesc('total')
            ->limit(15)
            ->get()
            ->map(fn ($row) => [
                'place'    => $row->place,
                'si'       => (int) $row->si,
                'no'       => (int) $row->no,
                'indeciso' => (int) $row->indeciso,
                'total'    => (int) $row->total,
            ]);

        return response()->json([
            'total'          => $total,
            'journeys_count' => SurveyJourney::count(),
            'support'        => $support,
            'knew_proposal'  => ['knew' => $knew, 'not_knew' => $notKnew],
            'by_place'       => $byPlace,
        ]);
    }

    // ─── GET /api/admin/surveys/export ───────────────────────────────────
    // CSV con BOM UTF-8 (Excel lo abre nativo). Mismo patrón que CitizenController.
    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $query = SurveyResponse::query()
            ->join('survey_journeys', 'survey_responses.survey_journey_id', '=', 'survey_journeys.id')
            ->select([
                'survey_responses.*',
                'survey_journeys.place as journey_place',
                'survey_journeys.district as journey_district',
                'survey_journeys.province as journey_province',
                'survey_journeys.surveyed_on as journey_date',
            ])
            ->orderByDesc('survey_responses.created_at');

        if ($request->filled('journey_id')) {
            $query->where('survey_responses.survey_journey_id', $request->integer('journey_id'));
        }

        $intentionLabel = ['si' => 'Sí', 'no' => 'No', 'indeciso' => 'Indeciso'];

        $headers = [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="encuestas_' . now()->format('Ymd_His') . '.csv"',
        ];

        return response()->streamDownload(function () use ($query, $intentionLabel) {
            $handle = fopen('php://output', 'w');
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF)); // BOM UTF-8
            fputcsv($handle, [
                'Lugar', 'Distrito', 'Provincia', 'Fecha jornada',
                'Intención de voto', 'Conocía la propuesta', 'Consintió datos',
                'Nombre', 'Celular', 'DNI', 'Edad', 'Sexo', 'Capturado',
            ]);

            $query->chunk(500, function ($rows) use ($handle, $intentionLabel) {
                foreach ($rows as $r) {
                    fputcsv($handle, [
                        $r->journey_place,
                        $r->journey_district,
                        $r->journey_province,
                        $r->journey_date ? \Illuminate\Support\Carbon::parse($r->journey_date)->format('d/m/Y') : '',
                        $intentionLabel[$r->vote_intention] ?? $r->vote_intention,
                        is_null($r->knew_proposal) ? '' : ($r->knew_proposal ? 'Sí' : 'No'),
                        $r->consented ? 'Sí' : 'No',
                        $r->name,
                        $r->phone,
                        $r->consented ? $r->dni : '',   // dni solo si consintió
                        $r->age,
                        $r->sex,
                        $r->captured_at?->format('d/m/Y H:i'),
                    ]);
                }
            });
            fclose($handle);
        }, 'encuestas.csv', $headers);
    }
}
