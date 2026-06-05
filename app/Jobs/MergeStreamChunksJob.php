<?php

namespace App\Jobs;

use App\Models\LiveStream;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class MergeStreamChunksJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public string $queue  = 'video';
    public int    $tries  = 1;
    public int    $timeout = 7200; // 2 horas máx para streams largos

    public function __construct(public int $streamId) {}

    public function handle(): void
    {
        $stream = LiveStream::find($this->streamId);

        if (!$stream || $stream->chunk_count === 0) {
            return;
        }

        $disk   = Storage::disk('public');
        $outRel = "streams/{$stream->stream_key}/recording.webm";

        if ($disk->exists($outRel)) {
            return;
        }

        $outAbs = $disk->path($outRel);
        $out    = @fopen($outAbs, 'wb');

        if (!$out) {
            Log::error('MergeStreamChunksJob: no se pudo abrir archivo de salida', [
                'stream_id' => $this->streamId,
                'path'      => $outAbs,
            ]);
            return;
        }

        for ($i = 0; $i < $stream->chunk_count; $i++) {
            $chunkAbs = $disk->path(sprintf('streams/%s/chunk_%06d.webm', $stream->stream_key, $i));
            if (!file_exists($chunkAbs)) {
                continue;
            }
            $in = fopen($chunkAbs, 'rb');
            if (!$in) {
                continue;
            }
            stream_copy_to_stream($in, $out);
            fclose($in);
        }

        fclose($out);

        $stream->update(['recording_path' => $outRel]);

        Log::info('MergeStreamChunksJob: grabación completada', [
            'stream_id'  => $this->streamId,
            'stream_key' => $stream->stream_key,
            'chunks'     => $stream->chunk_count,
        ]);
    }
}
