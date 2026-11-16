<?php

namespace Tests\Unit;

use App\Services\DocumentChunker;
use Tests\TestCase;

/**
 * El chunker es la pieza que garantiza que NINGUNA página del documento queda
 * fuera de un chunk (invariante central de la Fase 1 — antes el RAG solo veía
 * ~13% de un plan de 200+ páginas). Estas pruebas verifican esa cobertura
 * total, la detección de títulos de sección, y el fallback por tokens.
 */
class DocumentChunkerTest extends TestCase
{
    private function words(string $text): array
    {
        return preg_split('/\s+/u', trim($text));
    }

    public function test_detects_eje_and_capitulo_headings_and_keeps_them_as_titulo(): void
    {
        $pages = [
            'PLAN DE GOBIERNO MUNICIPAL Presentacion del candidato y su equipo.',
            'EJE 1: DESARROLLO ECONOMICO Impulsar la actividad agropecuaria y el turismo local.',
            'CAPITULO II Diagnostico de servicios basicos en la provincia.',
        ];

        $chunks = (new DocumentChunker(1500, 200))->chunk($pages);

        // "PLAN DE GOBIERNO MUNICIPAL" al inicio del documento también es un
        // título real (mayúsculas + texto normal a continuación): se detecta.
        $this->assertStringContainsString('PLAN DE GOBIERNO MUNICIPAL', $chunks[0]['titulo']);
        $this->assertStringContainsString('PLAN DE GOBIERNO MUNICIPAL', $chunks[0]['texto']);

        $ejeChunk = $this->findByTitleContaining($chunks, 'EJE 1');
        $this->assertNotNull($ejeChunk);
        $this->assertStringContainsString('DESARROLLO ECONOMICO', $ejeChunk['texto']);
        $this->assertSame(2, $ejeChunk['page_start']);
        $this->assertSame(2, $ejeChunk['page_end']);

        $capChunk = $this->findByTitleContaining($chunks, 'CAPITULO II');
        $this->assertNotNull($capChunk);
        $this->assertSame(3, $capChunk['page_start']);
    }

    public function test_every_word_of_every_page_appears_in_some_chunk_with_headings(): void
    {
        $pages = [
            'PLAN DE GOBIERNO MUNICIPAL Presentacion del candidato.',
            'EJE 1: DESARROLLO ECONOMICO Impulsar la actividad agropecuaria.',
            'Mas texto del eje economico sin otro titulo en esta pagina.',
            'CAPITULO II Diagnostico de servicios basicos.',
        ];

        $chunks = (new DocumentChunker(1500, 200))->chunk($pages);

        $this->assertWordCoverage($pages, $chunks);
    }

    public function test_blank_pages_do_not_break_page_coverage(): void
    {
        $pages = ['Presentacion inicial del plan.', '', 'EJE 1 agricultura y riego.', ''];

        $chunks = (new DocumentChunker(1500, 200))->chunk($pages);

        $this->assertWordCoverage($pages, $chunks);
    }

    public function test_document_without_any_heading_falls_back_to_one_untitled_section(): void
    {
        $pages = ['Texto corrido sin ningun titulo detectable en todo el documento.', 'Segunda pagina tambien sin titulos.'];

        $chunks = (new DocumentChunker(1500, 200))->chunk($pages);

        $this->assertCount(1, $chunks);
        $this->assertNull($chunks[0]['titulo']);
        $this->assertSame(1, $chunks[0]['page_start']);
        $this->assertSame(2, $chunks[0]['page_end']);
    }

    public function test_a_large_section_without_headings_is_split_with_overlap_and_still_covers_every_page(): void
    {
        // 300 palabras por página x 20 páginas = 6000 palabras, bastante más
        // que un chunk de ~1150 palabras (1500 tokens / 1.3) para forzar el split.
        $pages = [];
        for ($p = 1; $p <= 20; $p++) {
            $words = [];
            for ($w = 1; $w <= 300; $w++) {
                $words[] = "p{$p}w{$w}";
            }
            $pages[] = implode(' ', $words);
        }

        $chunker = new DocumentChunker(1500, 200);
        $chunks  = $chunker->chunk($pages);

        $this->assertGreaterThan(1, count($chunks), 'un documento de 6000 palabras debe partirse en varios chunks');
        $this->assertWordCoverage($pages, $chunks);

        // Solape real entre chunks consecutivos (overlapTokens=200 -> ~154 palabras).
        $firstWords  = $this->words($chunks[0]['texto']);
        $secondWords = $this->words($chunks[1]['texto']);
        $overlap     = array_intersect(array_slice($firstWords, -154), array_slice($secondWords, 0, 154));
        $this->assertNotEmpty($overlap);

        // page_start/page_end crecientes y consistentes a lo largo de los chunks.
        foreach ($chunks as $c) {
            $this->assertLessThanOrEqual($c['page_end'], $c['page_start']);
        }
    }

    private function findByTitleContaining(array $chunks, string $needle): ?array
    {
        foreach ($chunks as $c) {
            if ($c['titulo'] !== null && str_contains($c['titulo'], $needle)) {
                return $c;
            }
        }
        return null;
    }

    /** Cada palabra de cada página debe aparecer en al menos un chunk (sin huecos). */
    private function assertWordCoverage(array $pages, array $chunks): void
    {
        $expected = [];
        foreach ($pages as $pageText) {
            foreach ($this->words($pageText) as $w) {
                if ($w !== '') {
                    $expected[$w] = ($expected[$w] ?? 0) + 1;
                }
            }
        }

        $actual = [];
        foreach ($chunks as $c) {
            foreach ($this->words($c['texto']) as $w) {
                if ($w !== '') {
                    $actual[$w] = ($actual[$w] ?? 0) + 1;
                }
            }
        }

        foreach ($expected as $w => $count) {
            $this->assertGreaterThanOrEqual(
                $count,
                $actual[$w] ?? 0,
                "la palabra '{$w}' de una página no aparece en ningún chunk"
            );
        }
    }
}
