<?php

namespace App\Console\Commands;

use App\Jobs\MergeStreamChunksJob;
use App\Models\LiveStream;
use App\Services\TenantContext;
use Illuminate\Console\Command;

/**
 * Retoma el merge de grabaciones de "En vivo" que quedaron a medias.
 *
 * QUEUE_CONNECTION=sync en producción (render.yaml) — no hay worker real de
 * cola, así que MergeStreamChunksJob no puede simplemente "tardar lo que
 * necesite" para un stream de horas. En vez de eso, procesa por tandas
 * acotadas en tiempo (ver MergeStreamChunksJob::processBatch()) y este
 * comando las retoma. Se registra en routes/console.php con
 * ->everyFiveMinutes(), y el cron externo (GitHub Actions →
 * POST /api/system/run-scheduler) ya pega cada 5 min — sin Redis, sin
 * worker pagado, sin tocar render.yaml.
 */
class ContinueLiveStreamMerges extends Command
{
    protected $signature = 'livestreams:continue-merges';

    protected $description = 'Avanza una tanda del merge de chunks para streams cuya grabación quedó pendiente/a medias.';

    public function handle(): int
    {
        TenantContext::forEachTenant(function (?string $slug) {
            TenantContext::run($slug, function () use ($slug) {
                $pending = LiveStream::whereIn('merge_status', ['pending', 'processing'])->get();

                foreach ($pending as $stream) {
                    $this->info("Tenant ".($slug ?? 'default').": stream #{$stream->id} ({$stream->merge_cursor}/{$stream->chunk_count})");
                    (new MergeStreamChunksJob($stream->id, $slug))->processBatch();
                }
            });
        });

        return self::SUCCESS;
    }
}
