<?php

namespace App\Console\Commands;

use App\Models\KnowledgeDocument;
use App\Services\PdfPageExtractor;
use App\Services\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

/**
 * Rellena `knowledge_documents.pages` (texto por página) en los PDFs que se
 * subieron ANTES de que existieran las citas por página, para que la IA pueda
 * decir "pág. 8" y el ciudadano abra el PDF en ese punto.
 *
 * NO usa ProcessKnowledgeDocumentJob a propósito: ese job cambia status/content
 * y, si el PDF falla, marcaría como `failed` un documento que hoy funciona (y
 * haría desaparecer al candidato del directorio). Aquí solo se escribe `pages`;
 * si un PDF no se puede leer, se registra y se sigue — el documento queda como
 * estaba (cita sin número de página).
 *
 * IDEMPOTENTE: solo toca documentos con pages NULL, así que es seguro dejarlo en
 * el entrypoint de Render.
 *
 * Uso:
 *   php artisan knowledge:backfill-pages politicosperu
 *   php artisan knowledge:backfill-pages --here      # BD por defecto (local)
 */
class KnowledgeBackfillPages extends Command
{
    protected $signature = 'knowledge:backfill-pages
        {slugs?* : Slugs de los tenants a procesar}
        {--here : Procesar la BD por defecto en vez de un tenant}
        {--limit=50 : Máximo de documentos por tenant en esta corrida}';

    protected $description = 'Extrae el texto por página de los PDFs ya subidos (citas con número de página). Idempotente.';

    public function handle(): int
    {
        if ($this->option('here')) {
            return $this->backfillCurrent('(BD por defecto)') ? self::SUCCESS : self::FAILURE;
        }

        $slugs = array_filter((array) $this->argument('slugs'));
        if (! $slugs) {
            $this->error('Indica al menos un slug de tenant, o usa --here.');
            return self::FAILURE;
        }

        $exit = self::SUCCESS;
        foreach ($slugs as $slug) {
            $ran = false;
            try {
                TenantContext::run($slug, function () use ($slug, &$ran, &$exit) {
                    $ran = true;
                    if (! $this->backfillCurrent($slug)) {
                        $exit = self::FAILURE;
                    }
                });
            } catch (\Throwable $e) {
                $this->error("Tenant {$slug}: {$e->getMessage()}");
                $exit = self::FAILURE;
                continue;
            }

            if (! $ran) {
                $this->error("Tenant {$slug}: no existe o está inactivo.");
                $exit = self::FAILURE;
            }
        }

        return $exit;
    }

    private function backfillCurrent(string $label): bool
    {
        if (! Schema::hasColumn('knowledge_documents', 'pages')) {
            $this->error("{$label}: falta la columna knowledge_documents.pages — corre tenant:migrate primero.");
            return false;
        }

        $docs = KnowledgeDocument::query()
            ->whereNull('pages')
            ->where('is_active', true)
            ->where('status', 'ready')
            ->whereNotNull('file_url')
            ->where(fn ($q) => $q->whereNull('source_type')->orWhere('source_type', 'pdf'))
            ->orderBy('id')
            ->limit(max(1, (int) $this->option('limit')))
            ->get();

        if ($docs->isEmpty()) {
            $this->info("{$label}: todos los documentos ya tienen páginas — nada que hacer.");
            return true;
        }

        $extractor = new PdfPageExtractor();
        $ok = $fail = 0;

        foreach ($docs as $doc) {
            try {
                $pages = $extractor->fromDocument($doc)['pages'];
            } catch (\Throwable $e) {
                $fail++;
                $this->warn("{$label}: documento #{$doc->id} no se pudo leer: {$e->getMessage()}");
                continue;
            }

            if (! $pages) {
                $fail++;
                $this->warn("{$label}: documento #{$doc->id} no separa páginas (se queda sin número de página).");
                continue;
            }

            // update() directo sobre pages: content/status/embeddings no se tocan.
            $doc->update(['pages' => $pages]);
            $ok++;
            $this->line("{$label}: #{$doc->id} «{$doc->title}» → " . count($pages) . ' páginas');
        }

        $this->info("{$label}: {$ok} con páginas, {$fail} sin cambios.");

        return true;
    }
}
