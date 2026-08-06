<?php

namespace Tests\Feature;

use App\Jobs\MergeStreamChunksJob;
use App\Models\LiveStream;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Auditoría de calidad: "En vivo" no funcionaba para grabaciones largas en
 * producción — QUEUE_CONNECTION=sync (sin worker real) hacía que el merge de
 * miles de chunks corriera dentro del mismo request HTTP de "Detener" y
 * chocara con max_execution_time=120 de PHP-FPM, y el archivo de salida no
 * era atómico (un corte a medias dejaba una grabación corrupta para
 * siempre). Ver MergeStreamChunksJob y ContinueLiveStreamMerges.
 */
class LiveStreamMergeTest extends TestCase
{
    use DatabaseTransactions;

    private function makeChunk(string $absPath): void
    {
        // Genera 1s de video negro silencioso — un WebM real y válido, no un
        // archivo de relleno, para que ffmpeg (y el fallback binario) lo
        // procesen exactamente como lo harían con un chunk real de MediaRecorder.
        Process::run([
            'ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x120:d=1',
            '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-shortest',
            '-c:v', 'libvpx', '-c:a', 'libopus', $absPath,
        ])->throw();
    }

    private function makeStreamWithChunks(int $chunkCount): LiveStream
    {
        Storage::fake('public');

        $stream = LiveStream::create([
            'title'       => 'Test stream',
            'stream_key'  => 'test-'.uniqid(),
            'status'      => 'ended',
            'chunk_count' => $chunkCount,
        ]);

        $dir = "streams/{$stream->stream_key}";
        Storage::disk('public')->makeDirectory($dir);

        for ($i = 0; $i < $chunkCount; $i++) {
            $abs = Storage::disk('public')->path(sprintf('%s/chunk_%06d.webm', $dir, $i));
            $this->makeChunk($abs);
        }

        return $stream;
    }

    public function test_processBatch_completa_el_merge_y_marca_done(): void
    {
        $stream = $this->makeStreamWithChunks(5);

        (new MergeStreamChunksJob($stream->id))->processBatch();

        $stream->refresh();
        $this->assertSame('done', $stream->merge_status);
        $this->assertSame(5, $stream->merge_cursor);
        $this->assertNotNull($stream->recording_path);

        $outAbs = Storage::disk('public')->path($stream->recording_path);
        $this->assertFileExists($outAbs);
        $this->assertGreaterThan(0, filesize($outAbs));

        // No debe quedar ningún archivo temporal huérfano tras completar.
        $this->assertFileDoesNotExist(Storage::disk('public')->path("streams/{$stream->stream_key}/recording.tmp.webm"));
    }

    public function test_processBatch_es_idempotente_si_ya_esta_done(): void
    {
        $stream = $this->makeStreamWithChunks(3);

        (new MergeStreamChunksJob($stream->id))->processBatch();
        $firstRecordingMtime = filemtime(Storage::disk('public')->path($stream->refresh()->recording_path));

        // Segunda llamada: no debe re-mergear ni tronar.
        (new MergeStreamChunksJob($stream->id))->processBatch();
        $stream->refresh();

        $this->assertSame('done', $stream->merge_status);
        $this->assertSame(
            $firstRecordingMtime,
            filemtime(Storage::disk('public')->path($stream->recording_path)),
            'El archivo final no debió tocarse en la segunda llamada.'
        );
    }

    public function test_un_intento_a_medias_no_corrompe_el_archivo_final(): void
    {
        $stream = $this->makeStreamWithChunks(3);
        $dir    = "streams/{$stream->stream_key}";

        // Simula un corte a medias de un intento anterior: un .tmp huérfano
        // con contenido corrupto Y merge_status='processing' (nunca llegó a
        // 'done' ni se renombró). El archivo FINAL nunca debe existir hasta
        // que un intento realmente complete.
        Storage::disk('public')->put("{$dir}/recording.tmp.webm", 'contenido corrupto de un intento anterior');
        $stream->update(['merge_status' => 'processing']);

        $this->assertFileDoesNotExist(Storage::disk('public')->path("{$dir}/recording.webm"));

        (new MergeStreamChunksJob($stream->id))->processBatch();
        $stream->refresh();

        $this->assertSame('done', $stream->merge_status);
        $outAbs = Storage::disk('public')->path($stream->recording_path);
        $this->assertFileExists($outAbs);
        // El contenido final debe ser el merge real, no el placeholder corrupto.
        $this->assertNotSame('contenido corrupto de un intento anterior', file_get_contents($outAbs));
    }

    public function test_stream_sin_chunks_no_truena(): void
    {
        Storage::fake('public');
        $stream = LiveStream::create([
            'title'       => 'Vacío',
            'stream_key'  => 'empty-'.uniqid(),
            'status'      => 'ended',
            'chunk_count' => 0,
        ]);

        (new MergeStreamChunksJob($stream->id))->processBatch();

        $stream->refresh();
        $this->assertSame('none', $stream->merge_status); // no se tocó, no hay nada que mergear
    }
}
