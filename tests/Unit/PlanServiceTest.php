<?php

namespace Tests\Unit;

use App\Models\Tenant;
use App\Services\PlanService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * Auditoría de calidad (Fase 13): PlanService no tenía ningún test pese a
 * ser el gate real que decide qué features/límites ve cada tenant en
 * producción (CheckPlanFeature middleware lo consulta en cada request
 * admin). Se usa el plan 'custom' para no depender del contenido exacto
 * sembrado por PlanFeaturesSeeder en starter/pro/elite (esos ya existen en
 * la BD de test vía DatabaseTransactions, no RefreshDatabase, así que
 * insertar filas nuevas con esos planes violaría el unique de la columna).
 */
class PlanServiceTest extends TestCase
{
    use DatabaseTransactions;

    private function tenant(array $overrides = []): Tenant
    {
        return Tenant::create(array_merge([
            'slug'    => 'test-'.uniqid(),
            'name'    => 'Tenant de prueba',
            'db_name' => 'irrelevante_para_este_test',
            'plan'    => 'custom',
        ], $overrides));
    }

    public function test_custom_features_reemplaza_completamente_los_defaults(): void
    {
        $tenant = $this->tenant([
            'custom_features' => ['proposals' => true, 'media' => true],
        ]);

        $features = PlanService::resolveFeatures($tenant);

        $this->assertSame(['proposals' => true, 'media' => true], $features);
    }

    public function test_is_enabled_lee_features_booleanas_planas(): void
    {
        $tenant = $this->tenant(['custom_features' => ['proposals' => true, 'media' => false]]);

        $this->assertTrue(PlanService::isEnabled($tenant, 'proposals'));
        $this->assertFalse(PlanService::isEnabled($tenant, 'media'));
    }

    public function test_is_enabled_lee_el_subcampo_enabled_en_features_anidadas(): void
    {
        $tenant = $this->tenant([
            'custom_features' => ['intelligence' => ['enabled' => true, 'advanced' => false]],
        ]);

        $this->assertTrue(PlanService::isEnabled($tenant, 'intelligence'));
    }

    public function test_is_enabled_devuelve_false_para_feature_inexistente(): void
    {
        $tenant = $this->tenant(['custom_features' => ['proposals' => true]]);

        $this->assertFalse(PlanService::isEnabled($tenant, 'algo_que_no_existe'));
    }

    public function test_get_limit_y_within_limit(): void
    {
        $tenant = $this->tenant([
            'custom_features' => ['knowledge' => ['enabled' => true, 'max_documents' => 5]],
        ]);

        $this->assertSame(5, PlanService::getLimit($tenant, 'knowledge', 'max_documents'));
        $this->assertTrue(PlanService::withinLimit($tenant, 'knowledge', 'max_documents', 4));
        $this->assertFalse(PlanService::withinLimit($tenant, 'knowledge', 'max_documents', 5));
    }

    public function test_within_limit_ilimitado_con_menos_uno(): void
    {
        $tenant = $this->tenant([
            'custom_features' => ['knowledge' => ['enabled' => true, 'max_documents' => -1]],
        ]);

        // -1 significa "sin límite" — siempre dentro, sin importar el conteo actual.
        $this->assertTrue(PlanService::withinLimit($tenant, 'knowledge', 'max_documents', 999_999));
    }

    public function test_messages_per_month_usa_default_500_si_no_esta_configurado(): void
    {
        $tenant = $this->tenant(['custom_features' => ['proposals' => true]]);

        $this->assertSame(500, PlanService::messagesPerMonth($tenant));
    }

    public function test_required_plan_for_mapea_features_al_plan_minimo_correcto(): void
    {
        $this->assertSame('elite', PlanService::requiredPlanFor('livestream'));
        $this->assertSame('elite', PlanService::requiredPlanFor('attack_responses'));
        $this->assertSame('pro', PlanService::requiredPlanFor('intelligence'));
        $this->assertSame('pro', PlanService::requiredPlanFor('surveys'));
        $this->assertSame('starter', PlanService::requiredPlanFor('knowledge'));
        $this->assertSame('starter', PlanService::requiredPlanFor('feature_no_mapeada'));
    }
}
