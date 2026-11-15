<?php

namespace Tests\Feature;

use App\Services\DocumentChunker;
use App\Services\PdfPageExtractor;
use Tests\TestCase;

/**
 * Fase 3.1 — el caso real que motivó toda la Fase 1: un plan de gobierno de
 * 200+ páginas. Genera un PDF sintético con ejes, capítulos y menciones de
 * región, lo pasa por el pipeline real (PdfPageExtractor → DocumentChunker,
 * sin mockear nada de la extracción) y verifica que NINGUNA página se pierde
 * — ni por el viejo corte de 80k ni por huecos en el chunking.
 */
class LargeDocumentIngestTest extends TestCase
{
    private const PAGE_COUNT = 220;

    private const EJES = [
        'DESARROLLO ECONOMICO', 'SALUD Y BIENESTAR', 'EDUCACION Y CULTURA',
        'SEGURIDAD CIUDADANA', 'INFRAESTRUCTURA VIAL', 'AMBIENTE Y SANEAMIENTO',
        'TURISMO Y PATRIMONIO', 'GESTION MUNICIPAL', 'PARTICIPACION CIUDADANA',
        'DESARROLLO RURAL', 'AGUA Y SANEAMIENTO',
    ];

    private const REGIONES = ['SAN MIGUEL', 'SAN GREGORIO', 'LA LIBERTAD'];

    /** @return array{0: string, 1: array<int,string>} [bytes del PDF, texto esperado por página] */
    private function buildSyntheticPlan(int $pages): array
    {
        $expected = [];
        for ($i = 1; $i <= $pages; $i++) {
            $parts  = [];
            $ejeIdx = intdiv($i - 1, 20) % count(self::EJES);
            if (($i - 1) % 20 === 0) {
                $parts[] = 'EJE ' . (intdiv($i - 1, 20) + 1) . ': ' . self::EJES[$ejeIdx];
            }
            $region  = self::REGIONES[$i % count(self::REGIONES)];
            $parts[] = "Pagina {$i} del plan de gobierno municipal.";
            $parts[] = "Propuesta concreta numero {$i}: ejecutar la obra prioritaria para " . self::EJES[$ejeIdx] . '.';
            $parts[] = "Esta accion beneficia directamente a la poblacion de {$region}.";
            $expected[] = implode(' ', $parts);
        }

        return [$this->pdf($expected), $expected];
    }

    /** Mismo generador mínimo de PDF válido que usa CitasPorPaginaTest, para N páginas. */
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
            // Texto plano ASCII (el generador de prueba no necesita tildes reales).
            $safe   = preg_replace('/[^\x20-\x7E]/', '', $text);
            $stream = "BT /F1 10 Tf 40 740 Td ({$safe}) Tj ET";
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

    private function words(string $text): array
    {
        return array_values(array_filter(preg_split('/\s+/u', trim($text))));
    }

    public function test_a_200_plus_page_plan_is_extracted_without_truncation_and_fully_covered_by_chunks(): void
    {
        [$bytes, $expectedPages] = $this->buildSyntheticPlan(self::PAGE_COUNT);

        $extracted = (new PdfPageExtractor())->fromBytes($bytes);

        // 1) Extracción completa: ni una página perdida por el viejo MAX_CHARS=80000.
        $this->assertCount(self::PAGE_COUNT, $extracted['pages']);
        $this->assertStringContainsString('Pagina 1 del plan', $extracted['pages'][0]);
        $this->assertStringContainsString('Pagina ' . self::PAGE_COUNT . ' del plan', $extracted['pages'][self::PAGE_COUNT - 1]);
        $this->assertLessThan(PdfPageExtractor::maxChars(), mb_strlen($extracted['content']));

        // 2) Chunking: cobertura total página por página, sin huecos — cada eje se detecta.
        $chunks = (new DocumentChunker(1500, 200))->chunk($extracted['pages']);
        $this->assertNotEmpty($chunks);

        $coveredPages = [];
        foreach ($chunks as $c) {
            for ($p = $c['page_start']; $p <= $c['page_end']; $p++) {
                $coveredPages[$p] = true;
            }
        }
        ksort($coveredPages);
        $this->assertSame(range(1, self::PAGE_COUNT), array_keys($coveredPages), 'hay páginas sin ningún chunk que las cubra');

        // 3) Ninguna PALABRA de ninguna página se perdió (invariante fuerte: no solo el
        // rango de páginas, sino el contenido real que viaja al MAP de la Fase 1).
        $expectedWords = [];
        foreach ($extracted['pages'] as $pageText) {
            foreach ($this->words($pageText) as $w) {
                $expectedWords[$w] = ($expectedWords[$w] ?? 0) + 1;
            }
        }
        $actualWords = [];
        foreach ($chunks as $c) {
            foreach ($this->words($c['texto']) as $w) {
                $actualWords[$w] = ($actualWords[$w] ?? 0) + 1;
            }
        }
        foreach ($expectedWords as $w => $count) {
            $this->assertGreaterThanOrEqual($count, $actualWords[$w] ?? 0, "la palabra '{$w}' no aparece en ningún chunk");
        }

        // 4) Los 11 ejes quedaron detectados como título de al menos un chunk.
        $titulosDetectados = array_filter(array_unique(array_column($chunks, 'titulo')));
        foreach (self::EJES as $eje) {
            $match = array_filter($titulosDetectados, fn ($t) => str_contains($t, $eje));
            $this->assertNotEmpty($match, "no se detectó el eje '{$eje}' como título de ningún chunk");
        }
    }
}
