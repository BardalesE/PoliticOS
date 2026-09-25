<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use App\Services\CivicAIService;
use App\Services\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/**
 * Comparador 1 vs 1 del chat.
 *
 *   GET  /api/chat/compare/topics  → temas disponibles (los mismos para todos)
 *   POST /api/chat/compare         → { a, b, topic } → dos columnas neutrales
 *
 * Cada lado se resume por separado con el MISMO prompt (CivicAIService::
 * summarizeTopicFor) y se guarda en caché por candidato + tema + versión de sus
 * documentos: "A vs B" y "A vs C" reutilizan el resumen de A. Así la IA se
 * llama como máximo una vez por candidato y tema al día, no por visitante.
 */
class CompareController extends Controller
{
    /** clave => [etiqueta, pregunta que se hace a los documentos] */
    public const TOPICS = [
        'agricultura' => ['Agricultura',          'propuestas para la agricultura, ganadería, riego y productores'],
        'salud'       => ['Salud',                'propuestas de salud, postas, hospitales y atención médica'],
        'educacion'   => ['Educación',            'propuestas de educación, colegios, docentes y estudiantes'],
        'agua'        => ['Agua y desagüe',       'propuestas de agua potable, desagüe y saneamiento'],
        'seguridad'   => ['Seguridad ciudadana',  'propuestas de seguridad ciudadana, serenazgo y delincuencia'],
        'vias'        => ['Vías y transporte',    'propuestas de carreteras, trochas, pistas y transporte'],
        'ambiente'    => ['Medio ambiente',       'propuestas de medio ambiente, residuos sólidos, basura y reciclaje'],
        'empleo'      => ['Empleo',               'propuestas de empleo, trabajo, emprendimiento y economía local'],
    ];

    private const CACHE_TTL = 86_400; // 1 día

    public function __construct(private CivicAIService $ai) {}

    public function topics(): JsonResponse
    {
        return response()->json(collect(self::TOPICS)
            ->map(fn ($t, $k) => ['key' => $k, 'label' => $t[0]])
            ->values());
    }

    public function compare(Request $request): JsonResponse
    {
        $data = $request->validate([
            'a'     => ['required', 'string', 'max:120'],
            'b'     => ['required', 'string', 'max:120', 'different:a'],
            'topic' => ['required', Rule::in(array_keys(self::TOPICS))],
        ]);

        $candidates = CandidateProfile::query()
            ->visibleInDirectory()
            ->whereIn('slug', [$data['a'], $data['b']])
            ->get()
            ->keyBy('slug');

        abort_unless($candidates->has($data['a']) && $candidates->has($data['b']), 404, 'Candidato no disponible.');

        [$label, $question] = self::TOPICS[$data['topic']];

        $sides = [];
        foreach ([$data['a'], $data['b']] as $slug) {
            $c = $candidates[$slug];
            $summary = $this->summary($c, $data['topic'], $label, $question);
            if ($summary === null) {
                return response()->json([
                    'message' => 'El asistente está ocupado. Intenta de nuevo en un minuto.',
                ], 503);
            }
            $sides[] = [
                'slug'  => $c->slug,
                'name'  => $c->name,
                'party' => $c->party,
                'photo_url' => $c->photo_url,
                'logo_url'  => $c->logo_url,
            ] + $summary;
        }

        return response()->json([
            'topic' => ['key' => $data['topic'], 'label' => $label],
            'sides' => $sides,
        ]);
    }

    /** Resumen cacheado; los fallos de la IA (null) no se cachean. */
    private function summary(CandidateProfile $c, string $topicKey, string $label, string $question): ?array
    {
        // La versión cambia si se sube, borra o reprocesa un documento del candidato.
        $version = (string) $c->documents()->where('is_active', true)->max('updated_at');
        $key = TenantContext::cacheKey("compare:v1:{$c->id}:{$topicKey}:" . md5($version));

        if (($hit = Cache::get($key)) !== null) {
            return $hit;
        }

        $result = $this->ai->summarizeTopicFor($c, $label, $question);
        if ($result !== null) {
            Cache::put($key, $result, self::CACHE_TTL);
        }

        return $result;
    }
}
