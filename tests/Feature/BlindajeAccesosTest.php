<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Blindaje de accesos (2026-10-04): IP real no falsificable, paneles solo desde
 * países permitidos y bloqueo por fuerza bruta de la clave de superadmin.
 */
class BlindajeAccesosTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['superadmin.key' => 'clave-super', 'app.tenant_slug' => null]);
        Cache::flush();
    }

    private function diag(array $headers, string $ip = '203.0.113.7')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->withHeaders($headers + ['X-Super-Admin-Key' => 'clave-super'])
            ->getJson('/api/superadmin/seguridad/diagnostico');
    }

    public function test_sin_configurar_la_ip_sale_de_x_forwarded_for(): void
    {
        config(['seguridad.admin_paises' => []]);
        $this->diag(['X-Forwarded-For' => '198.51.100.9'])->assertOk()->assertJsonPath('ip_que_ve_laravel', '198.51.100.9');
    }

    public function test_con_client_ip_header_no_se_puede_falsificar_con_x_forwarded_for(): void
    {
        config(['seguridad.admin_paises' => [], 'seguridad.client_ip_header' => 'CF-Connecting-IP']);
        $this->diag(['X-Forwarded-For' => '1.2.3.4', 'CF-Connecting-IP' => '190.12.34.56'])
            ->assertOk()->assertJsonPath('ip_que_ve_laravel', '190.12.34.56');
    }

    public function test_panel_bloqueado_desde_otro_pais_y_permitido_desde_peru(): void
    {
        config(['seguridad.admin_paises' => ['PE'], 'seguridad.country_header' => 'CF-IPCountry']);

        $this->diag(['CF-IPCountry' => 'RU'])->assertStatus(403);
        $this->diag(['CF-IPCountry' => 'PE'])->assertOk();
    }

    public function test_pais_por_geoip_cuando_no_hay_cabecera(): void
    {
        config(['seguridad.admin_paises' => ['PE'], 'seguridad.country_header' => '']);
        Http::fake(['ip-api.com/*' => Http::response(['status' => 'success', 'countryCode' => 'CN', 'regionName' => 'X', 'city' => 'Y', 'lat' => 0, 'lon' => 0])]);

        $this->diag([], '45.10.20.30')->assertStatus(403);
    }

    public function test_si_no_se_sabe_el_pais_se_deja_pasar(): void
    {
        config(['seguridad.admin_paises' => ['PE'], 'seguridad.country_header' => '']);
        Http::fake(['ip-api.com/*' => Http::response([], 500)]);

        $this->diag([], '45.10.20.31')->assertOk();
    }

    public function test_la_web_publica_no_se_restringe_por_pais(): void
    {
        config(['seguridad.admin_paises' => ['PE'], 'seguridad.country_header' => 'CF-IPCountry']);
        $r = $this->withHeaders(['CF-IPCountry' => 'US'])->getJson('/api/feedback/summary');
        $this->assertNotSame(403, $r->status());
    }

    public function test_fuerza_bruta_de_la_clave_de_superadmin_bloquea_la_ip(): void
    {
        config(['seguridad.admin_paises' => [], 'seguridad.max_intentos' => 3]);
        RateLimiter::clear('sa-fallos:203.0.113.50');

        foreach (range(1, 3) as $i) {
            $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.50'])
                ->withHeaders(['X-Super-Admin-Key' => "mala-{$i}"])
                ->getJson('/api/superadmin/seguridad/diagnostico')->assertStatus(403);
        }

        // Ni con la clave correcta: la IP quedó bloqueada.
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.50'])
            ->withHeaders(['X-Super-Admin-Key' => 'clave-super'])
            ->getJson('/api/superadmin/seguridad/diagnostico')->assertStatus(429);

        // Otra IP no se ve afectada.
        $this->diag([], '203.0.113.51')->assertOk();
    }
}
