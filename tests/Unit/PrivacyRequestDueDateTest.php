<?php

namespace Tests\Unit;

use App\Models\PrivacyRequest;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

/** Plazos legales de las solicitudes ARCO: días hábiles, sin sábados ni domingos. */
class PrivacyRequestDueDateTest extends TestCase
{
    public function test_diez_dias_habiles_saltan_los_fines_de_semana(): void
    {
        // Jueves 24/09/2026 + 10 hábiles = jueves 08/10/2026.
        $due = PrivacyRequest::addBusinessDays(Carbon::parse('2026-09-24'), 10);

        $this->assertSame('2026-10-08', $due->toDateString());
    }

    public function test_desde_un_viernes_el_primer_habil_es_el_lunes(): void
    {
        $due = PrivacyRequest::addBusinessDays(Carbon::parse('2026-09-25'), 1);

        $this->assertSame('2026-09-28', $due->toDateString());
    }

    public function test_acceso_tiene_veinte_dias_y_cancelacion_diez(): void
    {
        $from = Carbon::parse('2026-09-24');

        $this->assertSame('2026-10-22', PrivacyRequest::dueDateFor('acceso', $from)->toDateString());
        $this->assertSame('2026-10-08', PrivacyRequest::dueDateFor('cancelacion', $from)->toDateString());
    }
}
