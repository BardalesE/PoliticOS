<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class District extends Model
{
    protected $fillable = [
        'name', 'keywords', 'sort_order', 'is_active',
        'visited_at', 'event_type', 'highlight_text', 'highlight_photo_url',
    ];

    protected $casts = [
        'keywords'   => 'array',
        'is_active'  => 'boolean',
        'visited_at' => 'date:Y-m-d',
    ];

    public static function activeKeywordsMap(): array
    {
        return static::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->mapWithKeys(fn($d) => [$d->name => $d->keywords])
            ->all();
    }

    // Lugares con capa de campaña real (visited_at) — la home pública solo
    // muestra "Lugares Visitados" que efectivamente tienen fecha de visita,
    // no todo el listado de distritos usado para enrutar el chat.
    public static function visitedPublic()
    {
        return static::where('is_active', true)
            ->whereNotNull('visited_at')
            ->orderByDesc('visited_at')
            ->get(['id', 'name', 'visited_at', 'event_type', 'highlight_text', 'highlight_photo_url']);
    }
}
