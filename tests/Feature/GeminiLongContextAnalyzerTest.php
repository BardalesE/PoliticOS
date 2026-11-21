<?php

namespace Tests\Feature;

use App\Models\UbigeoDepartamento;
use App\Services\GeminiLongContextAnalyzer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Modo INGEST_ANALYSIS_MODE=single_pass_gemini (reemplaza el MAP/REDUCE por
 * chunk contra Groq, demasiado lento con el límite gratis de Groq): manda el
 * plan COMPLETO a Gemini en una llamada, o 2-3 + consolidación si no entra en
 * el presupuesto de tokens. Es un Feature test (no Unit) porque el
 * post-procesamiento normaliza "propuestas_por_region" contra el ubigeo del
 * tenant (UbigeoNormalizer), que consulta la BD siempre, incluso sin
 * coincidencias.
 */
class GeminiLongContextAnalyzerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true,
            ],
            'ingest.single_pass.api_key'            => 'test-gemini-key',
            'ingest.single_pass.base_url'           => 'https://generativelanguage.googleapis.com/v1beta',
            'ingest.single_pass.model'              => 'gemini-2.5-flash',
            'ingest.single_pass.max_tokens'         => 400000,
            'ingest.single_pass.max_output_tokens'  => 8192,
            'ingest.single_pass.max_parts'          => 3,
            'ingest.single_pass.max_retries'        => 5,
            'ingest.single_pass.json_retries'       => 3,
            'ingest.chunking.chars_per_token'       => 4,
        ]);
        DB::purge('sqlite');

        foreach ([
            '2026_09_16_000001_create_ubigeo_departamentos_table',
            '2026_09_16_000002_create_ubigeo_provincias_table',
            '2026_09_16_000003_create_ubigeo_distritos_table',
        ] as $migration) {
            (require database_path("migrations/{$migration}.php"))->up();
        }

        UbigeoDepartamento::create(['departamento' => 'CAJAMARCA', 'ubigeo' => '06']);
    }

    private function geminiTextResponse($data, int $tokens = 100)
    {
        $text = is_string($data) ? $data : json_encode($data, JSON_UNESCAPED_UNICODE);

        return Http::response([
            'candidates'    => [['content' => ['parts' => [['text' => $text]]]]],
            'usageMetadata' => ['totalTokenCount' => $tokens],
        ], 200);
    }

    private function fullAnalysisPayload(): array
    {
        return [
            'resumen_ejecutivo'   => 'Resumen general del plan.',
            'indice_estructurado' => [['titulo' => 'Agricultura', 'orden' => 1]],
            'propuestas_por_eje'  => [
                'Agricultura' => [
                    'eje'        => 'Agricultura',
                    'resumen'    => 'Riego y tecnificación.',
                    'propuestas' => [
                        ['texto' => 'Construir canal de riego', 'paginas' => [3, 4]],
                        ['texto' => 'Propuesta sin página (debe descartarse)', 'paginas' => []],
                    ],
                ],
            ],
            'propuestas_por_region' => [
                ['nombre' => 'cajamarca', 'propuestas' => [['texto' => 'Posta de salud', 'paginas' => [10]]]],
            ],
            'faqs' => array_merge(
                [['pregunta' => 'FAQ sin página (debe descartarse)', 'respuesta' => 'x', 'paginas' => []]],
                array_map(fn ($i) => ['pregunta' => "¿Pregunta {$i}?", 'respuesta' => "Respuesta {$i}.", 'paginas' => [$i]], range(1, 30))
            ),
        ];
    }

    public function test_analyzes_a_220_page_plan_in_a_single_call(): void
    {
        $calls = 0;
        Http::fake(function () use (&$calls) {
            $calls++;

            return $this->geminiTextResponse($this->fullAnalysisPayload());
        });

        $pages = array_fill(0, 220, str_repeat('Texto de la pagina del plan. ', 20));

        $result = (new GeminiLongContextAnalyzer())->analyze($pages);

        $this->assertSame(1, $calls, 'un plan de 220 páginas entra en el presupuesto de tokens por defecto: una sola llamada');
        $this->assertSame('Resumen general del plan.', $result['resumen_ejecutivo']);
        $this->assertSame('gemini-2.5-flash', $result['modelo']);
        $this->assertCount(1, $result['propuestas_por_eje']['Agricultura']['propuestas'], 'la propuesta sin página se descarta');
        $this->assertCount(30, $result['faqs'], 'la FAQ sin página se descarta, quedan 30');
        $this->assertSame('CAJAMARCA', $result['propuestas_por_region'][0]['nombre']);

        Http::assertSent(function ($request) {
            return str_contains($request['contents'][0]['parts'][0]['text'], '[Página 1]')
                && str_contains($request['contents'][0]['parts'][0]['text'], '[Página 220]');
        });
    }

    public function test_splits_into_parts_and_consolidates_when_the_document_exceeds_the_token_budget(): void
    {
        config(['ingest.single_pass.max_tokens' => 50, 'ingest.single_pass.max_parts' => 3]);

        $requests = [];
        Http::fake(function ($request) use (&$requests) {
            $requests[] = $request;
            $body = $request->data();

            // La llamada de consolidación manda {"partes": [...]}; las de
            // parte mandan el texto con marcas de página.
            if (str_contains($body['contents'][0]['parts'][0]['text'], '"partes"')) {
                return $this->geminiTextResponse($this->fullAnalysisPayload());
            }

            return $this->geminiTextResponse([
                'indice_estructurado'   => [['titulo' => 'Agricultura', 'orden' => 1]],
                'propuestas_por_eje'    => ['Agricultura' => ['eje' => 'Agricultura', 'resumen' => 'parcial', 'propuestas' => [['texto' => 'x', 'paginas' => [1]]]]],
                'propuestas_por_region' => [],
                'faqs_candidatas'       => [],
            ]);
        });

        $pages = array_fill(0, 30, str_repeat('Texto largo de una pagina del plan de gobierno. ', 50));

        $result = (new GeminiLongContextAnalyzer())->analyze($pages);

        // 3 partes + 1 consolidación.
        $this->assertSame(4, count($requests));
        $this->assertSame('Resumen general del plan.', $result['resumen_ejecutivo']);
    }

    public function test_retries_up_to_three_times_on_invalid_json_and_eventually_succeeds(): void
    {
        $attempt = 0;
        Http::fake(function () use (&$attempt) {
            $attempt++;
            if ($attempt < 3) {
                return $this->geminiTextResponse('esto no es JSON válido');
            }

            return $this->geminiTextResponse($this->fullAnalysisPayload());
        });

        $result = (new GeminiLongContextAnalyzer())->analyze(['Pagina unica del documento.']);

        $this->assertSame(3, $attempt);
        $this->assertSame('Resumen general del plan.', $result['resumen_ejecutivo']);
    }

    public function test_throws_after_exhausting_json_retries_on_sustained_invalid_json(): void
    {
        Http::fake(fn () => $this->geminiTextResponse('siempre invalido'));

        $this->expectException(\RuntimeException::class);
        (new GeminiLongContextAnalyzer())->analyze(['Pagina unica del documento.']);
    }

    public function test_recovers_transparently_from_a_429_without_consuming_a_json_retry_attempt(): void
    {
        $attempt = 0;
        Http::fake(function () use (&$attempt) {
            $attempt++;
            if ($attempt === 1) {
                return Http::response([], 429, ['Retry-After' => '1']);
            }

            return $this->geminiTextResponse($this->fullAnalysisPayload());
        });

        $result = (new GeminiLongContextAnalyzer())->analyze(['Pagina unica del documento.']);

        $this->assertSame(2, $attempt);
        $this->assertSame('Resumen general del plan.', $result['resumen_ejecutivo']);
    }

    public function test_discards_a_region_proposal_without_pages(): void
    {
        Http::fake(fn () => $this->geminiTextResponse([
            'resumen_ejecutivo'     => 'r',
            'indice_estructurado'   => [],
            'propuestas_por_eje'    => [],
            'propuestas_por_region' => [
                ['nombre' => 'Lima', 'propuestas' => [['texto' => 'sin pagina', 'paginas' => []]]],
            ],
            'faqs' => [],
        ]));

        $result = (new GeminiLongContextAnalyzer())->analyze(['x']);

        $this->assertSame([], $result['propuestas_por_region']);
    }
}
