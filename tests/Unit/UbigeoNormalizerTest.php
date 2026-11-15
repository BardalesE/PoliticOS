<?php

namespace Tests\Unit;

use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;
use App\Services\UbigeoNormalizer;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * ReduceDocumentJob usa esto para que "propuestas_por_region" agrupe por un id
 * real de ubigeo, no por el string libre que devolvió Groq (mayúsculas,
 * tildes y prefijos "distrito de..." varían entre llamadas).
 */
class UbigeoNormalizerTest extends TestCase
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

        foreach ([
            '2026_09_16_000001_create_ubigeo_departamentos_table',
            '2026_09_16_000002_create_ubigeo_provincias_table',
            '2026_09_16_000003_create_ubigeo_distritos_table',
        ] as $migration) {
            (require database_path("migrations/{$migration}.php"))->up();
        }

        $caj = UbigeoDepartamento::create(['departamento' => 'CAJAMARCA', 'ubigeo' => '06']);
        $sm  = UbigeoProvincia::create(['provincia' => 'SAN MIGUEL', 'ubigeo' => '0612', 'departamento_id' => $caj->id]);
        UbigeoDistrito::create(['distrito' => 'SAN MIGUEL', 'ubigeo' => '061201', 'provincia_id' => $sm->id, 'departamento_id' => $caj->id]);
        UbigeoDistrito::create(['distrito' => 'SAN GREGORIO', 'ubigeo' => '061206', 'provincia_id' => $sm->id, 'departamento_id' => $caj->id]);
    }

    public function test_matches_a_district_regardless_of_case_and_accents(): void
    {
        $out = (new UbigeoNormalizer())->normalize(['san miguel']);

        $this->assertSame('distrito', $out[0]['nivel']);
        $this->assertSame('SAN MIGUEL', $out[0]['nombre_normalizado']);
        $this->assertNotNull($out[0]['distrito_id']);
    }

    public function test_falls_back_to_province_and_then_department(): void
    {
        $out = (new UbigeoNormalizer())->normalize(['San Miguel (provincia)']);
        $this->assertSame(null, $out[0]['nivel']); // el texto con sufijo no matchea ni distrito ni provincia exactos

        $out = (new UbigeoNormalizer())->normalize(['Cajamarca']);
        $this->assertSame('departamento', $out[0]['nivel']);
    }

    public function test_unmatched_mention_keeps_the_text_without_inventing_an_id(): void
    {
        $out = (new UbigeoNormalizer())->normalize(['Marte']);

        $this->assertSame('Marte', $out[0]['mencion']);
        $this->assertNull($out[0]['nivel']);
        $this->assertNull($out[0]['distrito_id']);
    }

    public function test_deduplicates_mentions(): void
    {
        $out = (new UbigeoNormalizer())->normalize(['San Miguel', 'san miguel', 'SAN MIGUEL']);

        $this->assertCount(1, $out);
    }
}
