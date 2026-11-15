<?php

namespace App\Console\Commands;

use App\Jobs\ProcessKnowledgeDocumentJob;
use App\Models\KnowledgeDocument;
use App\Services\TenantContext;
use Illuminate\Console\Command;

/**
 * Re-encola ProcessKnowledgeDocumentJob para documentos ya subidos antes del
 * fix de la Fase 1 (PdfPageExtractor::MAX_CHARS=80000 cortaba la extracción:
 * un plan de 200+ páginas quedaba truncado a ~26). Solo ENCOLA — el trabajo
 * real (extracción completa + chunking + MAP/REDUCE + embeddings) lo hace el
 * worker de cola (QUEUE_CONNECTION=database, ver deploy/render/supervisord.conf).
 *
 * Por defecto solo toca documentos cuyo contenido roza el tope viejo (80 000
 * caracteres, señal casi segura de truncamiento); --all fuerza todos los PDF
 * activos (p. ej. tras cambiar de driver de embeddings).
 *
 * Uso:
 *   php artisan knowledge:reingest politicosperu
 *   php artisan knowledge:reingest --here --all
 */
class ReingestKnowledgeDocuments extends Command
{
    protected $signature = 'knowledge:reingest
        {slugs?* : Slugs de los tenants a procesar}
        {--here : Procesar la BD por defecto en vez de un tenant}
        {--all : Re-ingerir todos los PDF activos, no solo los que parecen truncados}
        {--min-chars=79000 : Umbral de caracteres para considerar un documento truncado}
        {--limit=100 : Máximo de documentos por tenant en esta corrida}';

    protected $description = 'Re-encola la ingesta completa de documentos truncados por el viejo MAX_CHARS=80000.';

    public function handle(): int
    {
        if ($this->option('here')) {
            return $this->reingestCurrent(null, '(BD por defecto)') ? self::SUCCESS : self::FAILURE;
        }

        $slugs = array_filter((array) $this->argument('slugs'));
        if (!$slugs) {
            $this->error('Indica al menos un slug de tenant, o usa --here.');
            return self::FAILURE;
        }

        $exit = self::SUCCESS;
        foreach ($slugs as $slug) {
            $ran = false;
            try {
                TenantContext::run($slug, function () use ($slug, &$ran, &$exit) {
                    $ran = true;
                    if (!$this->reingestCurrent($slug, $slug)) {
                        $exit = self::FAILURE;
                    }
                });
            } catch (\Throwable $e) {
                $this->error("Tenant {$slug}: {$e->getMessage()}");
                $exit = self::FAILURE;
                continue;
            }

            if (!$ran) {
                $this->error("Tenant {$slug}: no existe o está inactivo.");
                $exit = self::FAILURE;
            }
        }

        return $exit;
    }

    private function reingestCurrent(?string $slug, string $label): bool
    {
        $query = KnowledgeDocument::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('source_type')->orWhere('source_type', 'pdf'))
            ->whereNotNull('file_url')
            ->orderBy('id')
            ->limit(max(1, (int) $this->option('limit')));

        if (!$this->option('all')) {
            $minChars = max(1, (int) $this->option('min-chars'));
            $query->whereRaw('LENGTH(content) >= ?', [$minChars]);
        }

        $docs = $query->get();

        if ($docs->isEmpty()) {
            $this->info("{$label}: nada que re-ingerir.");
            return true;
        }

        foreach ($docs as $doc) {
            ProcessKnowledgeDocumentJob::dispatch($doc->id, $slug);
            $this->line("{$label}: #{$doc->id} «{$doc->title}» encolado (" . mb_strlen((string) $doc->content) . ' chars actuales)');
        }

        $this->info("{$label}: {$docs->count()} documento(s) encolado(s).");

        return true;
    }
}
