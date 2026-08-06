<?php

namespace Tests\Feature;

use App\Models\LiveStream;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Sin DatabaseTransactions a propósito: el comando pasa por
 * TenantContext::forEachTenant(), que si hay tenants reales registrados en
 * la BD central del entorno local (ej. marina-solano) hace DB::purge('mysql')
 * al cambiar de conexión por cada tenant — eso destruye cualquier transacción
 * abierta de PHPUnit sobre la conexión por defecto, dejando la fila creada en
 * este test como si nunca se hubiera insertado (ModelNotFoundException al
 * refrescarla). Se limpia manualmente en tearDown en su lugar.
 */
class LiveStreamContinueMergesCommandTest extends TestCase
{
    private ?LiveStream $stream = null;

    protected function tearDown(): void
    {
        if ($this->stream) {
            Storage::disk('public')->deleteDirectory("streams/{$this->stream->stream_key}");
            $this->stream->delete();
        }
        parent::tearDown();
    }

    public function test_comando_continue_merges_retoma_streams_pendientes(): void
    {
        Storage::fake('public');

        $this->stream = LiveStream::create([
            'title'       => 'Test stream comando',
            'stream_key'  => 'test-cmd-'.uniqid(),
            'status'      => 'ended',
            'chunk_count' => 3,
            'merge_status' => 'pending',
            'merge_cursor' => 0,
        ]);

        $dir = "streams/{$this->stream->stream_key}";
        Storage::disk('public')->makeDirectory($dir);
        for ($i = 0; $i < 3; $i++) {
            Process::run([
                'ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x120:d=1',
                '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-shortest',
                '-c:v', 'libvpx', '-c:a', 'libopus',
                Storage::disk('public')->path(sprintf('%s/chunk_%06d.webm', $dir, $i)),
            ])->throw();
        }

        Artisan::call('livestreams:continue-merges');

        $fresh = LiveStream::find($this->stream->id);
        $this->assertSame('done', $fresh->merge_status);
        $this->assertFileExists(Storage::disk('public')->path($fresh->recording_path));
    }
}
