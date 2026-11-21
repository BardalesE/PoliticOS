<?php

namespace App\Services;

use App\Services\Llm\GeminiClient;
use Illuminate\Support\Facades\Log;

/**
 * Análisis de "lectura única" de un plan de gobierno peruano: en vez del
 * MAP/REDUCE por chunk contra Groq (cientos de llamadas, demasiado lento con
 * el límite gratuito), manda el plan COMPLETO en UNA llamada a Gemini (o 2-3
 * + una consolidación, si no entra en el presupuesto de tokens). Selector:
 * INGEST_ANALYSIS_MODE (ver config/ingest.php "analysis"/"single_pass" y
 * App\Jobs\StartDocumentAnalysisJob / App\Jobs\SinglePassAnalyzeDocumentJob).
 *
 * Devuelve el mismo contrato que ReduceDocumentJob deja en DocumentAnalysis/
 * DocumentFaq (resumen_ejecutivo, indice_estructurado, propuestas_por_eje,
 * propuestas_por_region, faqs) para no tocar DeepAnalysisQueryService ni el
 * admin (KnowledgeAnalysisModal.tsx) — ambos modos quedan indistinguibles
 * para quien consume el resultado.
 */
class GeminiLongContextAnalyzer
{
    private const FULL_KEYS = ['resumen_ejecutivo', 'indice_estructurado', 'propuestas_por_eje', 'propuestas_por_region', 'faqs'];
    private const PART_KEYS = ['indice_estructurado', 'propuestas_por_eje', 'propuestas_por_region'];

    private const SYSTEM_PROMPT_FULL = <<<'TXT'
Eres un analista de planes de gobierno peruanos. Recibes el TEXTO COMPLETO de
un plan, con marcas "[Página N]" antes del texto de cada página. Devuelve
SOLO un JSON con esta forma exacta, sin texto fuera del JSON:
{
  "resumen_ejecutivo": "resumen general del plan en 4-8 frases",
  "indice_estructurado": [{"titulo": "nombre del eje o sección", "orden": 1}],
  "propuestas_por_eje": {"Nombre del eje": {"eje": "Nombre del eje", "resumen": "resumen del eje en 3-6 frases", "propuestas": [{"texto": "propuesta concreta", "paginas": [números de página]}]}},
  "propuestas_por_region": [{"nombre": "región/provincia/distrito mencionado", "propuestas": [{"texto": "propuesta concreta para esa región", "paginas": [números de página]}]}],
  "faqs": [{"pregunta": "pregunta que un ciudadano haría", "respuesta": "respuesta basada SOLO en el texto", "paginas": [números de página]}]
}
Genera entre 30 y 50 FAQs cubriendo los temas más relevantes. TODA propuesta y
TODA FAQ debe traer al menos una página real en "paginas" — si no puedes
citar una página, no la incluyas. Nunca inventes datos que no estén en el texto.
TXT;

    private const SYSTEM_PROMPT_PART = <<<'TXT'
Eres un analista de planes de gobierno peruanos. Recibes UNA PARTE (de varias)
del texto de un plan, con marcas "[Página N]" antes del texto de cada página.
Devuelve SOLO un JSON con esta forma exacta, sin texto fuera del JSON:
{
  "indice_estructurado": [{"titulo": "nombre del eje o sección", "orden": 1}],
  "propuestas_por_eje": {"Nombre del eje": {"eje": "Nombre del eje", "resumen": "resumen del eje en esta parte", "propuestas": [{"texto": "propuesta concreta", "paginas": [números de página]}]}},
  "propuestas_por_region": [{"nombre": "región/provincia/distrito mencionado", "propuestas": [{"texto": "propuesta concreta para esa región", "paginas": [números de página]}]}],
  "faqs_candidatas": [{"pregunta": "pregunta que un ciudadano haría", "respuesta": "respuesta basada SOLO en el texto", "paginas": [números de página]}]
}
TODA propuesta y TODA FAQ debe traer al menos una página real en "paginas".
Nunca inventes datos que no estén en el texto.
TXT;

    private const SYSTEM_PROMPT_CONSOLIDATE = <<<'TXT'
Con los análisis parciales (JSON) de las distintas partes de UN MISMO plan de
gobierno peruano, consolida todo en UN JSON final con esta forma exacta, sin
texto fuera del JSON:
{
  "resumen_ejecutivo": "resumen general del plan completo en 4-8 frases",
  "indice_estructurado": [{"titulo": "nombre del eje o sección", "orden": 1}],
  "propuestas_por_eje": {"Nombre del eje": {"eje": "Nombre del eje", "resumen": "resumen consolidado en 3-6 frases", "propuestas": [{"texto": "propuesta concreta", "paginas": [números de página]}]}},
  "propuestas_por_region": [{"nombre": "región/provincia/distrito mencionado", "propuestas": [{"texto": "propuesta concreta", "paginas": [números de página]}]}],
  "faqs": [{"pregunta": "pregunta que un ciudadano haría", "respuesta": "respuesta basada SOLO en el texto", "paginas": [números de página]}]
}
No dupliques ejes ni propuestas entre partes; conserva TODAS las páginas de
origen. Genera entre 30 y 50 FAQs en total, eligiendo las más relevantes entre
las "faqs_candidatas" de cada parte. TODA propuesta y TODA FAQ debe traer al
menos una página real en "paginas". Nunca inventes datos.
TXT;

    public function __construct(private readonly ?GeminiClient $client = null)
    {
    }

    /**
     * @param array<int, string> $pages índice 0 = página 1 (igual que PdfPageExtractor).
     * @return array{resumen_ejecutivo:string, indice_estructurado:array, propuestas_por_eje:array, propuestas_por_region:array, faqs:array, tokens_usados:int, modelo:string}
     */
    public function analyze(array $pages): array
    {
        $model  = (string) config('ingest.single_pass.model', 'gemini-2.5-flash');
        $maxOut = (int) config('ingest.single_pass.max_output_tokens', 8192);
        $client = $this->client ?? new GeminiClient();

        $full            = $this->markPages($pages);
        $estimatedTokens = $this->estimateTokens($full);
        $maxTokens       = max(1, (int) config('ingest.single_pass.max_tokens', 400000));

        if ($estimatedTokens <= $maxTokens) {
            $result = $this->callWithJsonRetry($client, self::SYSTEM_PROMPT_FULL, $full, $model, $maxOut, self::FULL_KEYS);
            $data   = $result['data'];
            $tokens = $result['tokens'];
        } else {
            [$data, $tokens] = $this->analyzeInParts($client, $pages, $model, $maxOut, $estimatedTokens, $maxTokens);
        }

        return $this->finalize($data, $tokens, $model);
    }

    /** @return array{0: array, 1: int} */
    private function analyzeInParts(GeminiClient $client, array $pages, string $model, int $maxOut, int $estimatedTokens, int $maxTokens): array
    {
        $tokens  = 0;
        $partial = [];

        foreach ($this->splitPages($pages, $estimatedTokens, $maxTokens) as $part) {
            $marked = $this->markPages($part['pages'], $part['offset']);
            $result = $this->callWithJsonRetry($client, self::SYSTEM_PROMPT_PART, $marked, $model, $maxOut, self::PART_KEYS);
            $partial[] = $result['data'];
            $tokens += $result['tokens'];
        }

        $input  = json_encode(['partes' => $partial], JSON_UNESCAPED_UNICODE);
        $result = $this->callWithJsonRetry($client, self::SYSTEM_PROMPT_CONSOLIDATE, $input, $model, $maxOut, self::FULL_KEYS);
        $tokens += $result['tokens'];

        return [$result['data'], $tokens];
    }

    /** @return array<int, array{pages: array<int, string>, offset: int}> en 2-3 partes contiguas, por páginas (no por tokens exactos). */
    private function splitPages(array $pages, int $estimatedTokens, int $maxTokens): array
    {
        $maxParts    = max(2, (int) config('ingest.single_pass.max_parts', 3));
        $neededParts = max(2, (int) ceil($estimatedTokens / $maxTokens));
        $parts       = min($maxParts, $neededParts);

        $total   = count($pages);
        $perPart = max(1, (int) ceil($total / $parts));

        $out = [];
        for ($start = 0; $start < $total; $start += $perPart) {
            $out[] = ['pages' => array_slice($pages, $start, $perPart), 'offset' => $start];
        }

        return $out;
    }

    /** @param array<int, string> $pages */
    private function markPages(array $pages, int $offset = 0): string
    {
        $out = [];
        foreach ($pages as $i => $text) {
            $out[] = "[Página " . ($offset + $i + 1) . "]\n" . trim((string) $text);
        }

        return implode("\n\n", $out);
    }

    private function estimateTokens(string $text): int
    {
        $charsPerToken = max(1, (int) config('ingest.chunking.chars_per_token', 4));

        return (int) ceil(mb_strlen($text) / $charsPerToken);
    }

    /**
     * Llama a Gemini y valida que el JSON tenga las claves requeridas; un
     * JSON sintácticamente inválido o con claves faltantes no es un 429 (ya
     * lo maneja GeminiClient con su propio backoff) — se reintenta la
     * llamada completa hasta json_retries veces antes de rendirse.
     */
    private function callWithJsonRetry(GeminiClient $client, string $system, string $user, string $model, int $maxOut, array $requiredKeys): array
    {
        $jsonRetries = max(1, (int) config('ingest.single_pass.json_retries', 3));
        $lastError   = null;

        for ($attempt = 1; $attempt <= $jsonRetries; $attempt++) {
            try {
                $result = $client->completeJson($system, $user, $model, $maxOut);
                $this->assertHasKeys($result['data'], $requiredKeys);

                return $result;
            } catch (\Throwable $e) {
                $lastError = $e;
                Log::warning('GeminiLongContextAnalyzer: respuesta inválida, reintentando', [
                    'attempt' => $attempt,
                    'error'   => $e->getMessage(),
                ]);
            }
        }

        throw new \RuntimeException(
            "Gemini: JSON inválido tras {$jsonRetries} intentos" . ($lastError ? (': ' . $lastError->getMessage()) : '.')
        );
    }

    private function assertHasKeys(array $data, array $keys): void
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $data)) {
                throw new \RuntimeException("JSON de Gemini sin la clave requerida '{$key}'");
            }
        }
    }

    /** @return array{resumen_ejecutivo:string, indice_estructurado:array, propuestas_por_eje:array, propuestas_por_region:array, faqs:array, tokens_usados:int, modelo:string} */
    private function finalize(array $data, int $tokens, string $model): array
    {
        $propuestasPorEje = [];
        foreach ((array) ($data['propuestas_por_eje'] ?? []) as $key => $eje) {
            $propuestas = $this->filterPropuestasWithPages((array) ($eje['propuestas'] ?? []));
            if (empty($propuestas)) {
                continue;
            }
            $propuestasPorEje[$key] = [
                'eje'        => $eje['eje'] ?? $key,
                'resumen'    => (string) ($eje['resumen'] ?? ''),
                'propuestas' => $propuestas,
            ];
        }

        $propuestasPorRegion = $this->normalizeRegions((array) ($data['propuestas_por_region'] ?? []));

        $faqs = [];
        foreach ((array) ($data['faqs'] ?? []) as $faq) {
            $paginas = array_values(array_filter((array) ($faq['paginas'] ?? [])));
            if (empty($paginas) || empty($faq['pregunta']) || empty($faq['respuesta'])) {
                continue; // sin página de origen no se persiste (misma regla que ReduceDocumentJob).
            }
            $faqs[] = [
                'pregunta'  => (string) $faq['pregunta'],
                'respuesta' => (string) $faq['respuesta'],
                'paginas'   => array_values(array_map('intval', $paginas)),
            ];
        }

        return [
            'resumen_ejecutivo'     => (string) ($data['resumen_ejecutivo'] ?? ''),
            'indice_estructurado'   => array_values((array) ($data['indice_estructurado'] ?? [])),
            'propuestas_por_eje'    => $propuestasPorEje,
            'propuestas_por_region' => $propuestasPorRegion,
            'faqs'                  => $faqs,
            'tokens_usados'         => $tokens,
            'modelo'                => $model,
        ];
    }

    /** @param array<int, array{texto?:string, paginas?:array}> $propuestas */
    private function filterPropuestasWithPages(array $propuestas): array
    {
        $out = [];
        foreach ($propuestas as $p) {
            $paginas = array_values(array_filter((array) ($p['paginas'] ?? [])));
            if (empty($paginas) || empty($p['texto'])) {
                continue;
            }
            $out[] = [
                'texto'   => (string) $p['texto'],
                'paginas' => array_values(array_map('intval', $paginas)),
            ];
        }

        return $out;
    }

    /**
     * Mismo criterio que ReduceDocumentJob::buildPropuestasPorRegion:
     * normaliza el nombre contra el ubigeo del tenant para que quede
     * consistente entre ambos modos de análisis, y fusiona entradas que
     * terminen apuntando al mismo lugar ("San Miguel" / "san miguel").
     */
    private function normalizeRegions(array $regions): array
    {
        $names      = array_values(array_filter(array_column($regions, 'nombre')));
        $normalized = (new UbigeoNormalizer())->normalize($names);
        $byMention  = collect($normalized)->keyBy('mencion');

        $byLabel = [];
        foreach ($regions as $region) {
            $nombre = $region['nombre'] ?? null;
            if (!$nombre) {
                continue;
            }

            $propuestas = $this->filterPropuestasWithPages((array) ($region['propuestas'] ?? []));
            if (empty($propuestas)) {
                continue;
            }

            $match = $byMention->get($nombre);
            $label = $match['nombre_normalizado'] ?? $nombre;

            $byLabel[$label]['nombre']          = $label;
            $byLabel[$label]['nivel']           = $match['nivel'] ?? null;
            $byLabel[$label]['distrito_id']     = $match['distrito_id'] ?? null;
            $byLabel[$label]['provincia_id']    = $match['provincia_id'] ?? null;
            $byLabel[$label]['departamento_id'] = $match['departamento_id'] ?? null;
            $byLabel[$label]['propuestas']      = array_merge($byLabel[$label]['propuestas'] ?? [], $propuestas);
        }

        return array_values($byLabel);
    }
}
