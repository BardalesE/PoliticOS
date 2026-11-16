<?php

namespace Tests\Feature;

use App\Jobs\ProcessKnowledgeDocumentJob;
use App\Jobs\StartDocumentAnalysisJob;
use App\Models\KnowledgeDocument;
use App\Services\EmbeddingsServiceInterface;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Puntos 4 y 6 del pedido: subir un PDF (o reindexarlo) ya NO dispara el
 * análisis profundo automáticamente — solo extrae texto/embeddings léxicos,
 * igual que antes. El análisis arranca únicamente con el botón "Analizar
 * plan completo" (KnowledgeDocumentController::analyze, que encadena este
 * job con StartDocumentAnalysisJob a mano vía Bus::chain).
 */
class ProcessKnowledgeDocumentJobTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.tenant_slug' => null,
            'database.default' => 'sqlite',
            'database.connections.sqlite' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true,
            ],
        ]);
        DB::purge('sqlite');

        Schema::create('knowledge_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->longText('content')->nullable();
            $t->json('pages')->nullable();
            $t->string('file_url')->nullable();
            $t->string('topic', 40)->nullable();
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('pending');
            $t->text('error_message')->nullable();
            $t->boolean('embeddings_indexed')->default(false);
            $t->string('analysis_status', 20)->default('sin_analizar');
            $t->unsignedTinyInteger('analysis_progress')->default(0);
            $t->text('analysis_error')->nullable();
            $t->string('analysis_batch_id')->nullable();
            $t->boolean('is_public')->default(false);
            $t->timestamps();
        });
    }

    private function fakeEmbeddings(): EmbeddingsServiceInterface
    {
        return new class implements EmbeddingsServiceInterface {
            public function index(int $documentId, string $content, array $metadata = []): void {}
            public function search(string $query, int $topK = 5, array $filter = []): array { return []; }
            public function delete(int $documentId): void {}
        };
    }

    /** PDF mínimo válido de una sola página (mismo generador que CitasPorPaginaTest). */
    private function onePagePdf(string $text): string
    {
        $stream = "BT /F1 12 Tf 72 720 Td ({$text}) Tj ET";
        $objs = [
            1 => '<< /Type /Catalog /Pages 2 0 R >>',
            2 => '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            3 => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R '
                . '/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>',
            4 => '<< /Length ' . strlen($stream) . " >>\nstream\n{$stream}\nendstream",
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objs as $id => $body) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 5\n0000000000 65535 f \n";
        foreach ($offsets as $off) {
            $pdf .= sprintf("%010d 00000 n \n", $off);
        }
        $pdf .= "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";

        return $pdf;
    }

    private function docWithRealFile(array $over = []): KnowledgeDocument
    {
        Storage::fake('public');
        config(['filesystems.media' => 'public']);
        $disk = Storage::disk('public');
        $disk->put('knowledge/test.pdf', $this->onePagePdf('Plan de gobierno de prueba.'));

        return KnowledgeDocument::create($over + [
            'title' => 'Plan', 'file_url' => $disk->url('knowledge/test.pdf'),
        ]);
    }

    public function test_extracting_a_document_does_not_start_the_deep_analysis(): void
    {
        Bus::fake();
        $doc = $this->docWithRealFile();

        (new ProcessKnowledgeDocumentJob($doc->id))->handle($this->fakeEmbeddings());

        $doc->refresh();
        $this->assertSame('ready', $doc->status);
        $this->assertNotEmpty($doc->content);
        $this->assertSame('sin_analizar', $doc->analysis_status, 'la extracción no debe tocar analysis_status');
        Bus::assertNotDispatched(StartDocumentAnalysisJob::class);
    }

    public function test_a_failed_extraction_also_never_starts_the_analysis(): void
    {
        Bus::fake();
        Storage::fake('public');
        config(['filesystems.media' => 'public']);
        Storage::disk('public')->put('knowledge/roto.pdf', 'esto no es un pdf');
        $doc = KnowledgeDocument::create([
            'title' => 'Plan roto', 'file_url' => Storage::disk('public')->url('knowledge/roto.pdf'),
        ]);

        try {
            (new ProcessKnowledgeDocumentJob($doc->id))->handle($this->fakeEmbeddings());
        } catch (\Throwable) {
            // El job relanza la excepción a propósito (ver su docblock) para que
            // la cola la registre; lo relevante acá es que nunca encadena el análisis.
        }

        $doc->refresh();
        $this->assertSame('failed', $doc->status);
        Bus::assertNotDispatched(StartDocumentAnalysisJob::class);
    }
}
