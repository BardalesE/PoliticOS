<?php

namespace App\Jobs;

use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Models\DocumentSection;
use App\Models\KnowledgeDocument;
use App\Services\Llm\GroqClient;
use App\Services\Llm\GroqRateLimitException;
use App\Services\TenantContext;
use App\Services\UbigeoNormalizer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * REDUCE jerárquico: corre después de que el batch de MapDocumentChunkJob
 * termina (ver ProcessKnowledgeDocumentJob). Primero consolida los chunks por
 * eje temático, luego hace una pasada global con el modelo grande para armar
 * índice + resumen ejecutivo + propuestas por eje/región + FAQs.
 *
 * Toda propuesta y FAQ conserva sus páginas de origen (vienen de los
 * "paginas" de cada chunk MAP); una FAQ sin página se descarta antes de
 * guardarse — nunca se persiste una cita que no se pueda verificar.
 */
class ReduceDocumentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 5;
    public int $timeout = 180;

    private const SYSTEM_PROMPT_EJE = <<<'TXT'
Consolidas varios resúmenes de fragmentos de UN MISMO eje temático de un plan
de gobierno peruano. Devuelve SOLO un JSON:
{
  "eje": "nombre del eje",
  "resumen": "resumen consolidado en 3-6 frases",
  "propuestas": [{"texto": "propuesta concreta", "paginas": [números de página]}]
}
No repitas propuestas duplicadas; conserva TODAS las páginas de origen de cada
propuesta que mantengas. Nunca inventes una propuesta que no esté en el texto.
TXT;

    private const SYSTEM_PROMPT_GLOBAL = <<<'TXT'
Con los resúmenes por eje de un plan de gobierno peruano, devuelve SOLO un
JSON:
{
  "indice_estructurado": [{"titulo": "nombre del eje o sección", "orden": 1}],
  "resumen_ejecutivo": "resumen general del plan en 4-8 frases",
  "faqs": [{"pregunta": "pregunta que un ciudadano haría", "respuesta": "respuesta basada SOLO en el texto", "paginas": [números de página]}]
}
Genera entre 30 y 50 FAQs cubriendo los temas más relevantes y las menciones
de región/distrito. TODA FAQ debe traer al menos una página en "paginas" —
si no puedes citar una página real, no incluyas esa FAQ. Nunca inventes datos.
TXT;

    public function __construct(public int $documentId, public ?string $tenantSlug = null)
    {
        $this->tenantSlug ??= TenantContext::currentSlug();
    }

    public function handle(): void
    {
        TenantContext::run($this->tenantSlug, fn () => $this->process());
    }

    private function process(): void
    {
        $doc = KnowledgeDocument::find($this->documentId);
        if (!$doc) {
            return;
        }

        $sections = DocumentSection::where('document_id', $doc->id)->orderBy('orden')->get();
        $okSections = $sections->where('map_status', 'listo');

        if ($okSections->isEmpty()) {
            $doc->update([
                'analysis_status'      => 'error',
                'analysis_error'       => 'Ningún chunk se pudo mapear (MAP falló por completo).',
                'analysis_batch_id'    => null,
                'analysis_finished_at' => now(),
            ]);
            return;
        }

        $doc->update(['analysis_progress' => 75, 'analysis_stage' => 'consolidando']);

        try {
            $porEje = $this->reduceByEje($okSections);

            $doc->update(['analysis_progress' => 85, 'analysis_stage' => 'generando_faqs']);
            $global     = $this->reduceGlobal($porEje);
            $porRegion  = $this->buildPropuestasPorRegion($okSections);

            $previousVersion = (int) (DocumentAnalysis::where('document_id', $doc->id)->value('version') ?? 0);

            DocumentAnalysis::updateOrCreate(
                ['document_id' => $doc->id],
                [
                    'indice_estructurado'   => $global['indice_estructurado'],
                    'resumen_ejecutivo'     => $global['resumen_ejecutivo'],
                    'propuestas_por_eje'    => $porEje,
                    'propuestas_por_region' => $porRegion,
                    'modelo'                => config('ingest.reduce.model'),
                    'tokens_usados'         => $global['tokens'],
                    'version'               => $previousVersion + 1,
                ]
            );

            $this->saveFaqs($doc, $global['faqs']);

            $doc->update(['analysis_progress' => 90, 'analysis_stage' => 'embeddings']);

            EmbedDocumentSectionsJob::dispatch($doc->id, $this->tenantSlug);
        } catch (\Throwable $e) {
            Log::warning('ReduceDocumentJob failed', ['doc_id' => $doc->id, 'error' => $e->getMessage()]);
            $doc->update([
                'analysis_status'      => 'error',
                'analysis_error'       => mb_substr($e->getMessage(), 0, 500),
                'analysis_batch_id'    => null,
                'analysis_finished_at' => now(),
            ]);
            throw $e;
        }
    }

    /** @return array<string, array{eje:string, resumen:string, propuestas:array}> */
    private function reduceByEje($sections): array
    {
        $byEje = [];
        foreach ($sections as $section) {
            foreach (($section->map_json['ejes'] ?? []) ?: ['General'] as $eje) {
                $byEje[$eje][] = $section->map_json;
            }
        }

        if (empty($byEje)) {
            $byEje['General'] = $sections->pluck('map_json')->all();
        }

        $out = [];
        foreach ($byEje as $eje => $maps) {
            $input = json_encode(['eje' => $eje, 'fragmentos' => $maps], JSON_UNESCAPED_UNICODE);
            $result = $this->callGroqWithRetry(self::SYSTEM_PROMPT_EJE, $input, (string) config('ingest.reduce.model'), 3000);
            $out[$eje] = $result['data'];
        }

        return $out;
    }

    /** @return array{indice_estructurado:array, resumen_ejecutivo:string, faqs:array, tokens:int} */
    private function reduceGlobal(array $porEje): array
    {
        $input  = json_encode(['ejes' => array_values($porEje)], JSON_UNESCAPED_UNICODE);
        $result = $this->callGroqWithRetry(self::SYSTEM_PROMPT_GLOBAL, $input, (string) config('ingest.reduce.model'), 4000);
        $data   = $result['data'];

        return [
            'indice_estructurado' => $data['indice_estructurado'] ?? [],
            'resumen_ejecutivo'   => (string) ($data['resumen_ejecutivo'] ?? ''),
            'faqs'                => array_values($data['faqs'] ?? []),
            'tokens'              => $result['tokens'],
        ];
    }

    private function buildPropuestasPorRegion($sections): array
    {
        $mentions = [];
        foreach ($sections as $section) {
            foreach ($section->map_json['regiones_mencionadas'] ?? [] as $m) {
                $mentions[] = $m;
            }
        }

        $normalized = (new UbigeoNormalizer())->normalize($mentions);

        $byRegion = [];
        foreach ($sections as $section) {
            $regiones = $section->map_json['regiones_mencionadas'] ?? [];
            foreach ($regiones as $mencion) {
                $match = collect($normalized)->firstWhere('mencion', $mencion);
                $label = $match['nombre_normalizado'] ?? $mencion;
                foreach ($section->map_json['propuestas'] ?? [] as $propuesta) {
                    $byRegion[$label]['nombre']             = $label;
                    $byRegion[$label]['nivel']               = $match['nivel'] ?? null;
                    $byRegion[$label]['distrito_id']         = $match['distrito_id'] ?? null;
                    $byRegion[$label]['provincia_id']        = $match['provincia_id'] ?? null;
                    $byRegion[$label]['departamento_id']     = $match['departamento_id'] ?? null;
                    $byRegion[$label]['propuestas'][]        = ['texto' => $propuesta, 'paginas' => $section->map_json['paginas'] ?? []];
                }
            }
        }

        return array_values($byRegion);
    }

    private function saveFaqs(KnowledgeDocument $doc, array $faqs): void
    {
        DocumentFaq::where('document_id', $doc->id)->delete();

        foreach ($faqs as $faq) {
            $paginas = array_values(array_filter((array) ($faq['paginas'] ?? [])));
            if (empty($paginas) || empty($faq['pregunta']) || empty($faq['respuesta'])) {
                continue; // sin página de origen no se persiste (regla de la Fase 1.6).
            }

            DocumentFaq::create([
                'document_id'  => $doc->id,
                'candidate_id' => $doc->candidate_id,
                'pregunta'     => $faq['pregunta'],
                'respuesta'    => $faq['respuesta'],
                'paginas'      => $paginas,
            ]);
        }
    }

    private function callGroqWithRetry(string $system, string $user, string $model, int $maxTokens): array
    {
        $attempts = 0;
        while (true) {
            try {
                return (new GroqClient())->completeJson($system, $user, $model, $maxTokens);
            } catch (GroqRateLimitException $e) {
                $attempts++;
                if ($attempts > 5) {
                    throw $e;
                }
                sleep(min(30, $e->retryAfter));
            }
        }
    }
}
