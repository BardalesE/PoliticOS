<?php

namespace Tests\Feature;

use App\Services\PdfPageExtractor;
use Tests\TestCase;

/**
 * Las marcas de las casillas de la hoja de vida del JNE no son texto: sin el
 * detector, la IA dijo "candidato a regidor" de un candidato a alcalde
 * (2026-09-30). Se usa un PDF sintético, sin datos de ninguna persona.
 */
class HojaDeVidaCasillasTest extends TestCase
{
    public function test_marked_checkboxes_are_prepended_to_the_page_text(): void
    {
        exec('python3 -c "import fitz" 2>&1', $o, $rc1);
        exec('pdftotext -v 2>&1', $o2, $rc2);
        if ($rc1 !== 0 || $rc2 !== 0) {
            $this->markTestSkipped('Requiere python3-fitz y poppler-utils (están en la imagen Docker).');
        }

        $pdf = tempnam(sys_get_temp_dir(), 'hvt') . '.pdf';
        exec('python3 ' . escapeshellarg(base_path('tests/fixtures/make_hv_casillas.py')) . ' ' . escapeshellarg($pdf), $o3, $rc3);
        $this->assertSame(0, $rc3, 'no se pudo generar el PDF de prueba');

        $page = (new PdfPageExtractor())->fromBytes(file_get_contents($pdf))['pages'][0];
        @unlink($pdf);

        $this->assertStringStartsWith('CASILLAS MARCADAS EN ESTA PÁGINA', $page);
        $this->assertStringContainsString('CARGO AL QUE POSTULA: ALCALDE DISTRITAL', $page);
        $this->assertStringNotContainsString('REGIDOR DISTRITAL |', $page);
        $this->assertSame(1, substr_count($page, '|') + 1, 'solo una casilla marcada');
    }

    public function test_block_format(): void
    {
        $this->assertSame(
            'CASILLAS MARCADAS EN ESTA PÁGINA (leídas del PDF; las opciones no listadas NO están marcadas): A: SÍ | B: NO [FIN CASILLAS]',
            PdfPageExtractor::bloqueCasillas(['A: SÍ', 'B: NO'])
        );
    }
}
