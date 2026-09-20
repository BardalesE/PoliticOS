<?php

namespace Tests\Unit;

use App\Models\AiSetting;
use Tests\TestCase;

/**
 * Groq retiró llama-3.3-70b-versatile (16-ago-2026) y otros: seguir mandándolos
 * da 404 y cada respuesta cae al proveedor de respaldo de pago sin avisar.
 */
class GroqModelosRetiradosTest extends TestCase
{
    public function test_retired_models_are_replaced_by_the_current_equivalent(): void
    {
        $this->assertSame('openai/gpt-oss-120b', AiSetting::effectiveGroqModel('llama-3.3-70b-versatile'));
        $this->assertSame('openai/gpt-oss-20b', AiSetting::effectiveGroqModel('llama-3.1-8b-instant'));
        $this->assertSame('openai/gpt-oss-20b', AiSetting::effectiveGroqModel('mixtral-8x7b-32768'));
        $this->assertSame('openai/gpt-oss-20b', AiSetting::effectiveGroqModel('gemma2-9b-it'));
    }

    public function test_current_models_pass_through_untouched(): void
    {
        $this->assertSame('openai/gpt-oss-20b', AiSetting::effectiveGroqModel('openai/gpt-oss-20b'));
        $this->assertSame('qwen/qwen3.6-27b', AiSetting::effectiveGroqModel('qwen/qwen3.6-27b'));
    }

    public function test_empty_model_uses_the_configured_default_and_even_that_is_remapped(): void
    {
        config(['services.ai.groq_model' => 'openai/gpt-oss-20b']);
        $this->assertSame('openai/gpt-oss-20b', AiSetting::effectiveGroqModel(null));

        // Un GROQ_MODEL viejo en el .env de Render tampoco debe llegar a Groq.
        config(['services.ai.groq_model' => 'llama-3.3-70b-versatile']);
        $this->assertSame('openai/gpt-oss-120b', AiSetting::effectiveGroqModel(''));
    }
}
