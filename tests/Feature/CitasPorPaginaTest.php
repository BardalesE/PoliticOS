<?php

namespace Tests\Feature;

use App\Models\KnowledgeDocument;
use App\Services\CivicAIService;
use App\Services\MySQLFulltextEmbeddings;
use App\Services\PdfPageExtractor;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Citas verificables por página: el PDF se guarda página por página, el RAG
 * devuelve fragmentos con su número de página, y la respuesta solo lleva las citas
 * cuyas etiquetas [S#] el modelo realmente usó (y que existen).
 *
 * SQLite en memoria. Sin FULLTEXT: search() cae al LIKE de respaldo, que comparte
 * con la ruta FULLTEXT toda la lógica de páginas (toExcerpts / rankPages).
 */
class CitasPorPaginaTest extends TestCase
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
            $t->longText('pages')->nullable();
            $t->string('file_url')->nullable();
            $t->string('topic', 40)->nullable();
            $t->unsignedBigInteger('candidate_id')->nullable();
            $t->string('source_url', 500)->nullable();
            $t->string('source_type', 20)->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('ready');
            $t->timestamps();
        });
    }

    /** PDF mínimo válido con una página por cada texto (texto '' = hoja en blanco). */
    private function pdf(array $pageTexts): string
    {
        $objs = [];
        $n = count($pageTexts);
        $objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $kids = implode(' ', array_map(fn ($i) => (3 + $i * 2) . ' 0 R', array_keys($pageTexts)));
        $objs[2] = "<< /Type /Pages /Kids [{$kids}] /Count {$n} >>";
        foreach (array_values($pageTexts) as $i => $text) {
            $pageObj = 3 + $i * 2;
            $contentObj = $pageObj + 1;
            $objs[$pageObj] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {$contentObj} 0 R "
                . "/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>";
            $stream = $text === '' ? '' : "BT /F1 12 Tf 72 720 Td ({$text}) Tj ET";
            $objs[$contentObj] = '<< /Length ' . strlen($stream) . " >>\nstream\n{$stream}\nendstream";
        }

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        ksort($objs);
        foreach ($objs as $id => $body) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($pdf);
        $size = count($objs) + 1;
        $pdf .= "xref\n0 {$size}\n0000000000 65535 f \n";
        foreach ($offsets as $off) {
            $pdf .= sprintf("%010d 00000 n \n", $off);
        }
        $pdf .= "trailer\n<< /Size {$size} /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";

        return $pdf;
    }

    private function doc(array $over = []): KnowledgeDocument
    {
        return KnowledgeDocument::create($over + [
            'title' => 'Plan de Gobierno', 'file_url' => 'https://cdn.test/plan.pdf', 'status' => 'ready',
            'source_type' => 'pdf', 'is_active' => true,
        ]);
    }

    // ── Extracción por página ────────────────────────────────────────

    public function test_extractor_keeps_one_entry_per_pdf_page_and_blank_pages_keep_numbering(): void
    {
        $r = (new PdfPageExtractor())->fromBytes($this->pdf([
            'Presentacion del plan', '', 'Canal de riego Agua Blanca',
        ]));

        $this->assertCount(3, $r['pages']);
        $this->assertStringContainsString('Presentacion', $r['pages'][0]);
        $this->assertSame('', $r['pages'][1]);                       // hoja en blanco: no desplaza la numeración
        $this->assertStringContainsString('Canal de riego', $r['pages'][2]);
        $this->assertStringContainsString('Presentacion del plan', $r['content']);
        $this->assertStringContainsString('Canal de riego', $r['content']);
    }

    // ── Búsqueda: fragmentos con número de página ────────────────────

    public function test_search_returns_the_best_page_with_its_number(): void
    {
        $pages = [
            'Presentacion del plan de gobierno del distrito. Vision general y enfoque de desarrollo humano.',
            'Diagnostico del distrito: poblacion, servicios basicos y economia local.',
            'Actividad agropecuaria: ejecutar el canal de riego Agua Blanca para los productores agricolas.',
            'Salud: gestionar la posta de salud San Jose.',
        ];
        $this->doc(['content' => implode(' ', $pages), 'pages' => $pages]);

        $res = (new MySQLFulltextEmbeddings())->search('¿Qué propone sobre agricultura y riego?', 3);

        $this->assertNotEmpty($res);
        $this->assertSame(3, $res[0]['page']);
        $this->assertStringContainsString('canal de riego', $res[0]['excerpt']);
        $this->assertSame('https://cdn.test/plan.pdf', $res[0]['metadata']['file_url']);
    }

    public function test_scoped_search_finds_pages_by_topic_vocabulary_even_when_the_word_is_not_in_the_text(): void
    {
        $pages = [
            'Presentacion del plan de gobierno del distrito. Vision general.',
            'Actividad agropecuaria: ejecutar el canal de riego Agua Blanca para los productores.',
            'Salud: gestionar la posta de salud San Jose.',
        ];
        $mio  = $this->doc(['title' => 'Plan mio', 'candidate_id' => 5, 'content' => implode(' ', $pages), 'pages' => $pages]);
        $this->doc(['title' => 'Plan ajeno', 'candidate_id' => 6, 'content' => 'Agricultura y riego en otro distrito.', 'pages' => ['Agricultura y riego en otro distrito.']]);

        // "agricultura" no aparece en el texto de $mio: el vocabulario del tema (agropecuaria, riego) sí.
        $res = (new MySQLFulltextEmbeddings())->search('¿Qué propone sobre agricultura?', 3, ['candidate_id' => 5]);

        $this->assertCount(1, $res);
        $this->assertSame($mio->id, $res[0]['document_id']);
        $this->assertSame(2, $res[0]['page']);
    }

    public function test_scoped_search_returns_nothing_when_no_page_talks_about_the_topic(): void
    {
        $pages = ['Presentacion del plan.', 'Salud: gestionar la posta de salud San Jose.'];
        $this->doc(['candidate_id' => 5, 'content' => implode(' ', $pages), 'pages' => $pages]);

        $this->assertSame([], (new MySQLFulltextEmbeddings())->search('¿Qué propone sobre seguridad?', 3, ['candidate_id' => 5]));
    }

    public function test_scoped_search_serves_documents_without_pages_only_when_they_mention_the_topic(): void
    {
        $this->doc(['title' => 'Viejo con tema', 'candidate_id' => 5, 'pages' => null,
                    'content' => 'El candidato propone un hospital y postas de salud.']);
        $this->doc(['title' => 'Viejo sin tema', 'candidate_id' => 5, 'pages' => null,
                    'content' => 'Texto de biografia sin relacion con la pregunta.']);

        $res = (new MySQLFulltextEmbeddings())->search('¿Qué propone sobre salud?', 3, ['candidate_id' => 5]);

        $this->assertSame(['Viejo con tema'], array_column($res, 'title'));
    }

    public function test_search_a_document_can_contribute_two_pages_but_never_more_than_four_fragments(): void
    {
        $pages = [
            'Riego tecnificado en la zona alta.',
            'Riego y reservorios para cosecha de agua.',
            'Riego: canal principal y canales secundarios.',
        ];
        $this->doc(['title' => 'Plan A', 'content' => implode(' ', $pages), 'pages' => $pages]);
        $this->doc(['title' => 'Plan B', 'content' => implode(' ', $pages), 'pages' => $pages]);
        $this->doc(['title' => 'Plan C', 'content' => implode(' ', $pages), 'pages' => $pages]);

        $res = (new MySQLFulltextEmbeddings())->search('riego', 5);

        $this->assertLessThanOrEqual(4, count($res));
        $porDoc = array_count_values(array_column($res, 'document_id'));
        $this->assertLessThanOrEqual(2, max($porDoc));
        // Cada documento aporta primero su mejor página (diversidad de fuentes).
        $this->assertCount(3, array_unique(array_column(array_slice($res, 0, 3), 'document_id')));
    }

    public function test_search_document_without_pages_still_works_without_a_page_number(): void
    {
        $this->doc(['content' => 'El plan propone un canal de riego para los productores.', 'pages' => null]);

        $res = (new MySQLFulltextEmbeddings())->search('canal de riego', 3);

        $this->assertCount(1, $res);
        $this->assertNull($res[0]['page']);
        $this->assertStringContainsString('canal de riego', $res[0]['excerpt']);
    }

    // ── Etiquetas [S#] y citas de la respuesta ───────────────────────

    private function aiWithCitations(): CivicAIService
    {
        $ai = new CivicAIService(new MySQLFulltextEmbeddings());
        $m = new \ReflectionMethod($ai, 'buildDocumentationSection');
        $m->setAccessible(true);

        $m->invoke($ai, [
            ['document_id' => 7, 'title' => 'Plan de Gobierno', 'page' => 8,
             'excerpt' => 'Ejecutar el canal de riego Agua Blanca.',
             'metadata' => ['file_url' => 'https://cdn.test/plan.pdf', 'source_type' => 'pdf']],
            ['document_id' => 8, 'title' => 'Hoja de vida', 'page' => null,
             'excerpt' => 'Ingreso anual declarado.',
             'metadata' => ['file_url' => 'https://cdn.test/hv.pdf', 'source_type' => 'pdf']],
        ], false);

        return $ai;
    }

    public function test_prompt_labels_each_fragment_and_shows_the_page(): void
    {
        $ai = new CivicAIService(new MySQLFulltextEmbeddings());
        $m = new \ReflectionMethod($ai, 'buildDocumentationSection');
        $m->setAccessible(true);

        $text = $m->invoke($ai, [
            ['document_id' => 7, 'title' => 'Plan de Gobierno', 'page' => 8, 'excerpt' => 'Ejecutar el canal de riego.',
             'metadata' => ['file_url' => 'https://cdn.test/plan.pdf']],
        ], false);

        $this->assertStringContainsString('[S1] Plan de Gobierno (pág. 8)', $text);
        $this->assertStringContainsString('CITAS VERIFICABLES', $text);
    }

    public function test_only_citations_used_in_the_reply_are_returned_in_order_of_appearance(): void
    {
        $ai = $this->aiWithCitations();

        $c = $ai->citationsForReply('Propone el canal de riego [S1]. Su ingreso es de S/ 24,000 [S2]. Otra vez [S1].');

        $this->assertSame(['S1', 'S2'], array_column($c, 'id'));
        $this->assertSame(8, $c[0]['page']);
        $this->assertSame('Ejecutar el canal de riego Agua Blanca.', $c[0]['excerpt']);
        $this->assertSame('https://cdn.test/plan.pdf', $c[0]['url']);
        $this->assertNull($c[1]['page']);

        $this->assertSame([], array_column($ai->citationsForReply('Respuesta sin etiquetas.'), 'id'));
    }

    public function test_grouped_markers_are_understood(): void
    {
        $ai = $this->aiWithCitations();

        $this->assertSame(['S2', 'S1'], array_column($ai->citationsForReply('Ambos lo dicen [S2, S1].'), 'id'));
    }

    public function test_invented_markers_yield_no_citation_and_are_stripped(): void
    {
        $ai = $this->aiWithCitations();

        $this->assertSame([], $ai->citationsForReply('Dato inventado [S9].'));
        $this->assertSame('Dato inventado .', $ai->stripUnknownCitations('Dato inventado [S9].'));
        $this->assertSame('Real [S1] y mixto [S1] .', $ai->stripUnknownCitations('Real [S1] y mixto [S1, S9] .'));
    }

    public function test_no_documents_means_no_citations(): void
    {
        $ai = new CivicAIService(new MySQLFulltextEmbeddings());
        $m = new \ReflectionMethod($ai, 'buildDocumentationSection');
        $m->setAccessible(true);
        $m->invoke($ai, [], false);

        $this->assertSame([], $ai->citationsForReply('Algo [S1].'));
    }

    // ── Backfill de PDFs ya subidos ──────────────────────────────────

    public function test_backfill_fills_pages_without_touching_content_or_status_and_is_idempotent(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');
        config(['filesystems.media' => 'public']);

        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        $disk->put('knowledge/plan.pdf', $this->pdf(['Presentacion', 'Canal de riego']));
        $disk->put('knowledge/roto.pdf', 'esto no es un pdf');

        $ok   = $this->doc(['file_url' => $disk->url('knowledge/plan.pdf'), 'content' => 'CONTENT ORIGINAL', 'pages' => null]);
        $roto = $this->doc(['file_url' => $disk->url('knowledge/roto.pdf'), 'content' => 'CONTENT ROTO', 'pages' => null]);
        $ya   = $this->doc(['file_url' => $disk->url('knowledge/plan.pdf'), 'pages' => ['ya tenia']]);

        $this->artisan('knowledge:backfill-pages', ['--here' => true])->assertExitCode(0);

        $ok->refresh();
        $this->assertCount(2, $ok->pages);
        $this->assertStringContainsString('Canal de riego', $ok->pages[1]);
        $this->assertSame('CONTENT ORIGINAL', $ok->content);          // content intacto
        $this->assertSame('ready', $ok->status);                       // status intacto

        $roto->refresh();                                              // PDF ilegible: queda como estaba, NO pasa a failed
        $this->assertNull($roto->pages);
        $this->assertSame('ready', $roto->status);
        $this->assertSame('CONTENT ROTO', $roto->content);

        $this->assertSame(['ya tenia'], $ya->fresh()->pages);          // no se sobreescribe lo que ya tiene páginas
    }

    public function test_backfill_requires_a_slug_or_here_and_the_pages_column(): void
    {
        $this->artisan('knowledge:backfill-pages')->assertExitCode(1);

        Schema::table('knowledge_documents', fn (Blueprint $t) => $t->dropColumn('pages'));
        $this->artisan('knowledge:backfill-pages', ['--here' => true])
            ->expectsOutputToContain('tenant:migrate')
            ->assertExitCode(1);
    }
}
