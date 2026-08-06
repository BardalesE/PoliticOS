<?php

namespace Tests\Unit;

use App\Http\Controllers\CandidateProfileController;
use App\Models\CandidateProfile;
use App\Services\FrontendRevalidationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Auditoría de calidad (Fase 17, producción): actualizar el perfil del
 * candidato con un PUT parcial (ej. solo `logo_url` tras subir el logo)
 * pisaba silenciosamente color_primary/color_dark/color_accent con el rojo
 * por defecto de PoliticOS, porque el controller aplicaba `?? '#DC2626'`
 * incondicionalmente sin distinguir "campo no enviado en este request" de
 * "fila nueva sin ningún valor todavía". La UI real nunca lo disparaba
 * (candidate-profile/page.tsx manda el formulario completo siempre), pero
 * cualquier integración o llamada directa a la API (como el flujo de
 * provisioning + subida de logo) sí lo pisaba — confirmado en producción.
 */
class CandidateProfileUpdateTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        // app('tenant') no está bound en tests; sin esto, notify() dispara
        // Container::make('tenant') e intenta resolver una clase real.
        app()->bind('tenant', fn () => null);
    }

    private function controller(): CandidateProfileController
    {
        return new CandidateProfileController(new FrontendRevalidationService());
    }

    public function test_update_parcial_no_pisa_los_colores_ya_guardados(): void
    {
        $controller = $this->controller();

        $controller->update(Request::create('/', 'PUT', [
            'name' => 'Marina Solano',
            'title' => 'Candidata a la Alcaldía',
            'location' => 'San Isidro',
            'party' => 'Unidos por el Futuro',
            'color_primary' => '#0D9488',
            'color_dark' => '#0F172A',
            'color_accent' => '#C9A84C',
        ]));

        $controller->update(Request::create('/', 'PUT', [
            'logo_url' => 'https://example.com/logo.png',
        ]));

        $profile = CandidateProfile::where('is_active', true)->first();

        $this->assertSame('#0D9488', $profile->color_primary);
        $this->assertSame('#0F172A', $profile->color_dark);
        $this->assertSame('https://example.com/logo.png', $profile->logo_url);
    }

    public function test_perfil_nuevo_sin_colores_recibe_los_defaults(): void
    {
        $controller = $this->controller();

        $controller->update(Request::create('/', 'PUT', [
            'name' => 'Candidato de prueba',
            'title' => 'Candidato a la Alcaldía',
            'location' => 'Por definir',
            'party' => 'Por definir',
        ]));

        $profile = CandidateProfile::where('is_active', true)->first();

        $this->assertSame('#DC2626', $profile->color_primary);
        $this->assertSame('#7F1D1D', $profile->color_dark);
        $this->assertSame('1', $profile->list_number);
    }
}
