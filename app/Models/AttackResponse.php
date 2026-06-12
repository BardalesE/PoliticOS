<?php

namespace App\Models;

use App\Services\TenantContext;
use Illuminate\Database\Eloquent\Model;

class AttackResponse extends Model
{
    protected $fillable = [
        'attack_keyword','synonyms','attack_category','response_template',
        'deflection_topic','priority','is_active','times_used',
    ];

    protected $casts = [
        'synonyms' => 'array',
        'is_active' => 'boolean',
    ];

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }

    /**
     * Devuelve respuestas activas con keywords combinadas para detección rápida.
     */
    public static function detectionMap(): array
    {
        $cache = cache()->remember(TenantContext::cacheKey('attack_responses_map'), 300, function () {
            return static::active()
                ->orderByDesc('priority')
                ->get()
                ->map(fn($r) => [
                    'id' => $r->id,
                    'keywords' => array_merge([$r->attack_keyword], $r->synonyms ?? []),
                    'category' => $r->attack_category,
                    'template' => $r->response_template,
                    'deflection_topic' => $r->deflection_topic,
                ])->all();
        });
        return $cache;
    }
}
