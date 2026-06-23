<?php

namespace Tests\Feature;

use App\Http\Controllers\ExternalSignalController;
use App\Models\ExternalSignal;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * Fase 6, bloque 5: el ingest valida, castea y persiste el campo `entities`,
 * y sigue aceptando señales legadas sin el campo (retrocompatible).
 *
 * La validación se ejercita contra ExternalSignalController::ingestRules()
 * (las reglas reales del endpoint). La persistencia/cast se prueba con un
 * round-trip de modelo bajo DatabaseTransactions (rollback, no ensucia la BD)
 * — evita el stack de middleware tenant/plan, que es ortogonal a este campo.
 */
class ExternalSignalEntitiesTest extends TestCase
{
    use DatabaseTransactions;

    private function baseSignal(array $overrides = []): array
    {
        return ['signals' => [array_merge([
            'source'      => 'news',
            'content'     => 'Keiko Fujimori critica a César Acuña en Piura',
            'captured_at' => '2026-06-12T10:00:00-05:00',
        ], $overrides)]];
    }

    private function validate(array $payload): \Illuminate\Validation\Validator
    {
        return Validator::make($payload, ExternalSignalController::ingestRules());
    }

    // ─── Validación (reglas reales del controller) ───────────────────

    public function test_accepts_valid_entities(): void
    {
        $v = $this->validate($this->baseSignal(['entities' => [
            ['type' => 'candidate', 'slug' => 'keiko-fujimori', 'name' => 'Keiko Fujimori'],
            ['type' => 'district',  'slug' => 'piura',          'name' => 'Piura'],
        ]]));
        $this->assertFalse($v->fails(), json_encode($v->errors()->all()));
    }

    public function test_accepts_signal_without_entities(): void
    {
        $this->assertFalse($this->validate($this->baseSignal())->fails());
    }

    public function test_rejects_invalid_entity_type(): void
    {
        $v = $this->validate($this->baseSignal(['entities' => [
            ['type' => 'animal', 'slug' => 'x', 'name' => 'X'],
        ]]));
        $this->assertTrue($v->fails());
        $this->assertArrayHasKey('signals.0.entities.0.type', $v->errors()->toArray());
    }

    public function test_rejects_entity_missing_slug(): void
    {
        $v = $this->validate($this->baseSignal(['entities' => [
            ['type' => 'party', 'name' => 'Fuerza Popular'],
        ]]));
        $this->assertTrue($v->fails());
        $this->assertArrayHasKey('signals.0.entities.0.slug', $v->errors()->toArray());
    }

    // ─── Cast + persistencia (round-trip de modelo) ──────────────────

    public function test_persists_entities_and_casts_back_to_array(): void
    {
        $entities = [
            ['type' => 'candidate', 'slug' => 'keiko-fujimori', 'name' => 'Keiko Fujimori'],
            ['type' => 'candidate', 'slug' => 'cesar-acuna',    'name' => 'César Acuña'],
            ['type' => 'district',  'slug' => 'piura',          'name' => 'Piura'],
        ];

        $id = ExternalSignal::create([
            'source'      => 'news',
            'source_url'  => 'https://example.pe/nota-' . uniqid(),
            'content'     => 'texto',
            'entities'    => $entities,
            'captured_at' => now(),
        ])->id;

        // MySQL reordena las claves del objeto JSON (alfabético), por eso
        // assertEquals (compara pares clave/valor) y no assertSame (orden).
        $fresh = ExternalSignal::find($id);
        $this->assertEquals($entities, $fresh->entities);
        $this->assertCount(3, $fresh->entities);
    }

    public function test_legacy_signal_without_entities_is_null(): void
    {
        $id = ExternalSignal::create([
            'source'      => 'news',
            'source_url'  => 'https://example.pe/nota-' . uniqid(),
            'content'     => 'texto',
            'captured_at' => now(),
        ])->id;

        $this->assertNull(ExternalSignal::find($id)->entities);
    }
}
