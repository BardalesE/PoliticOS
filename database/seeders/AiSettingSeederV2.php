<?php

namespace Database\Seeders;

use App\Models\AiSetting;
use Illuminate\Database\Seeder;

/**
 * Configura AI Setting con el prompt v2 (PoliticOS).
 *
 * Idempotente: si ya existe, lo actualiza al v2.
 * Si quieres conservar customizaciones previas, eliminá esta migración.
 */
class AiSettingSeederV2 extends Seeder
{
    public function run(): void
    {
        $promptPath = base_path('resources/prompts/politicos_v2_prompt.txt');
        $prompt = file_exists($promptPath)
            ? file_get_contents($promptPath)
            : 'Eres el asistente virtual del candidato.';

        AiSetting::updateOrCreate(
            ['id' => 1],
            [
                'provider'          => env('AI_PROVIDER', 'groq'),
                'model'             => env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
                'fallback_provider' => 'claude',
                'temperature'       => 0.65,
                'max_tokens'        => 700,
                'system_prompt'     => $prompt,
            ]
        );
    }
}
