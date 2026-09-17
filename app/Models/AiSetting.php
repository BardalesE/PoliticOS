<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiSetting extends Model
{
    // Mapeo modo -> archivo de prompt por defecto. Fuente única de verdad
    // para el acoplamiento mode -> system_prompt (ver defaultPromptForMode()
    // y AiSettingController::update()).
    public const DEFAULT_PROMPT_FILES = [
        'campaign' => 'politicos_v2_prompt.txt',
        'pepa'     => 'pepa_prompt.txt',
    ];

    protected $fillable = [
        'provider', 'api_key', 'model', 'max_tokens', 'temperature',
        'fallback_provider', 'system_prompt', 'system_prompt_customizado', 'mode',
        'chat_subtitle', 'chat_btn_text', 'chat_btn_image_url',
        'chat_btn_shape', 'chat_btn_color', 'chat_btn_size', 'chat_btn_position',
        'attack_spike_threshold',
    ];

    // api_key nunca sale de la BD en texto plano — Laravel cifra/descifra
    // transparentemente con APP_KEY. No la expongas en respuestas JSON: usa
    // $setting->api_key !== null en su lugar (ver AiSettingController::show()).
    protected $hidden = ['api_key'];

    protected $casts = [
        'max_tokens'                => 'integer',
        'temperature'               => 'float',
        'api_key'                   => 'encrypted',
        'attack_spike_threshold'    => 'integer',
        'system_prompt_customizado' => 'boolean',
    ];

    public static function current(): self
    {
        return static::firstOrCreate([], [
            'provider'         => config('services.ai.provider', 'groq'),
            'model'            => config('services.ai.groq_model', 'llama-3.3-70b-versatile'),
            'max_tokens'       => 1200,
            'temperature'      => 0.4,
            'fallback_provider' => 'claude',
            'system_prompt'     => '',
            'system_prompt_customizado' => false,
            'chat_subtitle'     => 'IA · 24/7',
            'chat_btn_text'     => null,
            'chat_btn_image_url'=> null,
            'chat_btn_shape'    => 'pill',
            'chat_btn_color'    => null,
            'chat_btn_size'     => 'md',
            'chat_btn_position' => 'bottom-right',
            'attack_spike_threshold' => 10,
        ]);
    }

    // Prompt de fábrica para un modo dado (DEFAULT_PROMPT_FILES). Usado al
    // resincronizar system_prompt cuando el admin cambia `mode` sin haber
    // personalizado el prompt (system_prompt_customizado === false).
    public static function defaultPromptForMode(string $mode): string
    {
        $file = self::DEFAULT_PROMPT_FILES[$mode] ?? self::DEFAULT_PROMPT_FILES['campaign'];
        $path = base_path("resources/prompts/{$file}");

        return file_exists($path) ? (file_get_contents($path) ?: '') : '';
    }
}
