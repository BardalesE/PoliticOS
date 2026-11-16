<?php

namespace App\Console\Commands;

use App\Models\DocumentAnalysis;
use App\Models\DocumentFaq;
use App\Models\KnowledgeDocument;
use App\Services\DeepAnalysisQueryService;
use App\Services\TenantContext;
use Illuminate\Console\Command;

/**
 * Fase 3.3 — control de calidad del clasificador de la Fase 2 contra un
 * documento real ya analizado: 3 preguntas vagas, 4 que deberían calzar con
 * una FAQ existente, 3 específicas por región (tomadas de
 * propuestas_por_region, o del índice si el documento no tiene regiones).
 * No llama a Groq/Gemini para generar nada nuevo — clasifica con lo que el
 * pipeline de la Fase 1 ya dejó guardado, así que es gratis y repetible.
 *
 * Uso:
 *   php artisan knowledge:qa 42
 *   php artisan knowledge:qa 42 --tenant=politicosperu
 */
class KnowledgeQa extends Command
{
    protected $signature = 'knowledge:qa
        {document : ID de knowledge_documents (debe tener analysis_status=listo)}
        {--tenant= : Slug del tenant (si no, la BD por defecto)}';

    protected $description = 'Prueba el clasificador de intención de la Fase 2 (menu/faq/rag) contra un documento real.';

    public function handle(DeepAnalysisQueryService $deepAnalysis): int
    {
        $exit = self::FAILURE;
        $run  = function () use ($deepAnalysis, &$exit) { $exit = $this->correr($deepAnalysis); };

        if ($tenant = $this->option('tenant')) {
            TenantContext::run($tenant, $run);
        } else {
            $run();
        }

        return $exit;
    }

    private function correr(DeepAnalysisQueryService $deepAnalysis): int
    {
        $doc = KnowledgeDocument::find((int) $this->argument('document'));
        if (!$doc) {
            $this->error('Documento no encontrado.');
            return self::FAILURE;
        }
        if (!$doc->is_public) {
            $this->error("El documento #{$doc->id} «{$doc->title}» todavía no tiene análisis profundo listo (analysis_status={$doc->analysis_status}).");
            return self::FAILURE;
        }

        $this->info("QA de clasificación — documento #{$doc->id} «{$doc->title}»");
        $this->newLine();

        $preguntas = $this->armarPreguntas($doc);

        foreach ($preguntas as [$etiqueta, $pregunta]) {
            $this->ejecutarCaso($deepAnalysis, $doc, $etiqueta, $pregunta);
        }

        return self::SUCCESS;
    }

    /** @return array<int, array{0:string,1:string}> [etiqueta, pregunta] x10 */
    private function armarPreguntas(KnowledgeDocument $doc): array
    {
        $casos = [
            ['vaga', 'Resume el plan'],
            ['vaga', '¿De qué trata este documento?'],
            ['vaga', '¿Cuáles son tus propuestas?'],
        ];

        $faqs = DocumentFaq::where('document_id', $doc->id)->orderBy('id')->limit(4)->pluck('pregunta');
        if ($faqs->count() < 4) {
            $this->warn("Solo hay {$faqs->count()} FAQ(s) guardadas para este documento (se esperaban 4).");
        }
        foreach ($faqs as $p) {
            $casos[] = ['faq', $p];
        }

        $regiones = collect(DocumentAnalysis::where('document_id', $doc->id)->value('propuestas_por_region') ?? [])
            ->pluck('nombre')->filter()->take(3);

        if ($regiones->count() < 3) {
            $temas = collect(DocumentAnalysis::where('document_id', $doc->id)->value('indice_estructurado') ?? [])
                ->pluck('titulo')->filter();
            foreach ($temas as $tema) {
                if ($regiones->count() >= 3) break;
                $regiones->push($tema);
            }
        }
        foreach ($regiones->take(3) as $r) {
            $casos[] = ['específica', "¿Qué propone para {$r}?"];
        }

        return $casos;
    }

    private function ejecutarCaso(DeepAnalysisQueryService $deepAnalysis, KnowledgeDocument $doc, string $etiqueta, string $pregunta): void
    {
        $out = $deepAnalysis->classify($pregunta, $doc->candidate_id, $doc->candidate?->name);

        $this->line("── [{$etiqueta}] \"{$pregunta}\"");

        if (!$out) {
            $this->warn('   Sin clasificar (el candidato no tiene documentos con análisis profundo listo).');
            $this->newLine();
            return;
        }

        $tipo = $out['type'];
        $llm  = $tipo === 'rag' ? 'sí (CivicAIService la pasaría al LLM)' : 'no';
        $this->line("   tipo: {$tipo}   |   LLM: {$llm}");

        if ($tipo === 'menu') {
            $this->line('   ' . mb_substr(str_replace("\n", ' ', $out['reply']), 0, 160) . '…');
        } elseif ($tipo === 'faq') {
            $paginas = array_column($out['citations'], 'page');
            $this->line('   respuesta: ' . mb_substr($out['reply'], 0, 160));
            $this->line('   páginas citadas: ' . (implode(', ', array_filter($paginas)) ?: '—'));
        } else {
            $paginas = array_filter(array_column($out['docs'], 'page'));
            $titulos = array_unique(array_column($out['docs'], 'title'));
            $this->line('   fragmentos: ' . count($out['docs']) . '   |   páginas citadas: ' . (implode(', ', $paginas) ?: '—'));
            $this->line('   fuentes: ' . implode(' · ', array_slice($titulos, 0, 3)));
        }

        $this->newLine();
    }
}
