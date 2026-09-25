<?php

namespace Tests\Unit;

use App\Support\SensitiveData;
use PHPUnit\Framework\TestCase;

/** El chat nunca muestra DNI ni ingresos/bienes declarados (ver SensitiveData). */
class SensitiveDataTest extends TestCase
{
    public function test_oculta_dni_rotulado_en_cualquier_documento(): void
    {
        $r = SensitiveData::redact('Candidato con DNI N° 41234567 postula');

        $this->assertStringNotContainsString('41234567', $r);
        $this->assertStringContainsString(SensitiveData::ID_MASK, $r);
    }

    public function test_fuera_de_la_hoja_de_vida_los_montos_se_conservan(): void
    {
        $r = SensitiveData::redact('Presupuesto de S/ 12,000,000.00 para riego');

        $this->assertStringContainsString('12,000,000.00', $r);
    }

    public function test_hoja_de_vida_oculta_casillas_del_dni_y_conserva_lo_publico(): void
    {
        $r = SensitiveData::redact('I. DATOS PERSONALES 4 1 2 3 4 5 6 7 VILLOSLADA TELMO III. FORMACIÓN ACADÉMICA 2015', true);

        $this->assertStringNotContainsString('4 1 2 3 4 5 6 7', $r);
        $this->assertStringContainsString('TELMO', $r);
        $this->assertStringContainsString('2015', $r);
    }

    public function test_hoja_de_vida_quita_la_seccion_viii_completa(): void
    {
        $r = SensitiveData::redact(
            'VII. MENCIÓN RENUNCIA 1 VIII. DECLARACIÓN JURADA DE INGRESOS DE BIENES Y RENTAS '
            . 'REMUNERACIÓN BRUTA ANUAL 0.00 36,500.00 IX. INFORMACIÓN ADICIONAL',
            true,
        );

        $this->assertStringNotContainsString('36,500.00', $r);
        $this->assertStringNotContainsString('REMUNERACIÓN', $r);
        $this->assertStringContainsString('IX. INFORMACIÓN ADICIONAL', $r);
    }

    public function test_continuacion_patrimonial_en_otra_pagina_se_descarta(): void
    {
        $r = SensitiveData::redact(
            'VEHÍCULO PLACA ABC-123 VALOR (S/) 25000 TOTAL BIENES MUEBLES (S/): 25,000.00 ACCIONES Y PARTICIPACIONES',
            true,
        );

        $this->assertSame(SensitiveData::HV_OMITTED, $r);
    }

    public function test_detecta_hoja_de_vida_por_tema_o_titulo(): void
    {
        $this->assertTrue(SensitiveData::isHojaDeVida('hoja_de_vida', null));
        $this->assertTrue(SensitiveData::isHojaDeVida(null, 'Hoja de Vida — Telmo'));
        $this->assertFalse(SensitiveData::isHojaDeVida('plan_de_gobierno', 'Plan de Gobierno'));
    }
}
