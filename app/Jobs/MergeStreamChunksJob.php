<?php

namespace App\Jobs;

use App\Models\LiveStream;
use App\Services\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;

/**
 * Arma la grabación final a partir de los chunks subidos durante el directo.
 *
 * QUEUE_CONNECTION=sync en producción (render.yaml) — no hay worker real que
 * respete $timeout, así que este job NUNCA debe asumir que tiene tiempo
 * ilimitado. processBatch() está diseñado para poder llamarse muchas veces
 * (LiveStreamController::stop() la llama una vez al instante; el comando
 * `livestreams:continue-merges`, disparado cada 5 min por el cron externo de
 * GitHub Actions vía /api/system/run-scheduler, la reintenta hasta terminar)
 * sin depender de Redis ni de un worker de background pagado.
 */
class MergeStreamChunksJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries  = 1;
    public int $timeout = 7200;

    // Presupuesto por intento del merge binario (fallback sin ffmpeg): deja
    // margen bajo max_execution_time=120 de PHP-FPM (deploy/render/php.ini)
    // para que ni stop() ni el comando de cron se acerquen al límite.
    private const BATCH_BUDGET_SECONDS = 90;

    public function __construct(public int $streamId, public ?string $tenantSlug = null)
    {
        $this->tenantSlug ??= TenantContext::currentSlug();

        // No redeclarar $queue como propiedad tipada: el trait Queueable ya
        // la declara sin tipo (`public $queue;`) — una redeclaración con tipo
        // ('string') es incompatible en PHP y provoca un fatal error al
        // componer la clase ("define the same property... incompatible").
        // Rompía CUALQUIER dispatch de este job (ej. LiveStreamController::stop()
        // con 500 "Error interno del servidor"). Usar onQueue() en su lugar.
        $this->onQueue('video');
    }

    public function handle(): void
    {
        TenantContext::run($this->tenantSlug, fn () => $this->processBatch());
    }

    /**
     * Intenta avanzar el merge de este stream. Segura de llamar repetidas
     * veces (idempotente): si ya está `done`/`failed` no hace nada; si el
     * archivo final ya existe, solo sincroniza el estado.
     */
    public function processBatch(): void
    {
        $stream = LiveStream::find($this->streamId);

        if (!$stream || $stream->chunk_count === 0) {
            return;
        }

        if (in_array($stream->merge_status, ['done', 'failed'], true)) {
            return;
        }

        $disk   = Storage::disk('public');
        $dir    = "streams/{$stream->stream_key}";
        $tmpRel = "{$dir}/recording.tmp.webm";
        $outRel = "{$dir}/recording.webm";

        if ($disk->exists($outRel)) {
            // Completado en un intento anterior — solo sincroniza el estado
            // (defensa barata contra una tanda solapada pese a
            // withoutOverlapping() en el schedule).
            if ($stream->merge_status !== 'done') {
                $stream->update(['merge_status' => 'done', 'recording_path' => $outRel]);
            }
            return;
        }

        $stream->update(['merge_status' => 'processing']);

        $ok = $this->hasFfmpeg()
            ? $this->mergeWithFfmpeg($stream, $disk, $dir, $tmpRel, $outRel)
            : $this->mergeBinaryResumable($stream, $disk, $tmpRel, $outRel);

        if (!$ok) {
            // No se completó en esta tanda (timeout del proceso ffmpeg, o se
            // agotó el presupuesto de tiempo del fallback binario) — se
            // queda en 'processing' para que el próximo tick del cron
            // reintente. No se toca el archivo final: nunca hay corrupción.
            Log::info('MergeStreamChunksJob: tanda incompleta, se reintentará', [
                'stream_id' => $this->streamId,
                'merge_cursor' => $stream->fresh()->merge_cursor,
                'chunk_count'  => $stream->chunk_count,
            ]);
        }
    }

    private function hasFfmpeg(): bool
    {
        static $available = null;
        if ($available === null) {
            $available = Process::run('ffmpeg -version')->successful();
        }
        return $available;
    }

    /**
     * Remux con ffmpeg (-c copy, sin recodificar) — un solo intento cubre
     * TODOS los chunks disponibles. Es I/O puro (sin transcode), así que en
     * la práctica termina en segundos incluso para miles de chunks (horas de
     * video) — muy por debajo del presupuesto de PHP-FPM. Genera un WebM de
     * un solo contenedor con índice de cues correcto (a diferencia de la
     * concatenación binaria), así que el seek funciona en toda la duración.
     */
    private function mergeWithFfmpeg(LiveStream $stream, $disk, string $dir, string $tmpRel, string $outRel): bool
    {
        $listRel = "{$dir}/concat_list.txt";
        $lines   = [];

        for ($i = 0; $i < $stream->chunk_count; $i++) {
            $chunkAbs = $disk->path(sprintf('%s/chunk_%06d.webm', $dir, $i));
            if (file_exists($chunkAbs)) {
                // ffmpeg concat demuxer: una ruta absoluta por línea, comillas
                // simples escapadas. Los nombres son generados por el propio
                // sistema (sprintf %06d), nunca vienen de input de usuario.
                $lines[] = "file '".str_replace("'", "'\\''", $chunkAbs)."'";
            }
        }

        if (empty($lines)) {
            Log::error('MergeStreamChunksJob: no hay chunks válidos en disco', ['stream_id' => $this->streamId]);
            $stream->update(['merge_status' => 'failed']);
            return true; // no hay nada más que reintentar
        }

        $disk->put($listRel, implode("\n", $lines));
        $listAbs = $disk->path($listRel);
        $tmpAbs  = $disk->path($tmpRel);
        $outAbs  = $disk->path($outRel);

        $result = Process::timeout(self::BATCH_BUDGET_SECONDS)->run([
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', $listAbs, '-c', 'copy', $tmpAbs,
        ]);

        $disk->delete($listRel);

        if (!$result->successful()) {
            Log::warning('MergeStreamChunksJob: ffmpeg no completó en el presupuesto de tiempo, se reintentará', [
                'stream_id' => $this->streamId,
                'exit_code' => $result->exitCode(),
            ]);
            @unlink($tmpAbs); // descarta el intento parcial, nunca toca el final
            return false;
        }

        rename($tmpAbs, $outAbs);
        $stream->update([
            'merge_status'    => 'done',
            'merge_cursor'    => $stream->chunk_count,
            'recording_path'  => $outRel,
        ]);

        Log::info('MergeStreamChunksJob: grabación completada (ffmpeg)', [
            'stream_id' => $this->streamId,
            'chunks'    => $stream->chunk_count,
        ]);

        return true;
    }

    /**
     * Fallback sin ffmpeg: concatenación binaria por tandas, retomando desde
     * merge_cursor. A diferencia de ffmpeg esto SÍ puede ser lento con miles
     * de chunks (un fopen/fclose por archivo), así que respeta el presupuesto
     * de tiempo y guarda el progreso para la siguiente tanda.
     */
    private function mergeBinaryResumable(LiveStream $stream, $disk, string $tmpRel, string $outRel): bool
    {
        $tmpAbs = $disk->path($tmpRel);
        $cursor = $stream->merge_cursor;

        // 'ab' (append) si se retoma una tanda anterior; 'wb' (truncar) solo
        // en el primer intento (cursor === 0), para no arrastrar basura de un
        // intento previo fallido a medias.
        $mode = $cursor > 0 && file_exists($tmpAbs) ? 'ab' : 'wb';
        $out  = @fopen($tmpAbs, $mode);

        if (!$out) {
            Log::error('MergeStreamChunksJob: no se pudo abrir archivo temporal', [
                'stream_id' => $this->streamId,
                'path'      => $tmpAbs,
            ]);
            $stream->update(['merge_status' => 'failed']);
            return true;
        }

        $deadline = microtime(true) + self::BATCH_BUDGET_SECONDS;

        for ($i = $cursor; $i < $stream->chunk_count; $i++) {
            if (microtime(true) >= $deadline) {
                fclose($out);
                $stream->update(['merge_cursor' => $i]);
                return false; // presupuesto agotado, se retoma en la próxima tanda
            }

            $chunkAbs = $disk->path(sprintf('streams/%s/chunk_%06d.webm', $stream->stream_key, $i));
            if (file_exists($chunkAbs)) {
                $in = fopen($chunkAbs, 'rb');
                if ($in) {
                    stream_copy_to_stream($in, $out);
                    fclose($in);
                }
            }
        }

        fclose($out);
        rename($tmpAbs, $disk->path($outRel));

        $stream->update([
            'merge_status'   => 'done',
            'merge_cursor'   => $stream->chunk_count,
            'recording_path' => $outRel,
        ]);

        Log::info('MergeStreamChunksJob: grabación completada (binario)', [
            'stream_id' => $this->streamId,
            'chunks'    => $stream->chunk_count,
        ]);

        return true;
    }
}
