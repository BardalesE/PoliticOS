<?php

namespace Tests\Unit;

use App\Support\HojaDeVidaDatosClave;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

/** Datos ficticios con el mismo formato que PdfPageExtractor guarda por página. */
class HojaDeVidaDatosClaveTest extends TestCase
{
    private function paginas(string $eleccion = 'SÍ TENGO', bool $conCargo = true): array
    {
        $p1 = 'CASILLAS MARCADAS EN ESTA PÁGINA (leídas del PDF; las opciones no listadas NO están marcadas): '
            . 'CARGO AL QUE POSTULA: ALCALDE DISTRITAL | II. EXPERIENCIA DE TRABAJO EN OFICIOS, OCUPACIONES O PROFESIONES: NO TENGO | '
            . 'EDUCACIÓN BÁSICA REGULAR — ¿CUENTA CON ESTUDIOS PRIMARIOS?: SÍ | EDUCACIÓN BÁSICA REGULAR — CONCLUIDOS: SÍ | '
            . 'EDUCACIÓN BÁSICA REGULAR — ¿CUENTA CON ESTUDIOS SECUNDARIOS?: SÍ | EDUCACIÓN BÁSICA REGULAR — CONCLUIDOS: NO | '
            . 'ESTUDIOS NO UNIVERSITARIOS: NO TENGO | ESTUDIOS UNIVERSITARIOS: SÍ TENGO | ESTUDIOS DE POSGRADO: NO | '
            . "CARGOS PARTIDARIOS: NO TENGO | CARGOS DE ELECCIÓN POPULAR — ¿TENGO INFORMACIÓN POR DECLARAR?: {$eleccion} [FIN CASILLAS] "
            . 'FORMATO ÚNICO DE DECLARACIÓN JURADA DE HOJA DE VIDA 12345678: ANA PRUEBA DEMO '
            . 'FECHA DE NACIMIENTO (dd/mm/aaaa) (6): 15/10/1990 12345678000 LUGAR DE NACIMIENTO (7) PAÍS: PERÚ '
            . 'DEPARTAMENTO:LA LIBERTAD PROVINCIA: CHEPEN DISTRITO: PUEBLO NUEVO LUGAR DE DOMICILIO DEPARTAMENTO:LA LIBERTAD';
        $p2 = 'CASILLAS MARCADAS EN ESTA PÁGINA (leídas del PDF; las opciones no listadas NO están marcadas): '
            . ($conCargo ? 'CARGOS DE ELECCIÓN POPULAR — CARGO 1: REGIDOR(A) PROVINCIAL | ' : '')
            . 'V. RELACIÓN DE SENTENCIAS: SÍ TENGO | VI. RELACIÓN DE SENTENCIAS, QUE DECLAREN FUNDADAS LAS DEMANDAS: NO TENGO | '
            . 'VII. MENCIÓN DE LAS RENUNCIAS EFECTUADAS A OTROS PARTIDOS: NO TENGO | INGRESOS — ¿TENGO INFORMACIÓN POR DECLARAR?: SÍ TENGO [FIN CASILLAS] '
            . 'CARGO 1. (Marque solo una opción) REGIDOR(A) PROVINCIAL ORGANIZACIÓN POLÍTICA:PARTIDO DEMO '
            . 'DESDE (AÑO): 2 0 1 9 HASTA (AÑO): 2 0 2 2 INFORMACIÓN COMPLEMENTARIA: V. RELACIÓN DE SENTENCIAS '
            . 'VIII. DECLARACIÓN JURADA DE INGRESOS TOTAL INGRESOS (S/):60,000.00';

        return [$p1, $p2];
    }

    private function lineas(array $pages): string
    {
        return implode("\n", HojaDeVidaDatosClave::desdePaginas($pages, CarbonImmutable::parse('2026-09-30')));
    }

    public function test_reads_birth_age_education_and_elected_office_across_pages(): void
    {
        $t = $this->lineas($this->paginas());

        $this->assertStringContainsString('Fecha de nacimiento: 15/10/1990 (tiene 35 años hoy)', $t);   // aún no cumple 36
        $this->assertStringContainsString('Lugar de nacimiento: Pueblo Nuevo, Chepen, La Libertad', $t);
        $this->assertStringContainsString('Educación básica: primaria completa; secundaria incompleta', $t);
        $this->assertStringContainsString('Estudios universitarios: SÍ declara', $t);
        $this->assertStringContainsString('Experiencia laboral de los últimos 10 años (sección II): no declara ninguna', $t);
        $this->assertStringContainsString('Regidor(a) provincial 2019–2022, por Partido Demo', $t);
        $this->assertStringContainsString('(sección V): SÍ declara', $t);
        $this->assertStringContainsString('Renuncias a otros partidos (sección VII): no declara', $t);
    }

    public function test_never_leaks_id_number_or_income(): void
    {
        $t = $this->lineas($this->paginas());

        $this->assertStringNotContainsString('12345678', $t);
        $this->assertStringNotContainsString('60,000', $t);
        $this->assertStringNotContainsString('INGRESOS', $t);
    }

    public function test_declares_no_elected_office_when_marked_no(): void
    {
        $t = $this->lineas($this->paginas('NO TENGO', false));

        $this->assertStringContainsString('Cargos de elección popular que ya ocupó (sección IV): no declara ninguno', $t);
    }

    public function test_without_checkbox_block_only_plain_text_facts(): void
    {
        $pages = array_map(fn ($p) => preg_replace('/^CASILLAS MARCADAS.*?\[FIN CASILLAS\] /su', '', $p), $this->paginas());
        $t = $this->lineas($pages);

        $this->assertStringContainsString('Fecha de nacimiento', $t);
        $this->assertStringNotContainsString('elección popular', $t);   // sin casillas no se afirma nada
    }

    public function test_non_hv_document_gives_nothing(): void
    {
        $this->assertSame([], HojaDeVidaDatosClave::desdePaginas(['Plan de gobierno 2027-2030']));
    }
}
