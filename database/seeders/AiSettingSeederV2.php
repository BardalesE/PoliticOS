<?php

namespace Database\Seeders;

use App\Models\AiSetting;
use Illuminate\Database\Seeder;

/**
 * Configura AI Setting con el prompt PEPA (asistente cívico neutral) — el
 * default para tenants nuevos desde la Fase 3. El modo campaña
 * (politicos_v2_prompt.txt) es opt-in desde /admin/ai-settings.
 *
 * Idempotente: si ya existe, lo actualiza.
 * Si quieres conservar customizaciones previas, no re-ejecutes este seeder.
 */
class AiSettingSeederV2 extends Seeder
{
    public function run(): void
    {
        $promptPath = base_path('resources/prompts/pepa_prompt.txt');
        $prompt = file_exists($promptPath)
            ? file_get_contents($promptPath)
            : 'Eres un asistente cívico neutral.';

        AiSetting::updateOrCreate(
            ['id' => 1],
            [
                'provider'          => env('AI_PROVIDER', 'groq'),
                'model'             => env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
                'fallback_provider' => 'claude',
                'temperature'       => 0.65,
                'max_tokens'        => 700,
                'system_prompt'     => $prompt,
                'mode'              => 'pepa',
            ]
        );
    }
}
