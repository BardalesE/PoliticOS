<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiSetting extends Model
{
    protected $fillable = [
        'provider', 'model', 'max_tokens', 'temperature',
        'fallback_provider', 'system_prompt', 'mode',
        'chat_subtitle', 'chat_btn_text', 'chat_btn_image_url',
        'chat_btn_shape', 'chat_btn_color', 'chat_btn_size', 'chat_btn_position',
    ];

    protected $casts = [
        'max_tokens'  => 'integer',
        'temperature' => 'float',
    ];

    public static function current(): self
    {
        return static::firstOrCreate([], [
            'provider'         => config('services.ai.provider', 'groq'),
            'model'            => config('services.ai.groq_model', 'llama-3.3-70b-versatile'),
            'max_tokens'       => 1200,
            'temperature'      => 0.65,
            'fallback_provider' => 'claude',
            'system_prompt'     => '',
            'chat_subtitle'     => 'IA · 24/7',
            'chat_btn_text'     => null,
            'chat_btn_image_url'=> null,
            'chat_btn_shape'    => 'pill',
            'chat_btn_color'    => null,
            'chat_btn_size'     => 'md',
            'chat_btn_position' => 'bottom-right',
        ]);
    }
}
