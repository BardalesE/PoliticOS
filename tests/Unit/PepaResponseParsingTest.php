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

    /**
     * Invoca mediaFromSources() vía reflexión, con $retrievedDocUrls precargado
     * como si buildContext() ya hubiera corrido el RAG de este turno.
     */
    private function mediaFromSources(array $citedUrls, array $retrievedDocUrls): array
    {
        $svc = $this->service();
        $ref = new ReflectionClass($svc);

        $config = $ref->getProperty('config');
        $config->setAccessible(true);
        $config->setValue($svc, new AiSetting(['mode' => 'pepa']));

        $retrieved = $ref->getProperty('retrievedDocUrls');
        $retrieved->setAccessible(true);
        $retrieved->setValue($svc, $retrievedDocUrls);

        $method = $ref->getMethod('mediaFromSources');
        $method->setAccessible(true);

        return $method->invoke($svc, $citedUrls);
    }

    /**
     * Invoca buildDocumentationSection() vía reflexión — el filtro de docs con
     * excerpt vacío y el guard "sin documentos" viven ahí, sin tocar Proposal/
     * Faq/QuestionCluster ni la BD real (ver docblock de PepaResponseParsingTest).
     * Devuelve tanto el texto como $retrievedDocUrls (misma instancia, para
     * verificar que un doc filtrado tampoco deja su URL en la lista blanca de
     * mediaFromSources()).
     */
    private function documentationSection(array $docs, bool $isPepa): array
    {
        $svc = $this->service();
        $ref = new ReflectionClass($svc);

        $method = $ref->getMethod('buildDocumentationSection');
        $method->setAccessible(true);
        $text = $method->invoke($svc, $docs, $isPepa);

        $prop = $ref->getProperty('retrievedDocUrls');
        $prop->setAccessible(true);

        return ['text' => $text, 'retrievedDocUrls' => $prop->getValue($svc)];
    }

    private function docResult(string $excerpt, string $sourceUrl = ''): array
    {
        return [
            'document_id' => 1,
            'title'       => 'Plan de gobierno 2026-2030',
            'excerpt'     => $excerpt,
            'score'       => 1.0,
            'metadata'    => ['source_url' => $sourceUrl ?: null, 'file_url' => null],
        ];
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

    private function truncateToTokenBudget(string $text, int $maxTokens): string
    {
        $svc = $this->service();
        $ref = new ReflectionClass($svc);

        $method = $ref->getMethod('truncateToTokenBudget');
        $method->setAccessible(true);

        return $method->invoke($svc, $text, $maxTokens);
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

    /**
     * DIAGNOSTICO_CHAT.md hallazgo #3: el LLM puede citar una URL bien formada
     * que nunca vino de un documento del RAG. mediaFromSources() debe descartarla
     * en vez de mostrarla como "Fuente verificada".
     */
    public function test_media_from_sources_drops_url_not_in_retrieved_docs(): void
    {
        $media = $this->mediaFromSources(
            ['https://inventado-por-el-llm.example/plan.pdf'],
            ['https://jne.gob.pe/plan-real.pdf'] // lo único que el RAG recuperó este turno
        );

        $this->assertSame([], $media);
    }

    public function test_media_from_sources_keeps_url_that_matches_retrieved_docs(): void
    {
        $media = $this->mediaFromSources(
            ['https://jne.gob.pe/plan-real.pdf'],
            ['https://jne.gob.pe/plan-real.pdf', 'https://jne.gob.pe/hoja-de-vida.pdf']
        );

        $this->assertCount(1, $media);
        $this->assertSame('link', $media[0]['type']);
        $this->assertSame('https://jne.gob.pe/plan-real.pdf', $media[0]['url']);
        $this->assertSame('Fuente verificada', $media[0]['title']);
    }

    public function test_media_from_sources_filters_mixed_batch_keeping_only_trusted(): void
    {
        $media = $this->mediaFromSources(
            ['https://jne.gob.pe/plan-real.pdf', 'https://inventado.example/x.pdf'],
            ['https://jne.gob.pe/plan-real.pdf']
        );

        $this->assertCount(1, $media);
        $this->assertSame('https://jne.gob.pe/plan-real.pdf', $media[0]['url']);
    }

    public function test_media_from_sources_drops_everything_when_rag_retrieved_nothing(): void
    {
        // Caso real detectado en el audit: KnowledgeDocument.content = NULL →
        // buildContext() nunca llena retrievedDocUrls, pero el LLM igual citó algo.
        $media = $this->mediaFromSources(['https://cualquier-cosa.example/doc.pdf'], []);

        $this->assertSame([], $media);
    }

    /**
     * RAG_VACIO.md: caso real de bdpolitic — el único doc "encontrado" tiene
     * excerpt vacío (KnowledgeDocument.content NULL, matcheó solo por título).
     * Debe descartarse y aparecer el guard, no una sección vacía ni silencio.
     */
    public function test_documentation_section_drops_doc_with_empty_excerpt_and_shows_guard(): void
    {
        $result = $this->documentationSection(
            [$this->docResult('', 'https://www.w3.org/dummy.pdf')],
            true
        );

        $this->assertStringContainsString('no tengo información en los documentos del candidato', $result['text']);
        $this->assertStringNotContainsString('DOCUMENTACIÓN VERIFICADA', $result['text']);
        // El doc descartado tampoco puede dejar su URL en la lista blanca de mediaFromSources().
        $this->assertSame([], $result['retrievedDocUrls']);
    }

    public function test_documentation_section_shows_guard_when_search_returns_nothing(): void
    {
        $result = $this->documentationSection([], true);

        $this->assertStringContainsString('no tengo información en los documentos del candidato', $result['text']);
        $this->assertSame([], $result['retrievedDocUrls']);
    }

    public function test_documentation_section_keeps_doc_with_real_excerpt_pepa_mode(): void
    {
        $result = $this->documentationSection(
            [$this->docResult('Contenido real del plan de gobierno...', 'https://jne.gob.pe/plan.pdf')],
            true
        );

        $this->assertStringContainsString('DOCUMENTACIÓN VERIFICADA POR CANDIDATO', $result['text']);
        $this->assertStringContainsString('Contenido real del plan de gobierno', $result['text']);
        $this->assertStringNotContainsString('no tengo información en los documentos', $result['text']);
        $this->assertSame(['https://jne.gob.pe/plan.pdf'], $result['retrievedDocUrls']);
    }

    public function test_documentation_section_keeps_doc_with_real_excerpt_campaign_mode(): void
    {
        $result = $this->documentationSection(
            [$this->docResult('Contenido real del plan de gobierno...', 'https://jne.gob.pe/plan.pdf')],
            false
        );

        $this->assertStringContainsString('DOCUMENTACIÓN OFICIAL', $result['text']);
        $this->assertStringContainsString('Contenido real del plan de gobierno', $result['text']);
        $this->assertStringNotContainsString('no tengo información en los documentos', $result['text']);
    }

    /**
     * Lote mixto: un doc real + uno vacío (título-only match). Se queda solo
     * con el real — ni el guard aparece (sí hay algo utilizable) ni la URL del
     * vacío se cuela en retrievedDocUrls.
     */
    public function test_documentation_section_filters_mixed_batch_keeping_only_real_doc(): void
    {
        $real  = $this->docResult('Contenido real y verificable.', 'https://jne.gob.pe/real.pdf');
        $vacio = array_merge($this->docResult('', 'https://www.w3.org/dummy.pdf'), ['document_id' => 2, 'title' => 'Hoja de vida']);

        $result = $this->documentationSection([$real, $vacio], true);

        $this->assertStringContainsString('Contenido real y verificable', $result['text']);
        $this->assertStringNotContainsString('Hoja de vida', $result['text']);
        $this->assertStringNotContainsString('no tengo información en los documentos', $result['text']);
        $this->assertSame(['https://jne.gob.pe/real.pdf'], $result['retrievedDocUrls']);
    }

    public function test_effective_max_tokens_floors_pepa_to_minimum(): void
    {
        // Tenant ya provisionado con 600 guardado en su DB → se eleva al piso.
        $this->assertSame(1200, $this->effectiveMaxTokens('pepa', 600));
    }

    /**
     * feat/cuotas-ia — CAMBIO DE COMPORTAMIENTO respecto a la versión anterior
     * de este test (que esperaba 2000, ver git blame). MIN_MAX_TOKENS (piso
     * anti-truncamiento JSON, 1200) y QUOTA_MAX_OUTPUT_TOKENS (techo duro de
     * cuota, 500) son matemáticamente incompatibles: 500 < 1200, así que
     * max(min(configured, 500), 1200) SIEMPRE da 1200 sin importar qué
     * configure el admin — ni 600, ni 2000, ni 8000. effectiveMaxTokens() dejó
     * de ser "el piso, salvo que el admin pida más" y pasó a ser un valor fijo
     * en la práctica. Es una consecuencia documentada y deliberada del límite
     * de cuota pedido (ver comentario en CivicAIService::QUOTA_MAX_OUTPUT_TOKENS),
     * no un bug — pero si algún día el negocio quiere que "2000" vuelva a
     * respetarse, hay que resolver el conflicto ahí, no acá.
     */
    public function test_effective_max_tokens_higher_admin_value_ahora_queda_topado_por_la_cuota(): void
    {
        $this->assertSame(1200, $this->effectiveMaxTokens('pepa', 2000));
    }

    public function test_effective_max_tokens_floors_campaign_too(): void
    {
        // Antes el piso solo aplicaba en modo PEPA — un tenant con 600 en modo
        // campaña truncaba respuestas sin ninguna protección. Ahora el piso
        // aplica a ambos modos (ver CivicAIService::MIN_MAX_TOKENS).
        $this->assertSame(1200, $this->effectiveMaxTokens('campaign', 600));
    }

    /** Ver docblock de test_effective_max_tokens_higher_admin_value_ahora_queda_topado_por_la_cuota(). */
    public function test_effective_max_tokens_higher_admin_value_en_campaign_tambien_queda_topado(): void
    {
        $this->assertSame(1200, $this->effectiveMaxTokens('campaign', 2000));
    }

    public function test_effective_max_tokens_nunca_baja_de_1200_aunque_lo_configurado_sea_menor_a_la_cuota(): void
    {
        // configured=300 < QUOTA_MAX_OUTPUT_TOKENS=500 < MIN_MAX_TOKENS=1200:
        // el piso anti-truncamiento sigue ganando incluso cuando ni siquiera
        // hace falta el paso por la cuota para explicarlo.
        $this->assertSame(1200, $this->effectiveMaxTokens('pepa', 300));
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

    // ─── feat/cuotas-ia: truncateToTokenBudget() (límite duro de RAG) ──────

    public function test_truncate_to_token_budget_no_toca_texto_corto(): void
    {
        $text = str_repeat('a', 100);

        $this->assertSame($text, $this->truncateToTokenBudget($text, 4000));
    }

    public function test_truncate_to_token_budget_corta_texto_largo_y_avisa(): void
    {
        // ~4 chars/token (aproximación documentada en CivicAIService — no hay
        // tokenizer real de Groq/Llama disponible en PHP): 4000 tokens ≈
        // 16000 chars. Con 20000 chars debe cortar y agregar el aviso.
        $text = str_repeat('a', 20000);

        $result = $this->truncateToTokenBudget($text, 4000);

        $this->assertLessThan(mb_strlen($text), mb_strlen($result));
        $this->assertStringContainsString('[... contexto truncado por límite de cuota]', $result);
        // El contenido real cortado (antes del "\n" + aviso) es exactamente
        // maxTokens * 4 chars, ni uno más.
        $this->assertStringStartsWith(mb_substr($text, 0, 16000) . "\n", $result);
    }

    public function test_truncate_to_token_budget_respeta_el_limite_exacto(): void
    {
        $text = str_repeat('a', 16000); // exactamente 4000 tokens aprox.

        $this->assertSame($text, $this->truncateToTokenBudget($text, 4000));
    }
}
