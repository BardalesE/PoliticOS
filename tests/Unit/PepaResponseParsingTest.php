<?php

namespace Tests\Unit;

use App\Models\AiSetting;
use App\Services\CivicAIService;
use App\Services\EmbeddingsServiceInterface;
use ReflectionClass;
use Tests\TestCase;

/**
 * Verifica que el output estructurado de PEPA nunca filtre metadata_interna al
 * usuario, incluso cuando el LLM (Groq/Llama) rompe el formato JSON.
 *
 * Prueba directamente parseAIResponse() vía reflexión para aislar el contrato
 * de parseo del resto del pipeline RAG (que requiere DB y red).
 */
class PepaResponseParsingTest extends TestCase
{
    private function service(): CivicAIService
    {
        $embeddings = new class implements EmbeddingsServiceInterface {
            public function index(int $documentId, string $content, array $metadata = []): void {}
            public function search(string $query, int $topK = 5, array $filter = []): array { return []; }
            public function delete(int $documentId): void {}
        };

        return new CivicAIService($embeddings);
    }

    private function parse(string $raw, string $mode): array
    {
        $svc = $this->service();
        $ref = new ReflectionClass($svc);

        // Inyecta una config con el modo deseado sin tocar la DB.
        $config = $ref->getProperty('config');
        $config->setAccessible(true);
        $config->setValue($svc, new AiSetting(['mode' => $mode]));

        $method = $ref->getMethod('parseAIResponse');
        $method->setAccessible(true);

        return $method->invoke($svc, $raw);
    }

    private function effectiveMaxTokens(?string $mode, ?int $maxTokens): int
    {
        $svc = $this->service();
        $ref = new ReflectionClass($svc);

        $attrs = [];
        if ($mode !== null)      $attrs['mode'] = $mode;
        if ($maxTokens !== null) $attrs['max_tokens'] = $maxTokens;

        $config = $ref->getProperty('config');
        $config->setAccessible(true);
        $config->setValue($svc, new AiSetting($attrs));

        $method = $ref->getMethod('effectiveMaxTokens');
        $method->setAccessible(true);

        return $method->invoke($svc);
    }

    private function validJson(): string
    {
        return json_encode([
            'respuesta_usuario' => 'Hola, ¿de dónde escribes? 🇵🇪',
            'metadata_interna'  => [
                'region_confirmada' => 'lima_metropolitana',
                'nse_inferido'      => 'C',
                'emocion_dominante' => 'curiosidad',
                'postura_actual'    => 'indeciso',
                'cambio_de_opinion' => 'aun_no_evaluable',
                'fuentes_citadas'   => ['https://jne.gob.pe/plan.pdf'],
            ],
        ], JSON_UNESCAPED_UNICODE);
    }

    public function test_pepa_valid_json_extracts_reply_and_preserves_metadata(): void
    {
        $r = $this->parse($this->validJson(), 'pepa');

        $this->assertSame('Hola, ¿de dónde escribes? 🇵🇪', $r['reply']);
        $this->assertIsArray($r['pepa_metadata']);
        $this->assertSame('C', $r['pepa_metadata']['nse_inferido']);
        $this->assertSame(['https://jne.gob.pe/plan.pdf'], $r['pepa_metadata']['fuentes_citadas']);
    }

    public function test_pepa_json_wrapped_in_prose_is_extracted_without_leak(): void
    {
        $raw = "Claro, aquí va mi respuesta:\n\n" . $this->validJson() . "\n\n¡Espero te sirva!";
        $r = $this->parse($raw, 'pepa');

        $this->assertSame('Hola, ¿de dónde escribes? 🇵🇪', $r['reply']);
        $this->assertSame('C', $r['pepa_metadata']['nse_inferido']);
        $this->assertStringNotContainsString('metadata_interna', $r['reply']);
        $this->assertStringNotContainsString('nse_inferido', $r['reply']);
    }

    public function test_pepa_json_in_markdown_fences_is_extracted(): void
    {
        $raw = "```json\n" . $this->validJson() . "\n```";
        $r = $this->parse($raw, 'pepa');

        $this->assertSame('Hola, ¿de dónde escribes? 🇵🇪', $r['reply']);
        $this->assertStringNotContainsString('metadata_interna', $r['reply']);
    }

    public function test_pepa_truncated_json_falls_back_without_leaking_metadata(): void
    {
        // JSON cortado a la mitad (Llama agotó max_tokens) → no es parseable.
        $raw = substr($this->validJson(), 0, 80);
        $r = $this->parse($raw, 'pepa');

        $this->assertNull($r['pepa_metadata']);
        $this->assertStringNotContainsString('metadata_interna', $r['reply']);
        $this->assertStringNotContainsString('nse_inferido', $r['reply']);
        $this->assertStringNotContainsString('respuesta_usuario', $r['reply']);
        $this->assertNotEmpty($r['reply']);
    }

    public function test_pepa_garbage_output_falls_back_without_leak(): void
    {
        $raw = 'Lo siento, no entiendo bien la pregunta. (sin JSON)';
        $r = $this->parse($raw, 'pepa');

        // Sin respuesta_usuario válido → fallback genérico, no el crudo.
        $this->assertNull($r['pepa_metadata']);
        $this->assertStringNotContainsString('(sin JSON)', $r['reply']);
        $this->assertNotEmpty($r['reply']);
    }

    public function test_campaign_plain_text_passes_through(): void
    {
        $raw = 'El agua en San Miguel es mi prioridad, paisano.';
        $r = $this->parse($raw, 'campaign');

        $this->assertSame($raw, $r['reply']);
        $this->assertNull($r['pepa_metadata']);
    }

    public function test_campaign_raw_pepa_contract_does_not_leak(): void
    {
        // Aunque el output traiga el contrato JSON, en campaña tampoco se filtra crudo.
        $raw = '{"respuesta_usuario": "ok", "metadata_interna": {"nse_inferido": "A"';
        $r = $this->parse($raw, 'campaign');

        $this->assertStringNotContainsString('metadata_interna', $r['reply']);
        $this->assertStringNotContainsString('nse_inferido', $r['reply']);
    }

    /**
     * Respuesta larga y verbosa (comparación multi-candidato del turno 2) que
     * antes truncaba a 600 tokens: con el techo ampliado el JSON llega completo y
     * debe parsear sin perder metadata ni recortar respuesta_usuario.
     */
    public function test_pepa_large_valid_json_parses_fully(): void
    {
        $longReply = str_repeat(
            'Pérez propone más cámaras y serenazgo; García apuesta por prevención y empleo juvenil. ',
            8
        );
        $raw = json_encode([
            'respuesta_usuario' => $longReply,
            'metadata_interna'  => [
                'region_confirmada' => 'lima_metropolitana',
                'nse_inferido'      => 'C',
                'tema_dominante'    => 'seguridad',
                'emocion_dominante' => 'bronca',
                'postura_actual'    => 'indeciso entre mano dura y prevención',
                'cambio_de_opinion' => 'aun_no_evaluable',
                'fuentes_citadas'   => ['https://jne.gob.pe/a.pdf', 'https://jne.gob.pe/b.pdf'],
            ],
        ], JSON_UNESCAPED_UNICODE);

        $r = $this->parse($raw, 'pepa');

        $this->assertSame(trim($longReply), $r['reply']);
        $this->assertGreaterThan(400, mb_strlen($r['reply']));
        $this->assertSame('seguridad', $r['pepa_metadata']['tema_dominante']);
        $this->assertCount(2, $r['pepa_metadata']['fuentes_citadas']);
    }

    public function test_effective_max_tokens_floors_pepa_to_minimum(): void
    {
        // Tenant ya provisionado con 600 guardado en su DB → se eleva al piso.
        $this->assertSame(1200, $this->effectiveMaxTokens('pepa', 600));
    }

    public function test_effective_max_tokens_respects_higher_admin_value_in_pepa(): void
    {
        // Si el admin configuró más que el piso, se respeta.
        $this->assertSame(2000, $this->effectiveMaxTokens('pepa', 2000));
    }

    public function test_effective_max_tokens_leaves_campaign_untouched(): void
    {
        $this->assertSame(600, $this->effectiveMaxTokens('campaign', 600));
    }

    /**
     * Guarda contra regresión del schema: los campos que auditamos como muertos
     * fueron eliminados del prompt PEPA (reducen tokens sin perder consumo real).
     */
    public function test_pepa_prompt_drops_unused_schema_fields(): void
    {
        $prompt = file_get_contents(base_path('resources/prompts/pepa_prompt.txt'));

        $this->assertStringNotContainsString('"argumento_decisivo"', $prompt);
        $this->assertStringNotContainsString('"siguiente_pregunta_sugerida"', $prompt);

        // Los consumidos downstream siguen en el contrato.
        foreach (['respuesta_usuario', 'fuentes_citadas', 'tema_dominante',
                  'postura_actual', 'cambio_de_opinion', 'region_confirmada'] as $field) {
            $this->assertStringContainsString($field, $prompt);
        }
    }
}
